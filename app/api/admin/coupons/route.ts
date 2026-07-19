import { NextResponse } from "next/server";

import { authorizeAdminApi } from "@/lib/admin/auth";
import { loadAllPages } from "@/lib/admin/pagination";
import { jsonInternalError, logServerError } from "@/lib/server-errors";

const COUPON_CODE_PATTERN = /^[A-Z0-9_-]{3,64}$/;
const MAX_CREDIT_VALUE = 1_000_000;

function parsePositiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function parseOptionalPositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return { valid: true, value: null };
  const parsed = parsePositiveInteger(value);
  return parsed === null ? { valid: false, value: null } : { valid: true, value: parsed };
}

function parseOptionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return { valid: true, value: null };
  if (typeof value !== "string") return { valid: false, value: null };
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? { valid: false, value: null }
    : { valid: true, value: date.toISOString() };
}

export async function GET() {
  const authorization = await authorizeAdminApi();
  if (!authorization.authorized) return authorization.response;

  const { admin, identity } = authorization;

  try {
    const coupons = await loadAllPages<{
      id: string;
      code: string;
      credit_value: number;
      max_redemptions: number | null;
      redemption_count: number;
      expires_at: string | null;
      active: boolean;
      created_at: string;
    }>((from, to) =>
      admin
        .from("coupons")
        .select("id, code, credit_value, max_redemptions, redemption_count, expires_at, active, created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    );

    return NextResponse.json({
      coupons: coupons.map((coupon) => ({
        id: coupon.id,
        code: coupon.code,
        creditValue: coupon.credit_value,
        maxRedemptions: coupon.max_redemptions,
        redemptionCount: coupon.redemption_count,
        expiresAt: coupon.expires_at,
        active: coupon.active,
        createdAt: coupon.created_at,
      })),
    });
  } catch (error) {
    logServerError("api/admin/coupons", error, { adminUserId: identity.id });
    return jsonInternalError("We couldn’t load coupons.");
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminApi();
  if (!authorization.authorized) return authorization.response;

  const body = (await request.json().catch(() => null)) as {
    code?: unknown;
    creditValue?: unknown;
    maxRedemptions?: unknown;
    expiresAt?: unknown;
    active?: unknown;
  } | null;

  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  const creditValue = parsePositiveInteger(body?.creditValue);
  const maxRedemptions = parseOptionalPositiveInteger(body?.maxRedemptions);
  const expiresAt = parseOptionalDate(body?.expiresAt);
  const active = body?.active === undefined ? true : body.active;

  if (!COUPON_CODE_PATTERN.test(code)) {
    return NextResponse.json(
      { error: "Use 3–64 uppercase letters, numbers, underscores, or hyphens with no spaces." },
      { status: 400 },
    );
  }
  if (creditValue === null || creditValue > MAX_CREDIT_VALUE) {
    return NextResponse.json(
      { error: `Credit value must be a whole number from 1 to ${MAX_CREDIT_VALUE.toLocaleString()}.` },
      { status: 400 },
    );
  }
  if (!maxRedemptions.valid) {
    return NextResponse.json({ error: "Maximum redemptions must be a positive whole number." }, { status: 400 });
  }
  if (!expiresAt.valid) {
    return NextResponse.json({ error: "Enter a valid expiry date." }, { status: 400 });
  }
  if (typeof active !== "boolean") {
    return NextResponse.json({ error: "Active must be true or false." }, { status: 400 });
  }

  const { admin, identity } = authorization;

  try {
    const { data, error } = await admin.rpc("admin_create_coupon", {
      p_admin_user_id: identity.id,
      p_code: code,
      p_credit_value: creditValue,
      p_max_redemptions: maxRedemptions.value,
      p_expires_at: expiresAt.value,
      p_active: active,
    });

    if (error) {
      if (error.code === "23505" || error.message.includes("coupon_code_already_exists")) {
        return NextResponse.json({ error: "A coupon with that code already exists." }, { status: 409 });
      }
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(
      { couponId: result?.coupon_id, auditLogId: result?.audit_log_id },
      { status: 201 },
    );
  } catch (error) {
    logServerError("api/admin/coupons/create", error, { adminUserId: identity.id });
    return jsonInternalError("We couldn’t create that coupon.");
  }
}
