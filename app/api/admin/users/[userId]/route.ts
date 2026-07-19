import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { authorizeAdminApi } from "@/lib/admin/auth";
import { loadAllPages } from "@/lib/admin/pagination";
import { jsonInternalError, logServerError } from "@/lib/server-errors";
import { resolveUsageTotalCostUsd, type StoredUsageCost } from "@/lib/usage-cost";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

async function loadUsageForChats(admin: SupabaseClient, chatIds: string[]) {
  const rows: Array<StoredUsageCost & { chat_id: string; created_at: string }> = [];

  for (let start = 0; start < chatIds.length; start += 100) {
    const ids = chatIds.slice(start, start + 100);
    rows.push(
      ...(await loadAllPages<StoredUsageCost & { chat_id: string; created_at: string }>((from, to) =>
        admin
          .from("usage_events")
          .select("chat_id, provider, model, input_tokens, output_tokens, cached_input_tokens, cache_write_tokens, total_cost_usd, created_at")
          .in("chat_id", ids)
          .order("id")
          .range(from, to),
      )),
    );
  }

  return rows;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const authorization = await authorizeAdminApi();
  if (!authorization.authorized) return authorization.response;

  const { userId } = await params;
  if (!UUID_PATTERN.test(userId)) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const { admin, identity } = authorization;

  try {
    const [profileResult, walletResult, ledger, chatRows, providerKeyRows, authUserResult] =
      await Promise.all([
        admin
          .from("profiles")
          .select("id, email, display_name, avatar_url, created_at, updated_at")
          .eq("id", userId)
          .maybeSingle(),
        admin.from("credit_wallets").select("balance").eq("user_id", userId).maybeSingle(),
        loadAllPages<{
          id: string;
          delta: number;
          reason: string;
          reference_id: string | null;
          created_at: string;
        }>((from, to) =>
          admin
            .from("credit_ledger")
            .select("id, delta, reason, reference_id, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to),
        ),
        loadAllPages<{
          id: string;
          title: string;
          model: string;
          created_at: string;
          updated_at: string;
        }>((from, to) =>
          admin
            .from("chats")
            .select("id, title, model, created_at, updated_at")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to),
        ),
        loadAllPages<{
          id: string;
          provider: string;
          label: string;
          key_last4: string;
          default_model: string;
          created_at: string;
          last_tested_at: string | null;
        }>((from, to) =>
          admin
            .from("provider_keys")
            .select("id, provider, label, key_last4, default_model, created_at, last_tested_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to),
        ),
        admin.auth.admin.getUserById(userId),
      ]);

    const failed = [profileResult, walletResult].find((result) => result.error);
    if (failed?.error) throw failed.error;

    if (!profileResult.data || authUserResult.error || !authUserResult.data.user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const chatIds = chatRows.map((chat) => chat.id);
    const usageRows = await loadUsageForChats(admin, chatIds);

    const costByChat = new Map<string, number>();
    let lastUsageAt: string | null = null;
    for (const usage of usageRows) {
      costByChat.set(
        usage.chat_id,
        (costByChat.get(usage.chat_id) ?? 0) + resolveUsageTotalCostUsd(usage),
      );
      lastUsageAt = latestDate(lastUsageAt, usage.created_at);
    }

    const providerNames = new Set<string>();
    for (const key of providerKeyRows) {
      providerNames.add(PROVIDER_NAMES[key.provider] ?? key.provider);
    }

    const profile = profileResult.data;
    const authUser = authUserResult.data.user;
    const email = profile.email ?? authUser.email ?? "Unknown email";
    const totalSpentUsd = [...costByChat.values()].reduce((sum, value) => sum + value, 0);

    return NextResponse.json({
      user: {
        id: profile.id,
        name: profile.display_name ?? email.split("@")[0],
        email,
        avatarUrl: profile.avatar_url,
        signupDate: authUser.created_at ?? profile.created_at,
        balance: walletResult.data?.balance ?? 0,
        totalChats: chatRows.length,
        totalSpentUsd,
        providers: [...providerNames].sort(),
        lastActiveDate: latestDate(
          lastUsageAt,
          chatRows[0]?.updated_at,
          authUser.last_sign_in_at,
          profile.updated_at,
        ),
      },
      ledger: ledger.map((entry) => ({
        id: entry.id,
        delta: entry.delta,
        reason: entry.reason,
        referenceId: entry.reference_id,
        createdAt: entry.created_at,
      })),
      chats: chatRows.map((chat) => ({
        id: chat.id,
        title: chat.title,
        model: chat.model,
        totalCostUsd: costByChat.get(chat.id) ?? 0,
        createdAt: chat.created_at,
        updatedAt: chat.updated_at,
      })),
      providerKeys: providerKeyRows.map((key) => ({
        id: key.id,
        provider: key.provider,
        label: key.label,
        maskedKey: `••••${key.key_last4}`,
        model: key.default_model,
        createdAt: key.created_at,
        lastTestedAt: key.last_tested_at,
      })),
    });
  } catch (error) {
    logServerError("api/admin/users/detail", error, {
      adminUserId: identity.id,
      targetUserId: userId,
    });
    return jsonInternalError("We couldn’t load this user.");
  }
}
