"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search, Send, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getModelsForProvider, type ProviderId } from "@/lib/models";

type ProviderKey = {
  id: string;
  provider: ProviderId;
  label: string;
  base_url: string | null;
  key_last4: string;
  default_model: string;
};

type Chat = {
  id: string;
  title: string;
  model: string;
  provider_key_id: string | null;
  updated_at: string;
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
  type: "thought" | "tool_call" | "tool_result" | "final_answer";
  tool_name: string | null;
  tool_input: unknown;
  tool_output: unknown;
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
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

      html.push(inCode ? "</code></pre>" : "<pre class=\"overflow-x-auto rounded-md bg-slate-950 p-3 text-slate-50\"><code>");
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      html.push(`${line}\n`);
      continue;
    }

    const formatted = line
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "<a class=\"text-primary underline\" href=\"$2\" target=\"_blank\" rel=\"noreferrer\">$1</a>");

    if (!formatted.trim()) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }

    if (formatted.startsWith("### ")) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(`<h3 class="mt-4 text-base font-semibold">${formatted.slice(4)}</h3>`);
    } else if (formatted.startsWith("## ")) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(`<h2 class="mt-5 text-lg font-semibold">${formatted.slice(3)}</h2>`);
    } else if (formatted.startsWith("# ")) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(`<h1 class="mt-6 text-xl font-semibold">${formatted.slice(2)}</h1>`);
    } else if (formatted.trim().startsWith("- ")) {
      if (!inList) {
        html.push("<ul class=\"my-3 list-disc space-y-1 pl-5\">");
        inList = true;
      }
      html.push(`<li>${formatted.trim().slice(2)}</li>`);
    } else {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(`<p class="mt-3">${formatted}</p>`);
    }
  }

  if (inList) {
    html.push("</ul>");
  }

  if (inCode) {
    html.push("</code></pre>");
  }

  return html.join("");
}

function stepTitle(step: AgentStep) {
  if (step.type === "tool_call" && step.tool_name === "web_search") {
    const query = typeof step.tool_input === "object" && step.tool_input !== null && "query" in step.tool_input
      ? String((step.tool_input as { query?: unknown }).query ?? "")
      : "";
    return `🔍 Searching: ${query}`;
  }

  if (step.type === "tool_call" && step.tool_name === "fetch_page") {
    const url = typeof step.tool_input === "object" && step.tool_input !== null && "url" in step.tool_input
      ? String((step.tool_input as { url?: unknown }).url ?? "")
      : "";
    return `📄 Reading: ${url}`;
  }

  if (step.type === "tool_result") {
    return `Observation from ${step.tool_name}`;
  }

  if (step.type === "thought") {
    return "Rationale";
  }

  return "Final answer";
}

