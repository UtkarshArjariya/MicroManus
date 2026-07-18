import "server-only";

import {
  getDefaultBaseUrl,
  getProviderApiFormat,
  type ProviderApiFormat,
  type ProviderId,
} from "@/lib/models";
import { anthropicTools, openAiTools } from "@/lib/agent/tools";
import { logServerError } from "@/lib/server-errors";

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
  apiFormat?: ProviderApiFormat | null;
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

type GooglePart =
  | { text: string }
  | { functionCall: { id?: string; name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type GoogleContent = {
  role: "user" | "model";
  parts: GooglePart[];
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

function providerApiFormat(credentials: ProviderCredentials) {
  return getProviderApiFormat(credentials.provider, credentials.apiFormat);
}

function providerBaseUrl(credentials: ProviderCredentials) {
  return credentials.baseUrl || getDefaultBaseUrl(credentials.provider);
}

function providerDisplayName(provider: ProviderId) {
  if (provider === "anthropic") {
    return "Anthropic";
  }

  if (provider === "kimi") {
    return "Kimi";
  }

  if (provider === "google") {
    return "Google Gemini";
  }

  if (provider === "openai_compatible") {
    return "the custom provider";
  }

  return "OpenAI";
}

function endpointOrigin(input: string) {
  try {
    return new URL(input).origin;
  } catch {
    return "invalid-url";
  }
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
    logServerError("agent/provider.fetch", error, {
      provider,
      endpoint: endpointOrigin(input),
    });

    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderRequestError(friendlyProviderError(provider, 504), 504);
    }

    throw new ProviderRequestError(`${providerDisplayName(provider)} could not be reached. Check the provider status and try again.`);
  } finally {
    clearTimeout(timeout);
  }
}

async function parseProviderJson<T>(response: Response, provider: ProviderId): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    logServerError("agent/provider.parse", error, {
      provider,
      status: response.status,
    });
    throw new ProviderRequestError(`${providerDisplayName(provider)} returned an invalid response. Retry in a moment.`, 502);
  }
}

export async function callProvider(
  credentials: ProviderCredentials,
  messages: ChatMessage[],
  workingMessages: unknown[],
) {
  const apiFormat = providerApiFormat(credentials);

  if (apiFormat === "anthropic") {
    return callAnthropic(credentials, messages, workingMessages as AnthropicMessage[]);
  }

  if (apiFormat === "google") {
    return callGoogle(credentials, messages, workingMessages as GoogleContent[]);
  }

  return callOpenAiCompatible(credentials, messages, workingMessages as OpenAiMessage[]);
}

