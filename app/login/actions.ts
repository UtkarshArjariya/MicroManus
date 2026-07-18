"use server";

import { redirect } from "next/navigation";

import { getSiteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

type OAuthProvider = "google" | "github";

async function signInWithProvider(provider: OAuthProvider) {
  const supabase = await createClient();
  const siteUrl = getSiteUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=/app`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  if (data.url) {
    redirect(data.url);
  }

  redirect("/login?error=Unable%20to%20start%20OAuth%20flow");
}

export async function signInWithGoogle() {
  await signInWithProvider("google");
}

export async function signInWithGitHub() {
  await signInWithProvider("github");
}