function NewChatPanel({ keys }: { keys: ProviderKey[] }) {
  const [providerKeyId, setProviderKeyId] = useState(keys[0]?.id ?? "");
  const selectedKey = keys.find((key) => key.id === providerKeyId);
  const [model, setModel] = useState(selectedKey?.default_model ?? "");
  const [isCreating, setIsCreating] = useState(false);
  const models = useMemo(
    () => (selectedKey ? getModelsForProvider(selectedKey.provider) : []),
    [selectedKey],
  );

  function onKeyChange(id: string) {
    setProviderKeyId(id);
    const key = keys.find((item) => item.id === id);
    setModel(key?.default_model ?? "");
  }

  async function createChat() {
    if (!providerKeyId || !model.trim()) {
      return;
    }

    setIsCreating(true);
    const response = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerKeyId, model }),
    });
    const payload = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;
    setIsCreating(false);

    if (payload?.id) {
      window.location.href = `/app/${payload.id}`;
    } else {
      alert(payload?.error ?? "Could not create chat.");
    }
  }

  if (keys.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Add a provider key first</CardTitle>
          <CardDescription>MicroManus uses your own OpenAI, Anthropic, Kimi, or compatible API key for LLM calls.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/app/settings/keys">Open key settings</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a new chat</CardTitle>
        <CardDescription>Pick the provider key and model. This choice is fixed for the thread.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Provider key</span>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={providerKeyId}
            onChange={(event) => onKeyChange(event.target.value)}
          >
            {keys.map((key) => (
              <option key={key.id} value={key.id}>
                {key.label} · {key.provider} · sk-...{key.key_last4}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Model</span>
          <Input list="new-chat-models" value={model} onChange={(event) => setModel(event.target.value)} />
          <datalist id="new-chat-models">
            {models.map((item) => (
              <option key={item.modelId} value={item.modelId}>
                {item.label}
              </option>
            ))}
          </datalist>
        </label>
        <Button disabled={isCreating} onClick={createChat}>
          {isCreating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
          Create chat
        </Button>
      </CardContent>
    </Card>
  );
}

function Trace({ steps }: { steps: AgentStep[] }) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <details className="mt-3 rounded-md border bg-muted/30 p-3 text-xs">
      <summary className="cursor-pointer font-medium">Agent trace ({steps.length} steps)</summary>
      <div className="mt-3 space-y-3">
        {steps.map((step) => (
          <div key={step.id} className="rounded-md bg-background p-3">
            <p className="font-medium">{step.step_index}. {stepTitle(step)}</p>
            {step.tool_output ? (
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-muted-foreground">
                {JSON.stringify(step.tool_output, null, 2)}
              </pre>
            ) : step.tool_input ? (
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-muted-foreground">
                {JSON.stringify(step.tool_input, null, 2)}
              </pre>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}

export function ChatClient({
  selectedChatId,
  chats,
  keys,
  messages: initialMessages,
  steps: initialSteps,
  balance,
}: {
  selectedChatId: string | null;
  chats: Chat[];
  keys: ProviderKey[];
  messages: Message[];
  steps: AgentStep[];
  balance: number;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [steps, setSteps] = useState(initialSteps);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assistantMessageId = useRef<string | null>(null);

  const stepsByMessage = useMemo(() => {
    return steps.reduce<Record<string, AgentStep[]>>((acc, step) => {
      acc[step.message_id] = [...(acc[step.message_id] ?? []), step].sort((a, b) => a.step_index - b.step_index);
      return acc;
    }, {});
  }, [steps]);

  async function sendMessage() {
    if (!selectedChatId || !input.trim()) {
      return;
    }

    const content = input.trim();
    setInput("");
    setError(null);
    setIsStreaming(true);

    const response = await fetch(`/api/chats/${selectedChatId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!response.ok || !response.body) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Message send failed.");
      setIsStreaming(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const packets = buffer.split("\n\n");
      buffer = packets.pop() ?? "";

      for (const packet of packets) {
        const eventLine = packet.split("\n").find((line) => line.startsWith("event: "));
        const dataLine = packet.split("\n").find((line) => line.startsWith("data: "));
        if (!eventLine || !dataLine) {
          continue;
        }

        const event = eventLine.slice(7);
        const data = JSON.parse(dataLine.slice(6)) as {
          userMessage?: Message;
          assistantMessage?: Message;
          messageId?: string;
          chunk?: string;
          error?: string;
        };

        if (event === "message" && data.userMessage && data.assistantMessage) {
          assistantMessageId.current = data.assistantMessage.id;
          setMessages((current) => [...current, data.userMessage!, data.assistantMessage!]);
        }

        if (event === "step") {
          setSteps((current) => [...current, data as unknown as AgentStep]);
        }

        if (event === "content" && data.messageId && data.chunk) {
          setMessages((current) =>
            current.map((message) =>
              message.id === data.messageId ? { ...message, content: `${message.content}${data.chunk}` } : message,
            ),
          );
        }

        if (event === "error") {
          setError(data.error ?? "Agent failed.");
        }
      }
    }

    assistantMessageId.current = null;
    setIsStreaming(false);
  }

  return (
    <main className="grid min-h-screen bg-stone-50 md:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="border-r bg-background p-4">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Search aria-hidden="true" className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">MicroManus</p>
            <p className="text-xs text-muted-foreground">{balance} credits</p>
          </div>
        </div>

        <Button asChild className="mb-3 w-full">
          <Link href="/app">
            <Plus aria-hidden="true" />
            New chat
          </Link>
        </Button>
        <Button asChild className="mb-5 w-full" variant="outline">
          <Link href="/app/settings/keys">
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </Button>

        <div className="space-y-2">
          {chats.map((chat) => (
            <Link
              key={chat.id}
              href={`/app/${chat.id}`}
              className={`block rounded-md border px-3 py-2 text-sm transition-colors ${
                chat.id === selectedChatId ? "border-primary bg-primary/10" : "bg-muted/20 hover:bg-muted"
              }`}
            >
              <p className="truncate font-medium">{chat.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {chat.model} · {formatDate(chat.updated_at)}
              </p>
            </Link>
          ))}
        </div>
      </aside>

      <section className="flex min-h-screen flex-col">
        <div className="border-b bg-background px-5 py-4">
          <p className="text-sm text-muted-foreground">Deep research agent</p>
          <h1 className="text-xl font-semibold">
            {selectedChatId ? chats.find((chat) => chat.id === selectedChatId)?.title ?? "Chat" : "New chat"}
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!selectedChatId ? (
            <NewChatPanel keys={keys} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Ask a research question to start the agent loop.
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-lg border p-4 ${
                      message.role === "user" ? "ml-auto max-w-[85%] bg-primary text-primary-foreground" : "bg-background"
                    }`}
                  >
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content || (message.role === "assistant" && isStreaming ? "Thinking..." : "")) }}
                    />
                    {message.role === "assistant" ? <Trace steps={stepsByMessage[message.id] ?? []} /> : null}
                  </div>
                ))
              )}
              {error ? <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">{error}</p> : null}
            </div>
          )}
        </div>

        {selectedChatId ? (
          <div className="border-t bg-background p-4">
            <div className="mx-auto flex max-w-3xl gap-2">
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Ask MicroManus to research something..."
                disabled={isStreaming}
              />
              <Button disabled={isStreaming || !input.trim()} onClick={sendMessage}>
                {isStreaming ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
                Send
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
