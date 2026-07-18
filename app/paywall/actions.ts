"use server";

import { redirect } from "next/navigation";

import { CREDIT_UNLOCK_AMOUNT, normalizeCouponCode, VALID_COUPON_CODE } from "@/lib/credits";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RedeemState = {
  error?: string;
};

export async function redeemCoupon(_previousState: RedeemState, formData: FormData): Promise<RedeemState> {
  const code = normalizeCouponCode(String(formData.get("code") ?? ""));

  if (code !== VALID_COUPON_CODE) {
    return { error: "That coupon code is not valid." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("redeem_coupon_credit", {
    p_user_id: user.id,
    p_code: VALID_COUPON_CODE,
    p_delta: CREDIT_UNLOCK_AMOUNT,
  });

  if (error) {
    if (error.message.includes("coupon_already_redeemed")) {
      return { error: "You have already redeemed a coupon. You can still unlock with card payment." };
    }

    return { error: "Could not redeem the coupon. Try again in a moment." };
  }

  redirect("/app");
}
