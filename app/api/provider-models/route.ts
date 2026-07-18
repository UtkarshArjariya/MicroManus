import { NextResponse } from "next/server";

import { decrypt } from "@/lib/crypto";
import {
  getDefaultBaseUrl,
  getProviderApiFormat,
  isProviderApiFormat,
  type ProviderApiFormat,
  type ProviderId,
} from "@/lib/models";
import { listProviderModels, ProviderModelListError } from "@/lib/provider-models";
import { jsonInternalError, logServerError } from "@/lib/server-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PROVIDERS = new Set<ProviderId>(["openai", "anthropic", "google", "kimi", "openai_compatible"]);

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let userId: string | undefined;
  let provider: ProviderId | undefined;

  try {
    const supabase = await createClient();
    const auth = await supabase.auth.getUser();
    const user = auth.data.user;
    if (!user) return jsonError("Your session ended. Sign in again, then load models.", 401);
    userId = user.id;

    const body = (await request.json().catch(() => null)) as {
      provider?: ProviderId;
      apiFormat?: ProviderApiFormat;
      apiKey?: string;
      baseUrl?: string;
      providerKeyId?: string;
    } | null;
    provider = body?.provider;
    if (!provider || !PROVIDERS.has(provider)) return jsonError("Choose a supported provider before loading models.");

    let apiKey = body?.apiKey?.trim() ?? "";
    let apiFormat = provider === "openai_compatible" ? body?.apiFormat : getProviderApiFormat(provider);
    let baseUrl = body?.baseUrl?.trim() || getDefaultBaseUrl(provider);

    if (!apiKey && body?.providerKeyId) {
      const admin = createAdminClient();
      const keyResult = await admin
        .from("provider_keys")
        .select("provider,api_format,base_url,encrypted_key")
        .eq("id", body.providerKeyId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (keyResult.error || !keyResult.data) {
        if (keyResult.error) logServerError("api/provider-models.key", keyResult.error, { userId });
        return jsonError("Saved provider key not found.", 404);
      }
      apiKey = decrypt(keyResult.data.encrypted_key);
      provider = keyResult.data.provider as ProviderId;
      apiFormat = keyResult.data.api_format as ProviderApiFormat;
      baseUrl = keyResult.data.base_url || getDefaultBaseUrl(provider);
    }

    if (!apiKey) return jsonError("Enter an API key before loading models.");
    if (!apiFormat || !isProviderApiFormat(apiFormat)) return jsonError("Choose the endpoint compatibility before loading models.");
    if (!baseUrl) return jsonError("Enter a base URL before loading models.");

    try {
      const models = await listProviderModels({ provider, apiFormat, apiKey, baseUrl });
      return NextResponse.json({ models });
    } catch (error) {
      logServerError("api/provider-models.provider", error, { userId, provider });
      if (error instanceof ProviderModelListError) return jsonError(error.message, error.status);
      return jsonError("The provider could not list models.", 502);
    }
  } catch (error) {
    logServerError("api/provider-models", error, { userId, provider });
    return jsonInternalError("We couldn’t load provider models.");
  }
}
