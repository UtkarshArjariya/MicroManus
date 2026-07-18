"use server";

import { redirect } from "next/navigation";

import { CREDIT_UNLOCK_AMOUNT, normalizeCouponCode, VALID_COUPON_CODE } from "@/lib/credits";
import { logServerError } from "@/lib/server-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RedeemState = {
  error?: string;
};

export async function redeemCoupon(_previousState: RedeemState, formData: FormData): Promise<RedeemState> {
  const code = normalizeCouponCode(String(formData.get("code") ?? ""));

  if (code !== VALID_COUPON_CODE) {
    return { error: "That code didn’t match our records. Try again, or pay by card instead." };
  }

  let user;

  try {
    const supabase = await createClient();
    const authResult = await supabase.auth.getUser();
    user = authResult.data.user;

    if (authResult.error) {
      throw authResult.error;
    }
  } catch (error) {
    logServerError("action/coupon.auth", error);
    return { error: "Your session ended. Sign in again, then retry the code." };
  }

  if (!user) {
    redirect("/login");
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("redeem_coupon_credit", {
      p_user_id: user.id,
      p_code: VALID_COUPON_CODE,
      p_delta: CREDIT_UNLOCK_AMOUNT,
    });

    if (error) {
      logServerError("action/coupon.redeem", error, { userId: user.id });
      if (error.message.includes("coupon_already_redeemed")) {
        return { error: "That code has already been used on this account. Pay by card to add more credits." };
      }

      return { error: "We couldn’t check that code. Try again in a moment, or pay by card instead." };
    }
  } catch (error) {
    logServerError("action/coupon", error, { userId: user.id });
    return { error: "We couldn’t check that code. Try again in a moment, or pay by card instead." };
  }

  redirect("/app");
}
