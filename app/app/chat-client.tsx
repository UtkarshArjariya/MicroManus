"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CreditCard,
  Download,
  FileText,
  ListRestart,
  Loader2,
  Menu,
  Plus,
  Send,
  Settings,
  X,
} from "lucide-react";

import { CreditStamp } from "@/components/credit-stamp";
import { InterfaceNotice } from "@/components/interface-notice";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { parseJsonResponse } from "@/lib/http";
import { getModelsForProvider, type ProviderId } from "@/lib/models";

type ProviderKey = {
  id: string;
  provider: ProviderId;
  api_format: "openai" | "anthropic" | "google";
  label: string;
  base_url: string | null;
  key_last4: string;
  default_model: string;
};

type AvailableModel = { id: string; label: string };

type Chat = {
  id: string;
  title: string;
  model: string;
  provider_key_id: string | null;
  updated_at: string;
  has_report: boolean;
};

type Message = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  created_at: string;
  seq: number;
};

type AgentStep = {
  id: string;
  message_id: string;
  step_index: number;
  type: "thought" | "tool_call" | "tool_result" | "artifact" | "final_answer";
  tool_name: string | null;
  tool_input: unknown;
  tool_output: unknown;
  created_at: string;
};

type ReportArtifact = {
  id: string;
  message_id: string;
  title: string;
  storage_path: string;
  created_at: string;
  signed_url: string;
  expires_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLogTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMarkdown(markdown: string) {
  let inCode = false;
  let inList = false;
  const html: string[] = [];

  for (const rawLine of markdown.split("\n")) {
    const line = escapeHtml(rawLine);

    if (line.trim().startsWith("```")) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      html.push(`${line}\n`);
      continue;
    }

    const formatted = line
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
      );

    if (!formatted.trim()) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }

    if (formatted.startsWith("### ")) {
      if (inList) html.push("</ul>");
      inList = false;
      html.push(`<h3 class="text-lg font-semibold">${formatted.slice(4)}</h3>`);
    } else if (formatted.startsWith("## ")) {
      if (inList) html.push("</ul>");
      inList = false;
      html.push(`<h2 class="text-xl font-semibold">${formatted.slice(3)}</h2>`);
    } else if (formatted.startsWith("# ")) {
      if (inList) html.push("</ul>");
      inList = false;
      html.push(`<h1 class="text-2xl font-semibold">${formatted.slice(2)}</h1>`);
    } else if (formatted.trim().startsWith("- ")) {
      if (!inList) {
        html.push('<ul class="my-3 list-disc space-y-1 pl-5">');
        inList = true;
      }
      html.push(`<li>${formatted.trim().slice(2)}</li>`);
    } else {
      if (inList) html.push("</ul>");
      inList = false;
      html.push(`<p class="mt-3">${formatted}</p>`);
    }
  }

  if (inList) html.push("</ul>");
  if (inCode) html.push("</code></pre>");
  return html.join("");
}

function stepLabel(step: AgentStep) {
  if (step.type === "artifact" || step.tool_name === "generate_pdf_report") return "REPORT";
  if (step.type === "tool_call" && step.tool_name === "web_search") return "SEARCH";
  if (step.type === "tool_call" && step.tool_name === "fetch_page") return "READ";
  if (step.type === "tool_result") return "RESULT";
  if (step.type === "thought") return "PLAN";
  return "ANSWER";
}

