import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getDefaultBaseUrl, type ProviderId } from "@/lib/models";
import { jsonInternalError, logServerError } from "@/lib/server-errors";

const PROVIDERS = new Set<ProviderId>(["openai", "anthropic", "kimi", "openai_compatible"]);
const TEST_TIMEOUT_MS = 15_000;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function testOpenAiCompatible(apiKey: string, baseUrl: string) {
  const response = await fetchWithTimeout(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(testErrorForStatus(response.status));
  }
}

async function testAnthropic(apiKey: string) {
  const response = await fetchWithTimeout("https://api.anthropic.com/v1/models?limit=1", {
    headers: {
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(testErrorForStatus(response.status));
  }
}

async function fetchWithTimeout(input: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Connection test timed out.");
    }

    throw new Error("Provider could not be reached.");
  } finally {
    clearTimeout(timeout);
  }
}

function testErrorForStatus(status: number) {
  if (status === 401 || status === 403) {
    return "Provider rejected this API key or project.";
  }

  if (status === 429) {
    return "Provider rate-limited the connection test.";
  }

  if (status >= 500) {
    return "Provider is temporarily unavailable.";
  }

  return `Connection test failed with HTTP ${status}.`;
}

export async function POST(request: Request) {
  let userId: string | undefined;
  let provider: ProviderId | undefined;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    userId = user.id;
    const body = (await request.json().catch(() => null)) as {
      provider?: ProviderId;
      apiKey?: string;
      baseUrl?: string;
    } | null;

    provider = body?.provider;
    const apiKey = body?.apiKey?.trim();
    const baseUrl = body?.baseUrl?.trim() || (provider ? getDefaultBaseUrl(provider) : "");

    if (!provider || !PROVIDERS.has(provider)) {
      return jsonError("Invalid provider.");
    }

    if (!apiKey) {
      return jsonError("Missing API key.");
    }

    if (provider === "openai_compatible" && !baseUrl) {
      return jsonError("Base URL is required for custom OpenAI-compatible providers.");
    }

    try {
      if (provider === "anthropic") {
        await testAnthropic(apiKey);
      } else {
        await testOpenAiCompatible(apiKey, baseUrl);
      }
    } catch (error) {
      logServerError("api/provider-keys/test.provider", error, { userId, provider });
      return jsonError(error instanceof Error ? error.message : "Connection test failed.", 502);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError("api/provider-keys/test", error, { userId, provider });
    return jsonInternalError("Connection test failed.");
  }
}
