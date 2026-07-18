"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { encrypt } from "@/lib/crypto";
import { getDefaultBaseUrl, getDefaultModel, type ProviderId } from "@/lib/models";
import { logServerError } from "@/lib/server-errors";
import { createClient } from "@/lib/supabase/server";

const PROVIDERS = new Set<ProviderId>(["openai", "anthropic", "kimi", "openai_compatible"]);

export type ProviderKeyActionResult = {
  ok?: true;
  error?: string;
};

class ActionInputError extends Error {}

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function keyLast4(apiKey: string) {
  return apiKey.slice(-4);
}

function normalizeProvider(value: string): ProviderId {
  if (!PROVIDERS.has(value as ProviderId)) {
    throw new ActionInputError("Invalid provider.");
  }

  return value as ProviderId;
}

function normalizeBaseUrl(provider: ProviderId, baseUrl: string) {
  if (provider === "anthropic") {
    return null;
  }

  const normalized = baseUrl || getDefaultBaseUrl(provider);

  if (provider === "openai_compatible" && !normalized) {
    throw new ActionInputError("Base URL is required for custom OpenAI-compatible providers.");
  }

  return normalized.replace(/\/$/, "");
}

export async function saveProviderKey(formData: FormData): Promise<ProviderKeyActionResult> {
  let supabase;
  let user;

  try {
    supabase = await createClient();
    const authResult = await supabase.auth.getUser();
    user = authResult.data.user;
  } catch (error) {
    logServerError("action/provider-key.save.auth", error);
    return { error: "Could not verify your session. Try again." };
  }

  if (!user) {
    redirect("/login");
  }

  try {
    const id = text(formData, "id");
    const provider = normalizeProvider(text(formData, "provider"));
    const apiKey = text(formData, "apiKey");
    const label = text(formData, "label");
    const baseUrl = normalizeBaseUrl(provider, text(formData, "baseUrl"));
    const defaultModel = text(formData, "defaultModel") || getDefaultModel(provider);

    if (!label) {
      throw new ActionInputError("Label is required.");
    }

    if (!defaultModel) {
      throw new ActionInputError("Default model is required.");
    }

    if (id) {
      const updatePayload: Record<string, string | null> = {
        provider,
        label,
        base_url: baseUrl,
        default_model: defaultModel,
      };

      if (apiKey) {
        updatePayload.encrypted_key = encrypt(apiKey);
        updatePayload.key_last4 = keyLast4(apiKey);
      }

      const { error } = await supabase
        .from("provider_keys")
        .update(updatePayload)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        throw error;
      }
    } else {
      if (!apiKey) {
        throw new ActionInputError("API key is required.");
      }

      const { error } = await supabase.from("provider_keys").insert({
        user_id: user.id,
        provider,
        label,
        base_url: baseUrl,
        encrypted_key: encrypt(apiKey),
        key_last4: keyLast4(apiKey),
        default_model: defaultModel,
      });

      if (error) {
        throw error;
      }
    }

    revalidatePath("/app/settings/keys");
    revalidatePath("/app");
    return { ok: true };
  } catch (error) {
    logServerError("action/provider-key.save", error, { userId: user.id });
    return {
      error: error instanceof ActionInputError ? error.message : "Could not save the provider key. Try again.",
    };
  }
}

export async function deleteProviderKey(formData: FormData): Promise<ProviderKeyActionResult> {
  let supabase;
  let user;

  try {
    supabase = await createClient();
    const authResult = await supabase.auth.getUser();
    user = authResult.data.user;
  } catch (error) {
    logServerError("action/provider-key.delete.auth", error);
    return { error: "Could not verify your session. Try again." };
  }

  if (!user) {
    redirect("/login");
  }

  try {
    const id = text(formData, "id");
    if (!id) {
      throw new ActionInputError("Missing key id.");
    }

    const { error } = await supabase
      .from("provider_keys")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    revalidatePath("/app/settings/keys");
    revalidatePath("/app");
    return { ok: true };
  } catch (error) {
    logServerError("action/provider-key.delete", error, { userId: user.id });
    return {
      error: error instanceof ActionInputError ? error.message : "Could not delete the provider key. Try again.",
    };
  }
}
