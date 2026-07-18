import "server-only";

import type { ProviderId } from "@/lib/models";
import { anthropicTools, openAiTools } from "@/lib/agent/tools";

const PROVIDER_TIMEOUT_MS = 60_000;

export type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
};

export type UsageNumbers = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ProviderResponse = {
  content: string;
  toolCalls: ToolCall[];
  rawAssistantMessage: unknown;
  usage: UsageNumbers;
};

export type ProviderCredentials = {
  provider: ProviderId;
  apiKey: string;
  baseUrl: string | null;
  model: string;
  promptCacheKey?: string;
};

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

type AnthropicContentBlock =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

type AnthropicTool = (typeof anthropicTools)[number] & {
  cache_control?: { type: "ephemeral" };
};

export function parseToolArguments(value: string | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function openAiBaseUrl(credentials: ProviderCredentials) {
  if (credentials.provider === "openai") {
    return credentials.baseUrl || "https://api.openai.com/v1";
  }

  if (credentials.provider === "kimi") {
    return credentials.baseUrl || "https://api.moonshot.ai/v1";
  }

  return credentials.baseUrl || "";
}

function providerDisplayName(provider: ProviderId) {
  if (provider === "anthropic") {
    return "Anthropic";
  }

  if (provider === "kimi") {
    return "Kimi";
  }

  if (provider === "openai_compatible") {
    return "the custom provider";
  }

  return "OpenAI";
}

function friendlyProviderError(provider: ProviderId, status: number) {
  const name = providerDisplayName(provider);

  if (status === 401 || status === 403) {
    return `${name} rejected this API key or project. Update the key in Settings and try again.`;
  }

  if (status === 408 || status === 504) {
    return `${name} timed out. Retry in a moment or switch models.`;
  }

  if (status === 429) {
    return `${name} rate-limited this request. Wait a moment, then retry.`;
  }

  if (status >= 500) {
    return `${name} is temporarily unavailable. Retry in a moment.`;
  }

  return `${name} could not complete the request. Check the key, model, and provider settings.`;
}

async function providerFetch(provider: ProviderId, input: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderRequestError(friendlyProviderError(provider, 504), 504);
    }

    throw new ProviderRequestError(`${providerDisplayName(provider)} could not be reached. Check the provider status and try again.`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function callProvider(
  credentials: ProviderCredentials,
  messages: ChatMessage[],
  workingMessages: unknown[],
) {
  if (credentials.provider === "anthropic") {
    return callAnthropic(credentials, messages, workingMessages as AnthropicMessage[]);
  }

  return callOpenAiCompatible(credentials, messages, workingMessages as OpenAiMessage[]);
}

export function initialWorkingMessages(credentials: ProviderCredentials, messages: ChatMessage[]) {
  if (credentials.provider === "anthropic") {
    return toAnthropicMessages(messages);
  }

  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  })) satisfies OpenAiMessage[];
}

export function appendToolResults(
  credentials: ProviderCredentials,
  workingMessages: unknown[],
  assistantMessage: unknown,
  results: Array<{ toolCall: ToolCall; output: unknown }>,
) {
  if (credentials.provider === "anthropic") {
    const anthropicMessages = workingMessages as AnthropicMessage[];
    anthropicMessages.push({
      role: "assistant",
      content: Array.isArray(assistantMessage) ? (assistantMessage as AnthropicContentBlock[]) : [],
    });
    anthropicMessages.push({
      role: "user",
      content: results.map(({ toolCall, output }) => ({
        type: "tool_result",
        tool_use_id: toolCall.id,
        content: JSON.stringify(output).slice(0, 16_000),
      })),
    });
    return;
  }

  const openAiMessages = workingMessages as OpenAiMessage[];
  openAiMessages.push(assistantMessage as OpenAiMessage);
  results.forEach(({ toolCall, output }) => {
    openAiMessages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify(output).slice(0, 16_000),
    });
  });
}

async function callOpenAiCompatible(
  credentials: ProviderCredentials,
  _messages: ChatMessage[],
  workingMessages: OpenAiMessage[],
): Promise<ProviderResponse> {
  const baseUrl = openAiBaseUrl(credentials).replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("Missing OpenAI-compatible base URL.");
  }

  const response = await providerFetch(credentials.provider, `${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: credentials.model,
      messages: workingMessages,
      tools: openAiTools,
      tool_choice: "auto",
      temperature: 0.2,
      ...(credentials.provider === "kimi" && credentials.promptCacheKey
        ? { prompt_cache_key: credentials.promptCacheKey }
        : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: Array<{
      message?: OpenAiMessage;
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      cached_tokens?: number;
      prompt_tokens_details?: {
        cached_tokens?: number;
      };
    };
  } | null;

  if (!response.ok) {
    throw new ProviderRequestError(friendlyProviderError(credentials.provider, response.status), response.status);
  }

  const assistant = payload?.choices?.[0]?.message ?? { role: "assistant", content: "" };
  const toolCalls = (assistant.tool_calls ?? []).map((toolCall) => ({
    id: toolCall.id,
    name: toolCall.function.name,
    input: parseToolArguments(toolCall.function.arguments),
  }));

  return {
    content: assistant.content ?? "",
    toolCalls,
    rawAssistantMessage: assistant,
    usage: {
      inputTokens: payload?.usage?.prompt_tokens ?? 0,
      outputTokens: payload?.usage?.completion_tokens ?? 0,
      cachedInputTokens:
        payload?.usage?.prompt_tokens_details?.cached_tokens ??
        payload?.usage?.cached_tokens ??
        0,
    },
  };
}

function toAnthropicMessages(messages: ChatMessage[]) {
  const result: AnthropicMessage[] = [];

  messages
    .filter((message) => message.role !== "system" && message.role !== "tool")
    .forEach((message) => {
      const role = message.role === "assistant" ? "assistant" : "user";
      result.push({ role, content: message.content });
    });

  return result;
}

async function callAnthropic(
  credentials: ProviderCredentials,
  messages: ChatMessage[],
  workingMessages: AnthropicMessage[],
): Promise<ProviderResponse> {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const cachedSystem: AnthropicContentBlock[] = [
    {
      type: "text",
      text: system,
      cache_control: { type: "ephemeral" },
    },
  ];
  const cachedTools: AnthropicTool[] = anthropicTools.map((tool, index) => ({
    ...tool,
    ...(index === anthropicTools.length - 1
      ? { cache_control: { type: "ephemeral" } as const }
      : {}),
  }));

  const response = await providerFetch(credentials.provider, "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": credentials.apiKey,
    },
    body: JSON.stringify({
      model: credentials.model,
      max_tokens: 4096,
      system: cachedSystem,
      messages: workingMessages,
      tools: cachedTools,
      temperature: 0.2,
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    content?: AnthropicContentBlock[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  } | null;

  if (!response.ok) {
    throw new ProviderRequestError(friendlyProviderError(credentials.provider, response.status), response.status);
  }

  const content = payload?.content ?? [];
  const text = content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  const toolCalls = content
    .filter(
      (block): block is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
        block.type === "tool_use",
    )
    .map((block) => ({
      id: block.id,
      name: block.name,
      input: block.input,
    }));

  return {
    content: text,
    toolCalls,
    rawAssistantMessage: content,
    usage: {
      inputTokens:
        (payload?.usage?.input_tokens ?? 0) +
        (payload?.usage?.cache_creation_input_tokens ?? 0) +
        (payload?.usage?.cache_read_input_tokens ?? 0),
      outputTokens: payload?.usage?.output_tokens ?? 0,
      cachedInputTokens: payload?.usage?.cache_read_input_tokens ?? 0,
    },
  };
}
