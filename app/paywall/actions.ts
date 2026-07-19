"use server";

import { redirect } from "next/navigation";

import { DEFAULT_APP_RETURN_TO, validateAppReturnTo } from "@/lib/app-return-to";
import { normalizeCouponCode } from "@/lib/credits";
import { logServerError } from "@/lib/server-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RedeemState = {
  error?: string;
};

function couponErrorMessage(message: string) {
  if (message.includes("coupon_already_redeemed")) {
    return "You’ve already redeemed this coupon on this account.";
  }

  if (message.includes("coupon_expired")) {
    return "That coupon has expired and can no longer be redeemed.";
  }

  if (message.includes("coupon_fully_redeemed")) {
    return "That coupon has been fully redeemed.";
  }

  if (message.includes("coupon_wrong_code") || message.includes("coupon_inactive")) {
    return "That coupon code wasn’t found. Check it and try again.";
  }

  return null;
}

export async function redeemCoupon(_previousState: RedeemState, formData: FormData): Promise<RedeemState> {
  const code = normalizeCouponCode(String(formData.get("code") ?? ""));
  const requestedReturnTo = formData.get("returnTo");
  const returnTo = requestedReturnTo === null
    ? DEFAULT_APP_RETURN_TO
    : validateAppReturnTo(requestedReturnTo);

  if (!returnTo) {
    return { error: "We couldn’t return to that page safely. Refresh and try again." };
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
      p_code: code,
    });

    if (error) {
      logServerError("action/coupon.redeem", error, { userId: user.id });
      const message = couponErrorMessage(error.message);
      if (message) {
        return { error: message };
      }

      return { error: "We couldn’t check that code. Try again in a moment, or pay by card instead." };
    }
  } catch (error) {
    logServerError("action/coupon", error, { userId: user.id });
    return { error: "We couldn’t check that code. Try again in a moment, or pay by card instead." };
  }

  redirect(returnTo);
}