function stepTitle(step: AgentStep) {
  if (step.type === "artifact") {
    const title = typeof step.tool_output === "object" && step.tool_output !== null && "title" in step.tool_output
      ? String((step.tool_output as { title?: unknown }).title ?? "")
      : "PDF report";
    return `Report completed: ${title}`;
  }

  if (step.type === "tool_call" && step.tool_name === "generate_pdf_report") {
    const title = typeof step.tool_input === "object" && step.tool_input !== null && "title" in step.tool_input
      ? String((step.tool_input as { title?: unknown }).title ?? "")
      : "PDF report";
    return `Preparing report: ${title}`;
  }

  if (step.type === "tool_call" && step.tool_name === "web_search") {
    const query = typeof step.tool_input === "object" && step.tool_input !== null && "query" in step.tool_input
      ? String((step.tool_input as { query?: unknown }).query ?? "")
      : "";
    return `Searching for ${query}`;
  }

  if (step.type === "tool_call" && step.tool_name === "fetch_page") {
    const url = typeof step.tool_input === "object" && step.tool_input !== null && "url" in step.tool_input
      ? String((step.tool_input as { url?: unknown }).url ?? "")
      : "";
    return `Reading ${url}`;
  }

  if (step.type === "tool_result") return `Recorded result from ${step.tool_name ?? "tool"}`;
  if (step.type === "thought") return "Set the next research step";
  return "Prepared the final answer";
}

