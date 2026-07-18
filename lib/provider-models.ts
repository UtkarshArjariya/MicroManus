import "server-only";

import { getDefaultBaseUrl, getProviderApiFormat, type ProviderApiFormat, type ProviderId } from "@/lib/models";

const MODEL_LIST_TIMEOUT_MS = 20_000;
const MAX_MODEL_PAGES = 20;

export type AvailableProviderModel = {
  id: string;
  label: string;
};

export class ProviderModelListError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "ProviderModelListError";
  }
}

type ListModelsInput = {
  provider: ProviderId;
  apiFormat?: ProviderApiFormat | null;
  apiKey: string;
  baseUrl?: string | null;
};

function providerName(provider: ProviderId) {
  if (provider === "anthropic") return "Anthropic";
  if (provider === "google") return "Google Gemini";
  if (provider === "kimi") return "Kimi";
  if (provider === "openai_compatible") return "The custom provider";
  return "OpenAI";
}

async function fetchModelJson<T>(provider: ProviderId, input: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_LIST_TIMEOUT_MS);

  try {
    const response = await fetch(input, { ...init, cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new ProviderModelListError(`${providerName(provider)} rejected this API key or project.`, 401);
      }
      if (response.status === 429) {
        throw new ProviderModelListError(`${providerName(provider)} rate-limited the model catalog request.`, 429);
      }
      throw new ProviderModelListError(`${providerName(provider)} could not list models.`, 502);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new ProviderModelListError(`${providerName(provider)} returned an invalid model catalog.`);
    }
  } catch (error) {
    if (error instanceof ProviderModelListError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderModelListError(`${providerName(provider)} timed out while listing models.`, 504);
    }
    throw new ProviderModelListError(`${providerName(provider)} could not be reached.`);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeModels(models: AvailableProviderModel[]) {
  const unique = new Map<string, AvailableProviderModel>();
  for (const model of models) {
    const id = model.id.trim();
    if (!id) continue;
    unique.set(id, { id, label: model.label.trim() || id });
  }

  return [...unique.values()].sort((left, right) =>
    left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" }),
  );
}

async function listOpenAiModels(input: ListModelsInput, baseUrl: string) {
  const payload = await fetchModelJson<{
    data?: Array<{ id?: string; name?: string; display_name?: string }>;
    models?: Array<{ id?: string; name?: string; display_name?: string }>;
  }>(input.provider, `${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${input.apiKey}`, Accept: "application/json" },
  });
  const rows = payload.data ?? payload.models ?? [];
  return rows.map((model) => ({
    id: model.id ?? model.name ?? "",
    label: model.display_name ?? model.name ?? model.id ?? "",
  }));
}

async function listAnthropicModels(input: ListModelsInput, baseUrl: string) {
  const models: AvailableProviderModel[] = [];
  let afterId = "";

  for (let page = 0; page < MAX_MODEL_PAGES; page += 1) {
    const url = new URL(`${baseUrl}/models`);
    url.searchParams.set("limit", "1000");
    if (afterId) url.searchParams.set("after_id", afterId);
    const payload = await fetchModelJson<{
      data?: Array<{ id?: string; display_name?: string }>;
      has_more?: boolean;
      last_id?: string;
    }>(input.provider, url.toString(), {
      headers: {
        "anthropic-version": "2023-06-01",
        "x-api-key": input.apiKey,
        Accept: "application/json",
      },
    });
    for (const model of payload.data ?? []) {
      models.push({ id: model.id ?? "", label: model.display_name ?? model.id ?? "" });
    }
    if (!payload.has_more || !payload.last_id || payload.last_id === afterId) break;
    afterId = payload.last_id;
  }

  return models;
}

async function listGoogleModels(input: ListModelsInput, baseUrl: string) {
  const models: AvailableProviderModel[] = [];
  let pageToken = "";

  for (let page = 0; page < MAX_MODEL_PAGES; page += 1) {
    const url = new URL(`${baseUrl}/models`);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const payload = await fetchModelJson<{
      models?: Array<{
        name?: string;
        displayName?: string;
        supportedGenerationMethods?: string[];
        supportedActions?: string[];
      }>;
      nextPageToken?: string;
    }>(input.provider, url.toString(), {
      headers: { "x-goog-api-key": input.apiKey, Accept: "application/json" },
    });
    for (const model of payload.models ?? []) {
      const methods = model.supportedGenerationMethods ?? model.supportedActions ?? [];
      if (methods.length > 0 && !methods.includes("generateContent")) continue;
      const id = (model.name ?? "").replace(/^models\//, "");
      models.push({ id, label: model.displayName ?? id });
    }
    if (!payload.nextPageToken || payload.nextPageToken === pageToken) break;
    pageToken = payload.nextPageToken;
  }

  return models;
}

export async function listProviderModels(input: ListModelsInput) {
  const apiFormat = getProviderApiFormat(input.provider, input.apiFormat);
  const baseUrl = (input.baseUrl || getDefaultBaseUrl(input.provider)).replace(/\/$/, "");
  if (!baseUrl) throw new ProviderModelListError("A base URL is required to list models.", 400);

  const models = apiFormat === "anthropic"
    ? await listAnthropicModels(input, baseUrl)
    : apiFormat === "google"
      ? await listGoogleModels(input, baseUrl)
      : await listOpenAiModels(input, baseUrl);

  return normalizeModels(models);
}
