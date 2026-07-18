import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownUp, CreditCard, MessageSquare, Wallet } from "lucide-react";

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
  const total = cost.total || 1;
  const inputPct = Math.max((cost.input / total) * 100, cost.input > 0 ? 4 : 0);
  const outputPct = Math.max((cost.output / total) * 100, cost.output > 0 ? 4 : 0);
  const cachedPct = Math.max(100 - inputPct - outputPct, cost.cached > 0 ? 4 : 0);

  return (
    <div className="min-w-44">
      <div className="flex h-2 overflow-hidden rounded-sm bg-muted">
        <div className="bg-sky-500" style={{ width: `${inputPct}%` }} />
        <div className="bg-emerald-500" style={{ width: `${outputPct}%` }} />
        <div className="bg-amber-500" style={{ width: `${cachedPct}%` }} />
      </div>
      <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
        <span>In {formatMoney(cost.input)}</span>
        <span>Out {formatMoney(cost.output)}</span>
        <span>Cached {formatMoney(cost.cached)}</span>
      </div>
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

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm text-muted-foreground">MicroManus</p>
            <h1 className="text-xl font-semibold">Stats and costs</h1>
          </div>
          <div className="flex gap-2">
            <Link className="inline-flex h-10 items-center rounded-md border px-3 text-sm font-medium" href="/app">
              <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />
              Chats
            </Link>
            <Link className="inline-flex h-10 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" href="/paywall">
              <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
              Buy credits
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6">
        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-md border bg-background p-4">
            <p className="text-sm text-muted-foreground">Total provider cost</p>
            <p className="mt-2 text-2xl font-semibold">{formatMoney(totalCost.total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {Object.entries(providerCosts).map(([provider, cost]) => `${provider} ${formatMoney(cost)}`).join(" · ") || "No usage yet"}
            </p>
          </div>
          <div className="rounded-md border bg-background p-4">
            <p className="text-sm text-muted-foreground">Credits used</p>
            <p className="mt-2 text-2xl font-semibold">{formatNumber(totalCreditsUsed)}</p>
            <p className="mt-1 text-xs text-muted-foreground">One credit per completed agent turn</p>
          </div>
          <div className="rounded-md border bg-background p-4">
            <p className="text-sm text-muted-foreground">Credits remaining</p>
            <p className="mt-2 flex items-center text-2xl font-semibold">
              <Wallet className="mr-2 h-5 w-5" aria-hidden="true" />
              {formatNumber(wallet?.balance ?? 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{(wallet?.balance ?? 0) <= 1 ? "Low balance" : "Available now"}</p>
          </div>
          <div className="rounded-md border bg-background p-4">
            <p className="text-sm text-muted-foreground">Most-used model</p>
            <p className="mt-2 truncate text-2xl font-semibold">{mostUsedModel}</p>
            <p className="mt-1 text-xs text-muted-foreground">By total input and output tokens</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-md border bg-background">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-semibold">Chats</h2>
            <div className="flex gap-2 text-sm">
              <Link className="inline-flex items-center rounded-md border px-2 py-1" href={sortLink("date", currentSort, currentDir, selected?.id)}>
                <ArrowDownUp className="mr-1 h-3 w-3" aria-hidden="true" />
                Date
              </Link>
              <Link className="inline-flex items-center rounded-md border px-2 py-1" href={sortLink("cost", currentSort, currentDir, selected?.id)}>
                <ArrowDownUp className="mr-1 h-3 w-3" aria-hidden="true" />
                Cost
              </Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Provider / model</th>
                  <th className="px-4 py-3">Messages</th>
                  <th className="px-4 py-3">Input</th>
                  <th className="px-4 py-3">Output</th>
                  <th className="px-4 py-3">Cached</th>
                  <th className="px-4 py-3">Cost</th>
                  <th className="px-4 py-3">Credits</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((chat) => (
                  <tr key={chat.id} className={chat.id === selected?.id ? "bg-primary/5" : "hover:bg-muted/30"}>
                    <td className="px-4 py-3">
                      <Link className="font-medium underline-offset-4 hover:underline" href={`/app/stats?chatId=${chat.id}&sort=${currentSort}&dir=${currentDir}`}>
                        {chat.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {chat.provider} · {chat.model}
                    </td>
                    <td className="px-4 py-3">{formatNumber(chat.messageCount)}</td>
                    <td className="px-4 py-3">{formatNumber(chat.inputTokens)}</td>
                    <td className="px-4 py-3">{formatNumber(chat.outputTokens)}</td>
                    <td className="px-4 py-3">{formatNumber(chat.cachedTokens)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{formatMoney(chat.cost.total)}</p>
                      <CostSplit cost={chat.cost} />
                    </td>
                    <td className="px-4 py-3">{formatNumber(chat.creditsSpent)}</td>
                    <td className="px-4 py-3">{formatDate(chat.createdAt)}</td>
                  </tr>
                ))}
                {stats.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={9}>
                      No chats have usage yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {selected ? (
          <section className="rounded-md border bg-background">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">Turn breakdown</h2>
              <p className="text-sm text-muted-foreground">{selected.title}</p>
            </div>
            <div className="divide-y">
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
                  <div key={message.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_180px_180px]">
                    <div className="min-w-0">
                      <p className="font-medium">Assistant turn {message.seq}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {message.content || "No final answer stored yet"}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p>{firstEvent ? `${firstEvent.provider} · ${firstEvent.model}` : "No usage events"}</p>
                      <p className="text-muted-foreground">
                        {formatNumber(inputTokens)} in · {formatNumber(outputTokens)} out · {formatNumber(cachedTokens)} cached
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">{formatMoney(cost.total)}</p>
                      <p className="text-muted-foreground">
                        {formatMoney(cost.input)} in · {formatMoney(cost.output)} out · {formatMoney(cost.cached)} cached
                      </p>
                    </div>
                  </div>
                );
              })}
              {selectedAssistantMessages.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  This chat has no completed assistant turns yet.
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
