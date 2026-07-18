import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownUp, CreditCard, MessageSquare } from "lucide-react";

import { CreditStamp } from "@/components/credit-stamp";
import { isProviderId, ProviderMark } from "@/components/provider-mark";
import { Wordmark } from "@/components/wordmark";
import { calculateUsageCost } from "@/lib/cost";
import type { ProviderId } from "@/lib/models";
import { createClient } from "@/lib/supabase/server";

type StatsSearchParams = Promise<{
  sort?: string;
  dir?: string;
  chatId?: string;
}>;

type UsageEvent = {
  id: string;
  chat_id: string;
  message_id: string;
  provider: ProviderId;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  input_cost_usd?: number | string | null;
  output_cost_usd?: number | string | null;
  cached_cost_usd?: number | string | null;
  total_cost_usd?: number | string | null;
  created_at: string;
};

type ChatRow = {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  chat_id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  created_at: string;
  seq: number;
};

type CreditLedgerRow = {
  delta: number;
  reference_id: string | null;
  created_at: string;
};

type MoneyBreakdown = {
  input: number;
  output: number;
  cached: number;
  total: number;
};

type ChatStats = {
  id: string;
  title: string;
  provider: string;
  model: string;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: MoneyBreakdown;
  creditsSpent: number;
  createdAt: string;
};

function numberValue(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value) || 0;
  }

  return 0;
}

function eventCost(event: UsageEvent): MoneyBreakdown {
  const stored = {
    input: numberValue(event.input_cost_usd),
    output: numberValue(event.output_cost_usd),
    cached: numberValue(event.cached_cost_usd),
    total: numberValue(event.total_cost_usd),
  };

  if (stored.total > 0 || event.input_tokens + event.output_tokens + event.cached_input_tokens === 0) {
    return stored;
  }

  const computed = calculateUsageCost({
    provider: event.provider,
    model: event.model,
    input_tokens: event.input_tokens,
    output_tokens: event.output_tokens,
    cached_input_tokens: event.cached_input_tokens,
  });

  return {
    input: computed.input_cost_usd,
    output: computed.output_cost_usd,
    cached: computed.cached_cost_usd,
    total: computed.total_cost_usd,
  };
}

