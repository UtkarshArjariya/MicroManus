import { NextResponse } from "next/server";

import { getSiteUrl } from "@/lib/env";
import { logServerError } from "@/lib/server-errors";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  let siteUrl = new URL(request.url).origin;

  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const next = requestUrl.searchParams.get("next") ?? "/app";
    siteUrl = getSiteUrl();

    if (code) {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        return NextResponse.redirect(new URL(next, siteUrl));
      }

      logServerError("auth/callback.exchange", error);
    }
  } catch (error) {
    logServerError("auth/callback", error);
  }

  return NextResponse.redirect(new URL("/login?error=Authentication%20failed", siteUrl));
}