function safeTraceData(value: unknown, key = ""): unknown {
  if (/error|exception|stack/i.test(key)) {
    return "This step could not be completed. Retry the request if the result is incomplete.";
  }
  if (
    typeof value === "string" &&
    (/(?:^|\n)\s*at\s+\S+\s+\(/.test(value) || /(?:TypeError|ReferenceError|SyntaxError|Failed to execute):/i.test(value))
  ) {
    return "This step returned an unreadable technical response. Retry the request if the result is incomplete.";
  }
  if (Array.isArray(value)) return value.map((item) => safeTraceData(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        safeTraceData(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

function ArtifactCard({ artifact }: { artifact: ReportArtifact }) {
  return (
    <div className="relative mt-5 border border-ink/25 bg-paper-surface p-4 pr-8">
      <span
        aria-hidden="true"
        className="absolute -top-2 right-4 h-7 w-2 rotate-12 rounded-full border-2 border-b-0 border-ink-muted/50"
      />
      <div className="flex min-w-0 items-start gap-3">
        <FileText className="mt-1 h-4 w-4 shrink-0 text-ochre" aria-hidden="true" />
        <div className="min-w-0">
          <p className="utility-label">Case exhibit · PDF</p>
          <h3 className="mt-1 truncate text-lg font-semibold">{artifact.title}</h3>
          <p className="mt-1 font-mono text-[0.68rem] text-ink-muted">
            Link expires {formatDate(artifact.expires_at)}
          </p>
          <a
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-ochre underline-offset-4 hover:underline"
            href={artifact.signed_url}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download report
          </a>
        </div>
      </div>
    </div>
  );
}

function createChatError(status: number) {
  if (status === 401) return "Your session ended. Sign in again, then start the chat.";
  if (status === 404) return "That provider key is no longer available. Choose another key.";
  if (status === 400) return "Choose a provider key and model before starting the chat.";
  return "We couldn’t start the chat. Check your connection and try again.";
}

function NewChatPanel({ keys }: { keys: ProviderKey[] }) {
  const [providerKeyId, setProviderKeyId] = useState(keys[0]?.id ?? "");
  const selectedKey = keys.find((key) => key.id === providerKeyId);
  const [model, setModel] = useState(selectedKey?.default_model ?? "");
  const [loadedModels, setLoadedModels] = useState<AvailableModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const models = useMemo(() => {
    const catalog = new Map<string, AvailableModel>();
    if (selectedKey) {
      getModelsForProvider(selectedKey.provider).forEach((item) =>
        catalog.set(item.modelId, { id: item.modelId, label: item.label }),
      );
    }
    loadedModels.forEach((item) => catalog.set(item.id, item));
    return [...catalog.values()];
  }, [loadedModels, selectedKey]);

  function onKeyChange(id: string) {
    setProviderKeyId(id);
    const key = keys.find((item) => item.id === id);
    setModel(key?.default_model ?? "");
    setLoadedModels([]);
    setError(null);
  }

  async function loadModels() {
    if (!selectedKey) return;
    setIsLoadingModels(true);
    setError(null);
    try {
      const response = await fetch("/api/provider-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selectedKey.provider, providerKeyId: selectedKey.id }),
      });
      const payload = await parseJsonResponse<{ models?: AvailableModel[]; error?: string }>(response);
      if (!response.ok || !payload?.models) {
        setError(payload?.error ?? "The provider couldn’t list models for this key.");
        return;
      }
      setLoadedModels(payload.models);
      if (!model && payload.models[0]) setModel(payload.models[0].id);
    } catch {
      setError("We couldn’t reach the provider model catalog. Try again in a moment.");
    } finally {
      setIsLoadingModels(false);
    }
  }

  async function createChat() {
    if (!providerKeyId || !model.trim()) {
      setError("Choose a provider key and model before starting the chat.");
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerKeyId, model }),
      });

      if (!response.ok) {
        setError(createChatError(response.status));
        return;
      }

      const payload = await parseJsonResponse<{ id?: string }>(response);
      if (!payload?.id) {
        setError("The chat was created without a valid reference. Try again.");
        return;
      }

      window.location.href = `/app/${payload.id}`;
    } catch {
      setError("We couldn’t reach the workspace. Check your connection and try again.");
    } finally {
      setIsCreating(false);
    }
  }

  if (keys.length === 0) {
    return (
      <Card className="max-w-2xl bg-paper-surface">
        <CardHeader>
          <p className="utility-label">Provider required</p>
          <CardTitle className="mt-2 text-3xl">Add a research key</CardTitle>
          <CardDescription className="max-w-lg leading-6">
            No provider keys are ready yet. Add an OpenAI, Anthropic, Google, Kimi, or compatible key to start a chat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/app/settings/keys">Add a provider key</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl bg-paper-surface">
      <CardHeader className="border-b border-ink/15">
        <p className="utility-label">New case file</p>
        <CardTitle className="mt-2 text-3xl">Start a new chat</CardTitle>
        <CardDescription>Choose the provider key and model for this research thread.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <label className="block space-y-2 text-sm">
          <span className="font-semibold">Provider key</span>
          <select
            className="flex h-10 w-full rounded-sm border border-ink/30 bg-paper-surface px-3 py-2 font-mono text-sm focus-visible:border-ochre focus-visible:outline-none"
            value={providerKeyId}
            onChange={(event) => onKeyChange(event.target.value)}
          >
            {keys.map((key) => (
              <option key={key.id} value={key.id}>
                {key.label} · {key.provider} · sk-…{key.key_last4}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2 text-sm">
          <span className="font-semibold">Model</span>
          <Input
            className="font-mono"
            list="new-chat-models"
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
          <datalist id="new-chat-models">
            {models.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </datalist>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.68rem] text-ink-muted">
              {loadedModels.length > 0 ? `${loadedModels.length} available models loaded` : "Enter an ID or load this key’s catalog"}
            </p>
            <Button disabled={isLoadingModels} onClick={loadModels} size="sm" type="button" variant="text">
              {isLoadingModels ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ListRestart aria-hidden="true" />}
              {loadedModels.length > 0 ? "Refresh" : "Load all models"}
            </Button>
          </div>
        </label>
        {error ? <InterfaceNotice tone="error">{error}</InterfaceNotice> : null}
        <Button disabled={isCreating} onClick={createChat}>
          {isCreating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
          Start chat
        </Button>
      </CardContent>
    </Card>
  );
}

function Trace({ steps }: { steps: AgentStep[] }) {
  if (steps.length === 0) return null;

  return (
    <section className="mt-6 border-t border-ink/15 pt-4" aria-label="Agent trace">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="utility-label">Agent log</p>
        <p className="font-mono text-[0.65rem] text-ink-muted">
          {steps.length} {steps.length === 1 ? "entry" : "entries"}
        </p>
      </div>
      <div className="ml-1 border-l border-ink/20 pl-4">
        {steps.map((step) => {
          const traceData = step.tool_output ?? step.tool_input;
          return (
            <div
              key={step.id}
              className="trace-step relative grid grid-cols-[4.3rem_minmax(0,1fr)] gap-x-3 border-b border-ink/10 py-3 last:border-b-0 sm:grid-cols-[4.5rem_4.8rem_minmax(0,1fr)]"
            >
              <span aria-hidden="true" className="absolute -left-[1.17rem] top-[1.18rem] h-1.5 w-1.5 rounded-full bg-ink-muted" />
              <time className="font-mono text-[0.65rem] leading-5 text-ink-muted" dateTime={step.created_at}>
                {formatLogTime(step.created_at)}
              </time>
              <span className="font-body text-[0.63rem] font-semibold tracking-[0.14em] text-ink">
                {stepLabel(step)}
              </span>
              <div className="col-start-2 mt-1 min-w-0 sm:col-start-3 sm:row-start-1 sm:mt-0">
                <p className="break-words text-xs leading-5 text-ink">{stepTitle(step)}</p>
                {traceData ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[0.68rem] font-semibold text-ink-muted hover:text-ink">
                      Logged data
                    </summary>
                    <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap border-l border-ink/20 pl-3 font-mono text-[0.65rem] leading-5 text-ink-muted">
                      {JSON.stringify(safeTraceData(traceData), null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function messageErrorForStatus(status: number) {
  if (status === 401) return "Your session ended. Sign in again, then resend the message.";
  if (status === 402) return "This chat needs another credit. Add credits, then resend the message.";
  if (status === 404) return "This chat or its provider key is no longer available. Start a new chat.";
  if (status === 409) return "This chat is already running or its key changed. Wait, then retry.";
  if (status === 413) return "That message is too long. Keep it under 8,000 characters.";
  return "The message didn’t send. Check your connection and try again.";
}

export function ChatClient({
  selectedChatId,
  chats,
  keys,
  messages: initialMessages,
  steps: initialSteps,
  artifacts: initialArtifacts,
  balance: initialBalance,
}: {
  selectedChatId: string | null;
  chats: Chat[];
  keys: ProviderKey[];
  messages: Message[];
  steps: AgentStep[];
  artifacts: ReportArtifact[];
  balance: number;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [steps, setSteps] = useState(initialSteps);
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [balance, setBalance] = useState(initialBalance);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assistantMessageId = useRef<string | null>(null);
  const isSendingRef = useRef(false);

  const stepsByMessage = useMemo(() => steps.reduce<Record<string, AgentStep[]>>((acc, step) => {
    acc[step.message_id] = [...(acc[step.message_id] ?? []), step].sort((a, b) => a.step_index - b.step_index);
    return acc;
  }, {}), [steps]);

  const artifactsByMessage = useMemo(() => artifacts.reduce<Record<string, ReportArtifact[]>>((acc, artifact) => {
    acc[artifact.message_id] = [...(acc[artifact.message_id] ?? []), artifact].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return acc;
  }, {}), [artifacts]);

  async function sendMessage() {
    if (isStreaming || isSendingRef.current || !selectedChatId || !input.trim()) return;
    if (balance <= 0) {
      window.location.href = "/paywall";
      return;
    }

    const content = input.trim();
    if (content.length > 8_000) {
      setError("That message is too long. Keep it under 8,000 characters.");
      return;
    }

    isSendingRef.current = true;
    setInput("");
    setError(null);
    setIsStreaming(true);

    try {
      const response = await fetch(`/api/chats/${selectedChatId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok || !response.body) {
        const payload = await parseJsonResponse<{ redirectTo?: string }>(response);
        if (response.status === 402 && payload?.redirectTo === "/paywall") {
          window.location.href = "/paywall";
          return;
        }
        setError(messageErrorForStatus(response.status));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const packets = buffer.split("\n\n");
        buffer = packets.pop() ?? "";

        for (const packet of packets) {
          const eventLine = packet.split("\n").find((line) => line.startsWith("event: "));
          const dataLine = packet.split("\n").find((line) => line.startsWith("data: "));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.slice(7);
          const data = JSON.parse(dataLine.slice(6)) as {
            userMessage?: Message;
            assistantMessage?: Message;
            messageId?: string;
            chunk?: string;
            id?: string;
            message_id?: string;
            title?: string;
            storage_path?: string;
            signed_url?: string;
            created_at?: string;
            expires_at?: string;
            balance?: number;
          };

          if (event === "message" && data.userMessage && data.assistantMessage) {
            assistantMessageId.current = data.assistantMessage.id;
            setMessages((current) => [...current, data.userMessage!, data.assistantMessage!]);
          }
          if (event === "step") setSteps((current) => [...current, data as unknown as AgentStep]);
          if (
            event === "artifact" &&
            typeof data.id === "string" && typeof data.message_id === "string" &&
            typeof data.title === "string" && typeof data.storage_path === "string" &&
            typeof data.signed_url === "string" && typeof data.created_at === "string" &&
            typeof data.expires_at === "string"
          ) {
            const artifact: ReportArtifact = {
              id: data.id,
              message_id: data.message_id,
              title: data.title,
              storage_path: data.storage_path,
              signed_url: data.signed_url,
              created_at: data.created_at,
              expires_at: data.expires_at,
            };
            setArtifacts((current) => [...current.filter((item) => item.id !== artifact.id), artifact]);
          }
          if (event === "content" && data.messageId && data.chunk) {
            setMessages((current) => current.map((message) =>
              message.id === data.messageId ? { ...message, content: `${message.content}${data.chunk}` } : message,
            ));
          }
          if (event === "error") {
            setError("The agent couldn’t finish this turn. Check the provider key or retry in a moment.");
          }
          if (event === "credit" && typeof data.balance === "number") setBalance(data.balance);
        }
      }
    } catch {
      setError("The connection dropped while sending. Check your network and retry.");
    } finally {
      assistantMessageId.current = null;
      isSendingRef.current = false;
      setIsStreaming(false);
    }
  }

  const selectedTitle = selectedChatId
    ? chats.find((chat) => chat.id === selectedChatId)?.title ?? "Chat"
    : "New chat";

  return (
    <main className="min-h-dvh bg-paper md:grid md:grid-cols-[17.5rem_minmax(0,1fr)]">
      <aside className="border-b border-ink/20 bg-paper-deep/45 md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-3 p-4 md:p-5">
          <Wordmark href="/app" />
          <div className="flex items-center gap-2">
            <CreditStamp balance={balance} className="scale-[0.82]" />
            <Button
              aria-controls="workspace-navigation"
              aria-expanded={navOpen}
              aria-label={navOpen ? "Close navigation" : "Open navigation"}
              className="md:hidden"
              onClick={() => setNavOpen((value) => !value)}
              size="icon"
              variant="ghost"
            >
              {navOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </Button>
          </div>
        </div>

        <div id="workspace-navigation" className={`${navOpen ? "block" : "hidden"} px-4 pb-5 md:block md:px-5`}>
          {balance <= 1 ? (
            <div className="mb-4 border-l-2 border-brick pl-3 text-xs leading-5 text-brick">
              {balance <= 0 ? "No credits remain." : "One credit remains."}{" "}
              <Link className="font-semibold underline underline-offset-4" href="/paywall">Add credits</Link>
            </div>
          ) : null}

          <Button asChild className="w-full" variant="outline">
            <Link href="/app"><Plus aria-hidden="true" />New chat</Link>
          </Button>

          <nav aria-label="Workspace" className="my-5 grid grid-cols-3 border-y border-ink/15 py-2 md:grid-cols-1">
            <Link className="flex items-center gap-2 px-2 py-2 text-xs font-semibold text-ink hover:bg-paper-surface" href="/app/settings/keys">
              <Settings aria-hidden="true" className="h-4 w-4" />Keys
            </Link>
            <Link className="flex items-center gap-2 px-2 py-2 text-xs font-semibold text-ink hover:bg-paper-surface" href="/app/stats">
              <BarChart3 aria-hidden="true" className="h-4 w-4" />Stats
            </Link>
            <Link className="flex items-center gap-2 px-2 py-2 text-xs font-semibold text-ink hover:bg-paper-surface" href="/paywall">
              <CreditCard aria-hidden="true" className="h-4 w-4" />Credits
            </Link>
          </nav>

          <div className="mb-2 flex items-center justify-between">
            <p className="utility-label">Case files</p>
            <span className="font-mono text-[0.65rem] text-ink-muted">{chats.length}</span>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1 md:max-h-[calc(100dvh-20rem)]">
            {chats.length === 0 ? (
              <p className="border-l-2 border-ink/20 py-2 pl-3 text-xs leading-5 text-ink-muted">
                No cases open yet. <Link className="font-semibold text-ochre underline-offset-4 hover:underline" href="/app">Start a new chat.</Link>
              </p>
            ) : chats.map((chat) => (
              <Link
                key={chat.id}
                href={`/app/${chat.id}`}
                className={`group relative block border-l-2 px-3 py-2.5 transition-colors ${
                  chat.id === selectedChatId
                    ? "border-ochre bg-paper-surface"
                    : "border-ink/20 hover:border-ink-muted hover:bg-paper-surface/60"
                }`}
              >
                <span className="flex items-start gap-2">
                  {chat.has_report ? (
                    <span aria-label="Completed report attached" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pine" title="Completed report attached" />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block truncate font-display text-sm font-semibold">{chat.title}</span>
                    <span className="mt-1 block truncate font-mono text-[0.62rem] text-ink-muted">
                      {chat.model} · {formatDate(chat.updated_at)}
                    </span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </aside>

      <section className="flex min-h-[calc(100dvh-5rem)] min-w-0 flex-col md:min-h-dvh">
        <header className="border-b border-ink/20 bg-paper/95 px-5 py-4 sm:px-7">
          <p className="utility-label">Deep research agent</p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-[-0.02em]">{selectedTitle}</h1>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-7 sm:py-8">
          {!selectedChatId ? (
            <NewChatPanel keys={keys} />
          ) : (
            <div className="mx-auto max-w-4xl space-y-8">
              {messages.length === 0 ? (
                <div className="border-l-2 border-ochre bg-paper-surface px-5 py-6">
                  <h2 className="text-2xl font-semibold">Begin the research record</h2>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">
                    Ask a research question below. MicroManus will log each search, source read, and report step here.
                  </p>
                </div>
              ) : messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <article
                    key={message.id}
                    className={isUser
                      ? "ml-auto max-w-[92%] border border-ink/25 bg-paper-deep/55 p-4 sm:max-w-[78%]"
                      : "mr-auto max-w-[95%] border-l border-ink/20 pl-4 sm:pl-6"
                    }
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <span className="utility-label">{isUser ? "You" : "MicroManus"}</span>
                      <time className="font-mono text-[0.62rem] text-ink-muted" dateTime={message.created_at}>
                        {formatDate(message.created_at)}
                      </time>
                    </div>
                    <div
                      className="research-prose max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(
                          message.content || (message.role === "assistant" && isStreaming ? "Writing the research record…" : ""),
                        ),
                      }}
                    />
                    {message.role === "assistant"
                      ? (artifactsByMessage[message.id] ?? []).map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} />)
                      : null}
                    {message.role === "assistant" ? <Trace steps={stepsByMessage[message.id] ?? []} /> : null}
                  </article>
                );
              })}
              {error ? <InterfaceNotice tone="error">{error}</InterfaceNotice> : null}
            </div>
          )}
        </div>

        {selectedChatId ? (
          <div className="border-t border-ink/20 bg-paper-surface p-4 sm:px-7">
            <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row">
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Describe what you want researched…"
                maxLength={8_000}
                disabled={isStreaming || balance <= 0}
              />
              <Button className="sm:min-w-28" disabled={isStreaming || balance <= 0 || !input.trim()} onClick={sendMessage}>
                {isStreaming ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
                Send
              </Button>
            </div>
            {balance <= 0 ? (
              <p className="mx-auto mt-3 max-w-4xl text-sm text-brick">
                This chat needs another credit. <Link className="font-semibold underline underline-offset-4" href="/paywall">Add credits to continue.</Link>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
