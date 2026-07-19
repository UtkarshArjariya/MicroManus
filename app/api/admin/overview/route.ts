import { NextResponse } from "next/server";

import { authorizeAdminApi } from "@/lib/admin/auth";
import { loadAllPages } from "@/lib/admin/pagination";
import { jsonInternalError, logServerError } from "@/lib/server-errors";
import { resolveUsageTotalCostUsd, type StoredUsageCost } from "@/lib/usage-cost";

export async function GET() {
  const authorization = await authorizeAdminApi();
  if (!authorization.authorized) return authorization.response;

  const { admin, identity } = authorization;

  try {
    const [
      usersResult,
      ledger,
      payments,
      chatsResult,
      messagesResult,
      usage,
      couponsResult,
    ] = await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }),
      loadAllPages<{ delta: number; reason: string }>((from, to) =>
        admin
          .from("credit_ledger")
          .select("delta, reason")
          .gt("delta", 0)
          .order("id")
          .range(from, to),
      ),
      loadAllPages<{ amount_cents: number; currency: string }>((from, to) =>
        admin
          .from("stripe_payments")
          .select("amount_cents, currency")
          .eq("status", "paid")
          .order("id")
          .range(from, to),
      ),
      admin.from("chats").select("id", { count: "exact", head: true }),
      admin.from("messages").select("id", { count: "exact", head: true }),
      loadAllPages<StoredUsageCost>((from, to) =>
        admin
          .from("usage_events")
          .select("provider, model, input_tokens, output_tokens, cached_input_tokens, cache_write_tokens, total_cost_usd")
          .order("id")
          .range(from, to),
      ),
      admin
        .from("coupons")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
    ]);

    const failed = [
      usersResult,
      chatsResult,
      messagesResult,
      couponsResult,
    ].find((result) => result.error);

    if (failed?.error) {
      throw failed.error;
    }

    const revenueByCurrency = new Map<string, number>();
    for (const payment of payments) {
      const currency = payment.currency.toLowerCase();
      revenueByCurrency.set(currency, (revenueByCurrency.get(currency) ?? 0) + payment.amount_cents);
    }

    return NextResponse.json({
      overview: {
        totalUsers: usersResult.count ?? 0,
        totalCreditsIssued: ledger.reduce((sum, row) => sum + row.delta, 0),
        couponCreditsIssued: ledger
          .filter((row) => row.reason === "coupon_redeem")
          .reduce((sum, row) => sum + row.delta, 0),
        stripeCreditsIssued: ledger
          .filter((row) => row.reason === "stripe_purchase")
          .reduce((sum, row) => sum + row.delta, 0),
        stripeRevenue: [...revenueByCurrency.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([currency, amountMinor]) => ({ currency, amountMinor })),
        totalChats: chatsResult.count ?? 0,
        totalMessages: messagesResult.count ?? 0,
        totalLlmCostUsd: usage.reduce((sum, row) => sum + resolveUsageTotalCostUsd(row), 0),
        activeCoupons: couponsResult.count ?? 0,
      },
    });
  } catch (error) {
    logServerError("api/admin/overview", error, { adminUserId: identity.id });
    return jsonInternalError("We couldn’t load the admin overview.");
  }
}
