import "server-only";

import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AdminIdentity = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

type AdminApiAuthorization =
  | {
      authorized: true;
      admin: ReturnType<typeof createAdminClient>;
      identity: AdminIdentity;
    }
  | {
      authorized: false;
      response: NextResponse;
    };

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function resolveAdminIdentity(): Promise<
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "authorized"; admin: ReturnType<typeof createAdminClient>; identity: AdminIdentity }
> {
  const sessionClient = await createClient();
  const {
    data: { user },
    error: authError,
  } = await sessionClient.auth.getUser();

  if (authError || !user) {
    return { status: "unauthenticated" };
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("email, display_name, avatar_url, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.is_admin) {
    return { status: "forbidden" };
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const email = profile.email ?? user.email ?? "Signed-in account";
  const name =
    profile.display_name ??
    metadataString(metadata, "full_name") ??
    metadataString(metadata, "name") ??
    metadataString(metadata, "user_name") ??
    metadataString(metadata, "preferred_username") ??
    email.split("@")[0];
  const avatarUrl =
    profile.avatar_url ?? metadataString(metadata, "avatar_url") ?? metadataString(metadata, "picture");

  return {
    status: "authorized",
    admin,
    identity: { id: user.id, email, name, avatarUrl },
  };
}

export async function requireAdminPage(): Promise<AdminIdentity> {
  const authorization = await resolveAdminIdentity();

  if (authorization.status === "unauthenticated") {
    redirect("/login");
  }

  if (authorization.status === "forbidden") {
    redirect("/app");
  }

  return authorization.identity;
}

export async function authorizeAdminApi(): Promise<AdminApiAuthorization> {
  const authorization = await resolveAdminIdentity();

  if (authorization.status === "unauthenticated") {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  if (authorization.status === "forbidden") {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return {
    authorized: true,
    admin: authorization.admin,
    identity: authorization.identity,
  };
}
