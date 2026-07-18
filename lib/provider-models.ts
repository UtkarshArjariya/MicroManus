import "server-only";

import { getDefaultBaseUrl, getProviderApiFormat, type ProviderApiFormat, type ProviderId } from "@/lib/models";

const MODEL_LIST_TIMEOUT_MS = 20_000;
const MAX_MODEL_PAGES = 20;

export type AvailableProviderModel = {
  id: string;
  label: string;
  releasedAt: string | null;
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

type ProviderModelRow = {
  id?: string;
  name?: string;
  display_name?: string;
  created?: number | string;
  created_at?: string;
  createTime?: string;
  release_date?: string;
  released_at?: string;
};

function normalizeReleaseDate(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;

  const numericValue = typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())
    ? Number(value)
    : value;
  const timestamp = typeof numericValue === "number"
    ? numericValue * (numericValue < 10_000_000_000 ? 1_000 : 1)
    : Date.parse(numericValue);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;

  return new Date(timestamp).toISOString();
}

function inferReleaseDateFromId(id: string) {
  const compactDate = id.match(/(?:^|[-_])(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])(?:$|[-_])/);
  if (compactDate) {
    return normalizeReleaseDate(`${compactDate[1]}-${compactDate[2]}-${compactDate[3]}T00:00:00Z`);
  }

  const dashedDate = id.match(/(?:^|[-_])(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])(?:$|[-_])/);
  if (dashedDate) {
    return normalizeReleaseDate(`${dashedDate[1]}-${dashedDate[2]}-${dashedDate[3]}T00:00:00Z`);
  }

  return null;
}

function releaseDateForModel(model: ProviderModelRow) {
  return normalizeReleaseDate(
    model.created ?? model.created_at ?? model.createTime ?? model.release_date ?? model.released_at,
  ) ?? inferReleaseDateFromId(model.id ?? model.name ?? "");
}

function normalizeModels(models: AvailableProviderModel[]) {
  const unique = new Map<string, AvailableProviderModel>();
  for (const model of models) {
    const id = model.id.trim();
    if (!id) continue;
    const existing = unique.get(id);
    unique.set(id, {
      id,
      label: model.label.trim() || existing?.label || id,
      releasedAt: model.releasedAt ?? existing?.releasedAt ?? inferReleaseDateFromId(id),
    });
  }

  return [...unique.values()]
    .map((model, providerOrder) => ({ model, providerOrder }))
    .sort((left, right) => {
      const leftRelease = left.model.releasedAt ? Date.parse(left.model.releasedAt) : null;
      const rightRelease = right.model.releasedAt ? Date.parse(right.model.releasedAt) : null;
      if (leftRelease !== null && rightRelease !== null && leftRelease !== rightRelease) {
        return rightRelease - leftRelease;
      }
      if (leftRelease !== null && rightRelease === null) return -1;
      if (leftRelease === null && rightRelease !== null) return 1;
      return left.providerOrder - right.providerOrder;
    })
    .map(({ model }) => model);
}

async function listOpenAiModels(input: ListModelsInput, baseUrl: string) {
  const payload = await fetchModelJson<{
    data?: ProviderModelRow[];
    models?: ProviderModelRow[];
  }>(input.provider, `${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${input.apiKey}`, Accept: "application/json" },
  });
  const rows = payload.data ?? payload.models ?? [];
  return rows.map((model) => ({
    id: model.id ?? model.name ?? "",
    label: model.display_name ?? model.name ?? model.id ?? "",
    releasedAt: releaseDateForModel(model),
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
      data?: Array<ProviderModelRow>;
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
      models.push({
        id: model.id ?? "",
        label: model.display_name ?? model.id ?? "",
        releasedAt: releaseDateForModel(model),
      });
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
        createTime?: string;
        release_date?: string;
        released_at?: string;
      }>;
      nextPageToken?: string;
    }>(input.provider, url.toString(), {
      headers: { "x-goog-api-key": input.apiKey, Accept: "application/json" },
    });
    for (const model of payload.models ?? []) {
      const methods = model.supportedGenerationMethods ?? model.supportedActions ?? [];
      if (methods.length > 0 && !methods.includes("generateContent")) continue;
      const id = (model.name ?? "").replace(/^models\//, "");
      models.push({
        id,
        label: model.displayName ?? id,
        releasedAt: releaseDateForModel({ ...model, id }),
      });
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
