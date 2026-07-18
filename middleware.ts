import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname === "/paywall" || pathname.startsWith("/auth/");
}

function redirectWithCookies(url: URL, response: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}

async function getWalletBalance(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("credit_wallets")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.balance ?? 0;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const pathname = request.nextUrl.pathname;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return redirectWithCookies(loginUrl, response);
  }

  if (user && pathname === "/login") {
    const balance = await getWalletBalance(supabase, user.id);
    const destination = request.nextUrl.clone();
    destination.pathname = balance > 0 ? "/app" : "/paywall";
    destination.search = "";
    return redirectWithCookies(destination, response);
  }

  if (user && !isPublicPath(pathname)) {
    const balance = await getWalletBalance(supabase, user.id);

    if (balance <= 0) {
      const paywallUrl = request.nextUrl.clone();
      paywallUrl.pathname = "/paywall";
      paywallUrl.search = "";
      return redirectWithCookies(paywallUrl, response);
    }

    if (pathname === "/app") {
      const { data: latestChat } = await supabase
        .from("chats")
        .select("id")
        .eq("user_id", user.id)
        .eq("archived", false)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const destination = request.nextUrl.clone();
      destination.pathname = latestChat?.id ? `/app/${latestChat.id}` : "/app/new";
      destination.search = "";
      return redirectWithCookies(destination, response);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
