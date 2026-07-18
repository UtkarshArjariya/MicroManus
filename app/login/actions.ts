"use server";

import { redirect } from "next/navigation";

import { resolveAppReturnTo } from "@/lib/app-return-to";
import { getSiteUrl } from "@/lib/env";
import { logServerError } from "@/lib/server-errors";
import { createClient } from "@/lib/supabase/server";

type OAuthProvider = "google" | "github";

async function signInWithProvider(provider: OAuthProvider, formData: FormData) {
  let destination = "/login?error=Unable%20to%20start%20OAuth%20flow";

  try {
    const supabase = await createClient();
    const siteUrl = getSiteUrl();
    const returnTo = resolveAppReturnTo(formData.get("next"));
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(returnTo)}`,
      },
    });

    if (error) {
      logServerError("action/login.oauth", error, { provider });
    } else if (data.url) {
      destination = data.url;
    }
  } catch (error) {
    logServerError("action/login", error, { provider });
  }

  redirect(destination);
}

export async function signInWithGoogle(formData: FormData) {
  await signInWithProvider("google", formData);
}

export async function signInWithGitHub(formData: FormData) {
  await signInWithProvider("github", formData);
}
