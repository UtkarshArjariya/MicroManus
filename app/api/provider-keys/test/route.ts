import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getDefaultBaseUrl, type ProviderId } from "@/lib/models";

const PROVIDERS = new Set<ProviderId>(["openai", "anthropic", "kimi", "openai_compatible"]);

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function testOpenAiCompatible(apiKey: string, baseUrl: string) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body.slice(0, 240) || `HTTP ${response.status}`);
  }
}

async function testAnthropic(apiKey: string) {
  const response = await fetch("https://api.anthropic.com/v1/models?limit=1", {
    headers: {
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body.slice(0, 240) || `HTTP ${response.status}`);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const body = (await request.json().catch(() => null)) as {
    provider?: ProviderId;
    apiKey?: string;
    baseUrl?: string;
  } | null;

  const provider = body?.provider;
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Connection test failed.", 502);
  }
}
