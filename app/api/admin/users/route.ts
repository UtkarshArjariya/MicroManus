import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { authorizeAdminApi } from "@/lib/admin/auth";
import { loadAllPages } from "@/lib/admin/pagination";
import { jsonInternalError, logServerError } from "@/lib/server-errors";
import { resolveUsageTotalCostUsd, type StoredUsageCost } from "@/lib/usage-cost";

const PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  kimi: "Kimi",
  openai_compatible: "Custom endpoint",
};

function latestDate(...values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

async function loadAllAuthUsers(admin: SupabaseClient) {
  const users: User[] = [];
  const perPage = 1_000;

  for (let page = 1; page <= 10_000; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage });
    if (result.error) throw result.error;
    users.push(...result.data.users);
    if (result.data.users.length < perPage) return users;
  }

  throw new Error("Auth user directory exceeded the safe pagination limit.");
}

export async function GET() {
  const authorization = await authorizeAdminApi();
  if (!authorization.authorized) return authorization.response;

  const { admin, identity } = authorization;

  try {
    const [profiles, wallets, chats, usageEvents, providerKeys, authUsers] =
      await Promise.all([
        loadAllPages<{
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        }>((from, to) =>
          admin
            .from("profiles")
            .select("id, email, display_name, avatar_url, created_at, updated_at")
            .order("id")
            .range(from, to),
        ),
        loadAllPages<{ user_id: string; balance: number }>((from, to) =>
          admin
            .from("credit_wallets")
            .select("user_id, balance")
            .order("user_id")
            .range(from, to),
        ),
        loadAllPages<{ id: string; user_id: string; updated_at: string }>((from, to) =>
          admin
            .from("chats")
            .select("id, user_id, updated_at")
            .order("id")
            .range(from, to),
        ),
        loadAllPages<StoredUsageCost & { chat_id: string; created_at: string }>((from, to) =>
          admin
            .from("usage_events")
            .select("chat_id, provider, model, input_tokens, output_tokens, cached_input_tokens, cache_write_tokens, total_cost_usd, created_at")
            .order("id")
            .range(from, to),
        ),
        loadAllPages<{ user_id: string; provider: string }>((from, to) =>
          admin
            .from("provider_keys")
            .select("user_id, provider")
            .order("id")
            .range(from, to),
        ),
        loadAllAuthUsers(admin),
      ]);

    const walletByUser = new Map(
      wallets.map((wallet) => [wallet.user_id, wallet.balance]),
    );
    const authUserById = new Map(authUsers.map((user) => [user.id, user]));
    const chatOwnerById = new Map<string, string>();
    const chatCountByUser = new Map<string, number>();
    const lastChatByUser = new Map<string, string>();

    for (const chat of chats) {
      chatOwnerById.set(chat.id, chat.user_id);
      chatCountByUser.set(chat.user_id, (chatCountByUser.get(chat.user_id) ?? 0) + 1);
      const latest = latestDate(lastChatByUser.get(chat.user_id), chat.updated_at);
      if (latest) lastChatByUser.set(chat.user_id, latest);
    }

    const spendByUser = new Map<string, number>();
    const lastUsageByUser = new Map<string, string>();
    for (const usage of usageEvents) {
      const userId = chatOwnerById.get(usage.chat_id);
      if (!userId) continue;
      spendByUser.set(userId, (spendByUser.get(userId) ?? 0) + resolveUsageTotalCostUsd(usage));
      const latest = latestDate(lastUsageByUser.get(userId), usage.created_at);
      if (latest) lastUsageByUser.set(userId, latest);
    }

    const providersByUser = new Map<string, Set<string>>();
    for (const key of providerKeys) {
      const providers = providersByUser.get(key.user_id) ?? new Set<string>();
      providers.add(PROVIDER_NAMES[key.provider] ?? key.provider);
      providersByUser.set(key.user_id, providers);
    }

    const users = profiles.map((profile) => {
      const authUser = authUserById.get(profile.id);
      const email = profile.email ?? authUser?.email ?? "Unknown email";
      return {
        id: profile.id,
        name: profile.display_name ?? email.split("@")[0],
        email,
        avatarUrl: profile.avatar_url,
        signupDate: authUser?.created_at ?? profile.created_at,
        balance: walletByUser.get(profile.id) ?? 0,
        totalChats: chatCountByUser.get(profile.id) ?? 0,
        totalSpentUsd: spendByUser.get(profile.id) ?? 0,
        providers: [...(providersByUser.get(profile.id) ?? new Set<string>())].sort(),
        lastActiveDate: latestDate(
          lastUsageByUser.get(profile.id),
          lastChatByUser.get(profile.id),
          authUser?.last_sign_in_at,
          profile.updated_at,
        ),
      };
    });

    return NextResponse.json({ users });
  } catch (error) {
    logServerError("api/admin/users", error, { adminUserId: identity.id });
    return jsonInternalError("We couldn’t load the user directory.");
  }
}
