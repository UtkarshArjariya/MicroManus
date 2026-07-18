"use server";

import { redirect } from "next/navigation";

import { getSiteUrl } from "@/lib/env";
import { logServerError } from "@/lib/server-errors";
import { createClient } from "@/lib/supabase/server";

type OAuthProvider = "google" | "github";

async function signInWithProvider(provider: OAuthProvider) {
  let destination = "/login?error=Unable%20to%20start%20OAuth%20flow";

  try {
    const supabase = await createClient();
    const siteUrl = getSiteUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${siteUrl}/auth/callback?next=/app`,
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

export async function signInWithGoogle() {
  await signInWithProvider("google");
}

export async function signInWithGitHub() {
  await signInWithProvider("github");
}
