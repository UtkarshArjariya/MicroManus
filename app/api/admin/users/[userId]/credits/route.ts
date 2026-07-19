import { NextResponse } from "next/server";

import { authorizeAdminApi } from "@/lib/admin/auth";
import { jsonInternalError, logServerError } from "@/lib/server-errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ADJUSTMENT = 1_000_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const authorization = await authorizeAdminApi();
  if (!authorization.authorized) return authorization.response;

  const { userId } = await params;
  if (!UUID_PATTERN.test(userId)) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    amount?: unknown;
    reason?: unknown;
  } | null;
  const amount = typeof body?.amount === "number" ? body.amount : Number(body?.amount);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > MAX_ADJUSTMENT) {
    return NextResponse.json(
      { error: `Enter a non-zero whole-credit adjustment up to ${MAX_ADJUSTMENT.toLocaleString()}.` },
      { status: 400 },
    );
  }

  if (reason.length < 3 || reason.length > 500) {
    return NextResponse.json(
      { error: "Give a reason between 3 and 500 characters." },
      { status: 400 },
    );
  }

  const { admin, identity } = authorization;

  try {
    const { data, error } = await admin.rpc("admin_adjust_credits", {
      p_admin_user_id: identity.id,
      p_target_user_id: userId,
      p_delta: amount,
      p_reason_text: reason,
    });

    if (error) {
      if (error.message.includes("admin_target_not_found")) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }
      if (error.message.includes("insufficient_credits")) {
        return NextResponse.json(
          { error: "That debit would make the user’s balance negative." },
          { status: 409 },
        );
      }
      if (error.message.includes("admin_adjustment_reason_required")) {
        return NextResponse.json({ error: "A reason is required." }, { status: 400 });
      }
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      balance: result?.wallet_balance,
      ledgerId: result?.ledger_id,
      auditLogId: result?.audit_log_id,
    });
  } catch (error) {
    logServerError("api/admin/users/credits", error, {
      adminUserId: identity.id,
      targetUserId: userId,
    });
    return jsonInternalError("We couldn’t apply that credit adjustment.");
  }
}
