"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { encrypt } from "@/lib/crypto";
import { getDefaultBaseUrl, getDefaultModel, type ProviderId } from "@/lib/models";
import { createClient } from "@/lib/supabase/server";

const PROVIDERS = new Set<ProviderId>(["openai", "anthropic", "kimi", "openai_compatible"]);

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function keyLast4(apiKey: string) {
  return apiKey.slice(-4);
}

function normalizeProvider(value: string): ProviderId {
  if (!PROVIDERS.has(value as ProviderId)) {
    throw new Error("Invalid provider.");
  }

  return value as ProviderId;
}

function normalizeBaseUrl(provider: ProviderId, baseUrl: string) {
  if (provider === "anthropic") {
    return null;
  }

  const normalized = baseUrl || getDefaultBaseUrl(provider);

  if (provider === "openai_compatible" && !normalized) {
    throw new Error("Base URL is required for custom OpenAI-compatible providers.");
  }

  return normalized.replace(/\/$/, "");
}

export async function saveProviderKey(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const id = text(formData, "id");
  const provider = normalizeProvider(text(formData, "provider"));
  const apiKey = text(formData, "apiKey");
  const label = text(formData, "label");
  const baseUrl = normalizeBaseUrl(provider, text(formData, "baseUrl"));
  const defaultModel = text(formData, "defaultModel") || getDefaultModel(provider);

  if (!label) {
    throw new Error("Label is required.");
  }

  if (!defaultModel) {
    throw new Error("Default model is required.");
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
      throw new Error(error.message);
    }
  } else {
    if (!apiKey) {
      throw new Error("API key is required.");
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
      throw new Error(error.message);
    }
  }

  revalidatePath("/app/settings/keys");
  revalidatePath("/app");
}

export async function deleteProviderKey(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const id = text(formData, "id");
  if (!id) {
    throw new Error("Missing key id.");
  }

  const { error } = await supabase
    .from("provider_keys")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app/settings/keys");
  revalidatePath("/app");
}
