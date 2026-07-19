import { NextResponse } from "next/server";

import { authorizeAdminApi } from "@/lib/admin/auth";
import { jsonInternalError, logServerError } from "@/lib/server-errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CREDIT_VALUE = 1_000_000;

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function positiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function optionalPositiveInteger(value: unknown) {
  if (value === null || value === "") return { valid: true, value: null };
  const parsed = positiveInteger(value);
  return parsed === null ? { valid: false, value: null } : { valid: true, value: parsed };
}

function optionalDate(value: unknown) {
  if (value === null || value === "") return { valid: true, value: null };
  if (typeof value !== "string") return { valid: false, value: null };
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? { valid: false, value: null }
    : { valid: true, value: date.toISOString() };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ couponId: string }> },
) {
  const authorization = await authorizeAdminApi();
  if (!authorization.authorized) return authorization.response;

  const { couponId } = await params;
  if (!UUID_PATTERN.test(couponId)) {
    return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Coupon changes are required." }, { status: 400 });
  }

  const { admin, identity } = authorization;

  try {
    const { data: current, error: currentError } = await admin
      .from("coupons")
      .select("credit_value, max_redemptions, redemption_count, expires_at, active")
      .eq("id", couponId)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!current) {
      return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
    }

    const creditValue = hasOwn(body, "creditValue")
      ? positiveInteger(body.creditValue)
      : current.credit_value;
    const maxRedemptions = hasOwn(body, "maxRedemptions")
      ? optionalPositiveInteger(body.maxRedemptions)
      : { valid: true, value: current.max_redemptions };
    const expiresAt = hasOwn(body, "expiresAt")
      ? optionalDate(body.expiresAt)
      : { valid: true, value: current.expires_at };
    const active = hasOwn(body, "active") ? body.active : current.active;

    if (creditValue === null || creditValue > MAX_CREDIT_VALUE) {
      return NextResponse.json(
        { error: `Credit value must be a whole number from 1 to ${MAX_CREDIT_VALUE.toLocaleString()}.` },
        { status: 400 },
      );
    }
    if (!maxRedemptions.valid) {
      return NextResponse.json({ error: "Maximum redemptions must be a positive whole number." }, { status: 400 });
    }
    if (maxRedemptions.value !== null && maxRedemptions.value < current.redemption_count) {
      return NextResponse.json(
        { error: "Maximum redemptions cannot be lower than redemptions already used." },
        { status: 409 },
      );
    }
    if (!expiresAt.valid) {
      return NextResponse.json({ error: "Enter a valid expiry date." }, { status: 400 });
    }
    if (typeof active !== "boolean") {
      return NextResponse.json({ error: "Active must be true or false." }, { status: 400 });
    }

    const { data, error } = await admin.rpc("admin_update_coupon", {
      p_admin_user_id: identity.id,
      p_coupon_id: couponId,
      p_credit_value: creditValue,
      p_max_redemptions: maxRedemptions.value,
      p_expires_at: expiresAt.value,
      p_active: active,
    });

    if (error) {
      if (error.message.includes("coupon_not_found")) {
        return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
      }
      if (error.message.includes("coupon_max_below_redemptions")) {
        return NextResponse.json(
          { error: "Maximum redemptions cannot be lower than redemptions already used." },
          { status: 409 },
        );
      }
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      couponId: result?.coupon_id,
      auditLogId: result?.audit_log_id,
    });
  } catch (error) {
    logServerError("api/admin/coupons/update", error, {
      adminUserId: identity.id,
      couponId,
    });
    return jsonInternalError("We couldn’t update that coupon.");
  }
}