export function initialWorkingMessages(credentials: ProviderCredentials, messages: ChatMessage[]) {
  const apiFormat = providerApiFormat(credentials);

  if (apiFormat === "anthropic") {
    return toAnthropicMessages(messages);
  }

  if (apiFormat === "google") {
    return toGoogleContents(messages);
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
  const apiFormat = providerApiFormat(credentials);

  if (apiFormat === "anthropic") {
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

  if (apiFormat === "google") {
    const googleContents = workingMessages as GoogleContent[];
    const assistantContent = assistantMessage as GoogleContent;
    if (assistantContent?.parts?.length) {
      googleContents.push(assistantContent);
    }
    googleContents.push({
      role: "user",
      parts: results.map(({ toolCall, output }) => ({
        functionResponse: {
          name: toolCall.name,
          response: googleFunctionResponse(output),
        },
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
  const baseUrl = providerBaseUrl(credentials).replace(/\/$/, "");
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
      ...(credentials.provider === "kimi" && credentials.promptCacheKey
        ? { prompt_cache_key: credentials.promptCacheKey }
        : {}),
    }),
  });

  if (!response.ok) {
    const error = new Error(`Provider returned HTTP ${response.status}.`);
    logServerError("agent/provider.response", error, {
      provider: credentials.provider,
      status: response.status,
    });
    throw new ProviderRequestError(friendlyProviderError(credentials.provider, response.status), response.status);
  }

  const payload = await parseProviderJson<{
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
  }>(response, credentials.provider);

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
  const baseUrl = providerBaseUrl(credentials).replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("Missing Anthropic-compatible base URL.");
  }

  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const useAnthropicCaching = credentials.provider === "anthropic";
  const cachedSystem: AnthropicContentBlock[] = [
    {
      type: "text",
      text: system,
      ...(useAnthropicCaching ? { cache_control: { type: "ephemeral" } as const } : {}),
    },
  ];
  const cachedTools: AnthropicTool[] = anthropicTools.map((tool, index) => ({
    ...tool,
    ...(useAnthropicCaching && index === anthropicTools.length - 1
      ? { cache_control: { type: "ephemeral" } as const }
      : {}),
  }));

  const response = await providerFetch(credentials.provider, `${baseUrl}/messages`, {
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
    }),
  });

  if (!response.ok) {
    const error = new Error(`Provider returned HTTP ${response.status}.`);
    logServerError("agent/provider.response", error, {
      provider: credentials.provider,
      status: response.status,
    });
    throw new ProviderRequestError(friendlyProviderError(credentials.provider, response.status), response.status);
  }

  const payload = await parseProviderJson<{
    error?: { message?: string };
    content?: AnthropicContentBlock[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  }>(response, credentials.provider);

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

function toGoogleContents(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.role !== "system" && message.role !== "tool")
    .map((message) => ({
      role: message.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: message.content }],
    })) satisfies GoogleContent[];
}

function googleSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(googleSchema);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "additionalProperties")
        .map(([key, entry]) => [key, googleSchema(entry)]),
    );
  }

  return value;
}

function googleFunctionDeclarations() {
  return openAiTools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: googleSchema(tool.function.parameters),
  }));
}

function googleFunctionResponse(output: unknown): Record<string, unknown> {
  const serialized = JSON.stringify(output);
  const capped = (typeof serialized === "string" ? serialized : String(output)).slice(0, 16_000);

  try {
    const parsed = JSON.parse(capped) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { result: parsed };
  } catch {
    return { result: capped };
  }
}

async function callGoogle(
  credentials: ProviderCredentials,
  messages: ChatMessage[],
  workingContents: GoogleContent[],
): Promise<ProviderResponse> {
  const baseUrl = providerBaseUrl(credentials).replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("Missing Google Gemini-compatible base URL.");
  }

  const model = credentials.model.replace(/^models\//, "");
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const response = await providerFetch(
    credentials.provider,
    `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": credentials.apiKey,
      },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: workingContents,
        tools: [{ functionDeclarations: googleFunctionDeclarations() }],
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      }),
    },
  );

  if (!response.ok) {
    const error = new Error(`Provider returned HTTP ${response.status}.`);
    logServerError("agent/provider.response", error, {
      provider: credentials.provider,
      status: response.status,
    });
    throw new ProviderRequestError(friendlyProviderError(credentials.provider, response.status), response.status);
  }

  const payload = await parseProviderJson<{
    candidates?: Array<{ content?: GoogleContent }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      cachedContentTokenCount?: number;
    };
  }>(response, credentials.provider);
  const assistant = payload.candidates?.[0]?.content ?? { role: "model" as const, parts: [] };
  const text = assistant.parts
    .filter((part): part is { text: string } => "text" in part)
    .map((part) => part.text)
    .join("\n");
  const toolCalls = assistant.parts
    .filter(
      (part): part is { functionCall: { id?: string; name: string; args?: Record<string, unknown> } } =>
        "functionCall" in part,
    )
    .map((part, index) => ({
      id: part.functionCall.id || `google-tool-${index + 1}`,
      name: part.functionCall.name,
      input: part.functionCall.args ?? {},
    }));

  return {
    content: text,
    toolCalls,
    rawAssistantMessage: assistant,
    usage: {
      inputTokens: payload.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
      cachedInputTokens: payload.usageMetadata?.cachedContentTokenCount ?? 0,
    },
  };
}