function addCost(a: MoneyBreakdown, b: MoneyBreakdown): MoneyBreakdown {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cached: a.cached + b.cached,
    total: a.total + b.total,
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 6 : 2,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function sortLink(sort: string, currentSort: string, currentDir: string, selectedChatId?: string) {
  const nextDir = currentSort === sort && currentDir === "desc" ? "asc" : "desc";
  const params = new URLSearchParams({ sort, dir: nextDir });
  if (selectedChatId) {
    params.set("chatId", selectedChatId);
  }
  return `/app/stats?${params.toString()}`;
}

function CostSplit({ cost }: { cost: MoneyBreakdown }) {
  return (
    <div className="mt-1 hidden whitespace-nowrap font-mono text-[0.62rem] leading-4 text-ink-muted xl:block">
      in {formatMoney(cost.input)} · out {formatMoney(cost.output)} · cached {formatMoney(cost.cached)}
    </div>
  );
}

function providerAndModel(events: UsageEvent[], fallbackModel: string) {
  const counts = new Map<string, { provider: string; model: string; tokens: number }>();
  events.forEach((event) => {
    const key = `${event.provider}:${event.model}`;
    const previous = counts.get(key) ?? { provider: event.provider, model: event.model, tokens: 0 };
    previous.tokens += event.input_tokens + event.output_tokens;
    counts.set(key, previous);
  });

  return [...counts.values()].sort((a, b) => b.tokens - a.tokens)[0] ?? {
    provider: "n/a",
    model: fallbackModel,
    tokens: 0,
  };
}

export default async function StatsPage({ searchParams }: { searchParams: StatsSearchParams }) {
  const params = await searchParams;
  const currentSort = params.sort === "cost" ? "cost" : "date";
  const currentDir = params.dir === "asc" ? "asc" : "desc";
  const selectedChatId = params.chatId;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: wallet }, { data: chats = [] }, { data: messages = [] }, { data: usageEvents = [] }, { data: ledger = [] }] =
    await Promise.all([
      supabase.from("credit_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("chats")
        .select("id, title, model, created_at, updated_at")
        .eq("user_id", user.id)
        .eq("archived", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("messages")
        .select("id, chat_id, role, content, created_at, seq")
        .order("seq", { ascending: true }),
      supabase
        .from("usage_events")
        .select("id, chat_id, message_id, provider, model, input_tokens, output_tokens, cached_input_tokens, input_cost_usd, output_cost_usd, cached_cost_usd, total_cost_usd, created_at")
        .order("created_at", { ascending: true }),
      supabase
        .from("credit_ledger")
        .select("delta, reference_id, created_at")
        .eq("user_id", user.id)
        .eq("reason", "agent_turn_debit")
        .order("created_at", { ascending: true }),
    ]);

  const chatRows = (chats ?? []) as ChatRow[];
  const messageRows = (messages ?? []) as MessageRow[];
  const usageRows = (usageEvents ?? []) as UsageEvent[];
  const ledgerRows = (ledger ?? []) as CreditLedgerRow[];
  const messagesByChat = new Map<string, MessageRow[]>();
  const usageByChat = new Map<string, UsageEvent[]>();
  const debitsByMessage = new Map<string, number>();

  messageRows.forEach((message) => {
    messagesByChat.set(message.chat_id, [...(messagesByChat.get(message.chat_id) ?? []), message]);
  });
  usageRows.forEach((event) => {
    usageByChat.set(event.chat_id, [...(usageByChat.get(event.chat_id) ?? []), event]);
  });
  ledgerRows.forEach((row) => {
    if (row.reference_id) {
      debitsByMessage.set(row.reference_id, (debitsByMessage.get(row.reference_id) ?? 0) + Math.abs(row.delta));
    }
  });

  const stats = chatRows.map((chat): ChatStats => {
    const chatMessages = messagesByChat.get(chat.id) ?? [];
    const chatUsage = usageByChat.get(chat.id) ?? [];
    const identity = providerAndModel(chatUsage, chat.model);
    const assistantIds = new Set(chatMessages.filter((message) => message.role === "assistant").map((message) => message.id));
    const cost = chatUsage.reduce(
      (acc, event) => addCost(acc, eventCost(event)),
      { input: 0, output: 0, cached: 0, total: 0 },
    );

    return {
      id: chat.id,
      title: chat.title,
      provider: identity.provider,
      model: identity.model,
      messageCount: chatMessages.filter((message) => message.role === "user" || message.role === "assistant").length,
      inputTokens: chatUsage.reduce((sum, event) => sum + event.input_tokens, 0),
      outputTokens: chatUsage.reduce((sum, event) => sum + event.output_tokens, 0),
      cachedTokens: chatUsage.reduce((sum, event) => sum + event.cached_input_tokens, 0),
      cost,
      creditsSpent: [...assistantIds].reduce((sum, id) => sum + (debitsByMessage.get(id) ?? 0), 0),
      createdAt: chat.created_at,
    };
  });

  stats.sort((a, b) => {
    const direction = currentDir === "asc" ? 1 : -1;
    if (currentSort === "cost") {
      return (a.cost.total - b.cost.total) * direction;
    }
    return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
  });

  const selected = selectedChatId ? stats.find((item) => item.id === selectedChatId) : stats[0];
  const totalCost = stats.reduce(
    (acc, item) => addCost(acc, item.cost),
    { input: 0, output: 0, cached: 0, total: 0 },
  );
  const providerCosts = usageRows.reduce<Record<string, number>>((acc, event) => {
    acc[event.provider] = (acc[event.provider] ?? 0) + eventCost(event).total;
    return acc;
  }, {});
  const totalCreditsUsed = ledgerRows.reduce((sum, row) => sum + Math.abs(row.delta), 0);
  const mostUsedModel = providerAndModel(usageRows, "n/a").model;
  const selectedMessages = selected ? messagesByChat.get(selected.id) ?? [] : [];
  const selectedUsage = selected ? usageByChat.get(selected.id) ?? [] : [];
  const selectedAssistantMessages = selectedMessages.filter((message) => message.role === "assistant");
  const balance = wallet?.balance ?? 0;

  return (
    <main className="min-h-screen bg-paper px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/20 pb-5">
          <Wordmark href="/app" />
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex h-10 items-center gap-2 border border-ink/40 px-3 text-sm font-semibold hover:bg-paper-surface" href="/app">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />Chats
            </Link>
            <Link className="inline-flex h-10 items-center gap-2 border border-ochre bg-ochre px-3 text-sm font-semibold hover:bg-ochre/85" href="/paywall">
              <CreditCard className="h-4 w-4" aria-hidden="true" />Add credits
            </Link>
          </div>
        </header>

        <section className="py-8 sm:py-10">
          <p className="utility-label">Usage ledger</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Stats and costs</h1>

          <div className="mt-8 grid grid-cols-2 border-y border-ink/25 md:grid-cols-[1fr_1fr_1.5fr_auto]">
            <div className="border-b border-r border-ink/15 p-4 md:border-b-0 sm:p-5">
              <p className="utility-label">Provider cost</p>
              <p className="mt-2 font-mono text-2xl font-semibold sm:text-3xl">{formatMoney(totalCost.total)}</p>
              <p className="mt-2 font-mono text-[0.68rem] leading-5 text-ink-muted">
                {Object.entries(providerCosts).map(([provider, cost]) => `${provider} ${formatMoney(cost)}`).join(" · ") || "No provider usage recorded"}
              </p>
            </div>
            <div className="border-b border-ink/15 p-4 md:border-b-0 md:border-r sm:p-5">
              <p className="utility-label">Credits used</p>
              <p className="mt-2 font-mono text-2xl font-semibold sm:text-3xl">{formatNumber(totalCreditsUsed)}</p>
              <p className="mt-2 text-[0.68rem] leading-5 text-ink-muted">One per completed turn</p>
            </div>
            <div className="border-r border-ink/15 p-4 sm:p-5">
              <p className="utility-label">Most-used model</p>
              <p className="mt-2 truncate font-mono text-base font-semibold sm:text-xl">{mostUsedModel}</p>
              <p className="mt-2 text-[0.68rem] leading-5 text-ink-muted">Ranked by input and output tokens</p>
            </div>
            <div className="flex items-center justify-center p-4 sm:px-7">
              <CreditStamp balance={balance} />
            </div>
          </div>
        </section>

        <section aria-labelledby="chat-ledger-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/25 pb-3">
            <div>
              <p className="utility-label">Case ledger</p>
              <h2 id="chat-ledger-heading" className="mt-1 text-2xl font-semibold">Chats</h2>
            </div>
            <div className="flex gap-2 text-xs">
              <Link className="inline-flex items-center border border-ink/30 px-2 py-1.5 font-semibold hover:bg-paper-surface" href={sortLink("date", currentSort, currentDir, selected?.id)}>
                <ArrowDownUp className="mr-1 h-3 w-3" aria-hidden="true" />Date
              </Link>
              <Link className="inline-flex items-center border border-ink/30 px-2 py-1.5 font-semibold hover:bg-paper-surface" href={sortLink("cost", currentSort, currentDir, selected?.id)}>
                <ArrowDownUp className="mr-1 h-3 w-3" aria-hidden="true" />Cost
              </Link>
            </div>
          </div>
          <div>
            <table className="w-full table-fixed border-collapse text-left text-xs md:table-auto">
              <thead className="bg-paper-deep/55 text-[0.62rem] uppercase tracking-[0.13em] text-ink-muted">
                <tr>
                  <th className="w-[58%] px-3 py-3 font-semibold md:w-auto">Chat</th>
                  <th className="hidden px-3 py-3 font-semibold sm:table-cell">Provider / model</th>
                  <th className="hidden px-3 py-3 text-right font-semibold lg:table-cell">Messages</th>
                  <th className="hidden px-3 py-3 text-right font-semibold lg:table-cell">Input</th>
                  <th className="hidden px-3 py-3 text-right font-semibold lg:table-cell">Output</th>
                  <th className="hidden px-3 py-3 text-right font-semibold lg:table-cell">Cached</th>
                  <th className="w-[25%] px-3 py-3 text-right font-semibold md:w-auto">Cost</th>
                  <th className="w-[17%] px-3 py-3 text-right font-semibold md:w-auto">Credits</th>
                  <th className="hidden px-3 py-3 text-right font-semibold xl:table-cell">Opened</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((chat) => (
                  <tr key={chat.id} className={`border-b border-ink/15 ${chat.id === selected?.id ? "bg-paper-surface" : "hover:bg-paper-surface/55"}`}>
                    <td className="max-w-56 px-3 py-4">
                      <Link className="block truncate font-display text-sm font-semibold underline-offset-4 hover:text-ochre hover:underline" href={`/app/stats?chatId=${chat.id}&sort=${currentSort}&dir=${currentDir}`}>
                        {chat.title}
                      </Link>
                      <span className="mt-1 flex items-center gap-2 sm:hidden">
                        {isProviderId(chat.provider) ? <ProviderMark provider={chat.provider} showLabel={false} /> : <span className="h-2 w-2 rounded-full bg-ink-muted" />}
                        <span className="truncate font-mono text-[0.6rem] text-ink-muted">{chat.provider} · {chat.model}</span>
                      </span>
                    </td>
                    <td className="hidden max-w-64 px-3 py-4 sm:table-cell">
                      <span className="flex items-center gap-2">
                        {isProviderId(chat.provider) ? <ProviderMark provider={chat.provider} showLabel={false} /> : <span className="h-2 w-2 rounded-full bg-ink-muted" />}
                        <span className="truncate font-mono text-[0.68rem] text-ink-muted">{chat.provider} · {chat.model}</span>
                      </span>
                    </td>
                    <td className="hidden px-3 py-4 text-right font-mono lg:table-cell">{formatNumber(chat.messageCount)}</td>
                    <td className="hidden px-3 py-4 text-right font-mono lg:table-cell">{formatNumber(chat.inputTokens)}</td>
                    <td className="hidden px-3 py-4 text-right font-mono lg:table-cell">{formatNumber(chat.outputTokens)}</td>
                    <td className="hidden px-3 py-4 text-right font-mono lg:table-cell">{formatNumber(chat.cachedTokens)}</td>
                    <td className="px-3 py-4 text-right">
                      <p className="font-mono font-semibold">{formatMoney(chat.cost.total)}</p>
                      <CostSplit cost={chat.cost} />
                    </td>
                    <td className="px-3 py-4 text-right font-mono">{formatNumber(chat.creditsSpent)}</td>
                    <td className="hidden px-3 py-4 text-right font-mono text-[0.68rem] xl:table-cell">{formatDate(chat.createdAt)}</td>
                  </tr>
                ))}
                {stats.length === 0 ? (
                  <tr className="border-b border-ink/15">
                    <td className="px-3 py-8 text-center text-sm text-ink-muted" colSpan={9}>
                      No usage is recorded yet. <Link className="font-semibold text-ochre underline-offset-4 hover:underline" href="/app">Start a chat to open the ledger.</Link>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {selected ? (
          <section className="mt-10" aria-labelledby="turn-ledger-heading">
            <div className="border-b border-ink/25 pb-3">
              <p className="utility-label">Selected case</p>
              <h2 id="turn-ledger-heading" className="mt-1 text-2xl font-semibold">Turn breakdown</h2>
              <p className="mt-1 text-sm text-ink-muted">{selected.title}</p>
            </div>
            <div>
              {selectedAssistantMessages.map((message) => {
                const events = selectedUsage.filter((event) => event.message_id === message.id);
                const cost = events.reduce(
                  (acc, event) => addCost(acc, eventCost(event)),
                  { input: 0, output: 0, cached: 0, total: 0 },
                );
                const inputTokens = events.reduce((sum, event) => sum + event.input_tokens, 0);
                const outputTokens = events.reduce((sum, event) => sum + event.output_tokens, 0);
                const cachedTokens = events.reduce((sum, event) => sum + event.cached_input_tokens, 0);
                const firstEvent = events[0];

                return (
                  <div key={message.id} className="grid gap-3 border-b border-ink/15 py-4 md:grid-cols-[minmax(0,1fr)_14rem_14rem]">
                    <div className="min-w-0">
                      <p className="font-display font-semibold">Assistant turn <span className="font-mono">{message.seq}</span></p>
                      <p className="mt-1 truncate text-xs text-ink-muted">
                        {message.content || "This turn has not stored a final answer yet."}
                      </p>
                    </div>
                    <div className="text-xs md:text-right">
                      <p className="font-mono">{firstEvent ? `${firstEvent.provider} · ${firstEvent.model}` : "No usage recorded"}</p>
                      <p className="mt-1 font-mono text-[0.65rem] text-ink-muted">
                        {formatNumber(inputTokens)} in · {formatNumber(outputTokens)} out · {formatNumber(cachedTokens)} cached
                      </p>
                    </div>
                    <div className="text-xs md:text-right">
                      <p className="font-mono font-semibold">{formatMoney(cost.total)}</p>
                      <p className="mt-1 font-mono text-[0.65rem] text-ink-muted">
                        {formatMoney(cost.input)} in · {formatMoney(cost.output)} out · {formatMoney(cost.cached)} cached
                      </p>
                    </div>
                  </div>
                );
              })}
              {selectedAssistantMessages.length === 0 ? (
                <div className="border-b border-ink/15 py-8 text-sm text-ink-muted">
                  No completed turns are recorded yet. Return to the chat and send a research question.
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
