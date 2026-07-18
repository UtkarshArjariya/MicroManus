import { NextResponse } from "next/server";

import { jsonInternalError, logServerError } from "@/lib/server-errors";
import { createClient } from "@/lib/supabase/server";

const STRIPE_SESSION_ID_PATTERN = /^cs_(?:test|live)_[A-Za-z0-9]+$/;

export async function GET(request: Request) {
  let userId: string | undefined;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Your session ended. Sign in again to view credits." }, { status: 401 });
    }

    userId = user.id;
    const stripeSessionId = new URL(request.url).searchParams.get("stripeSessionId");
    if (stripeSessionId && !STRIPE_SESSION_ID_PATTERN.test(stripeSessionId)) {
      return NextResponse.json({ error: "Invalid Stripe checkout session." }, { status: 400 });
    }

    const [walletResult, paymentResult] = await Promise.all([
      supabase
        .from("credit_wallets")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle(),
      stripeSessionId
        ? supabase
            .from("stripe_payments")
            .select("id")
            .eq("user_id", user.id)
            .eq("stripe_session_id", stripeSessionId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (walletResult.error || paymentResult.error) {
      logServerError("api/wallet.query", walletResult.error ?? paymentResult.error, { userId });
      return jsonInternalError("We couldn’t load your credit balance. Refresh the page and try again.");
    }

    return NextResponse.json({
      balance: walletResult.data?.balance ?? 0,
      checkoutFulfilled: stripeSessionId ? Boolean(paymentResult.data) : undefined,
    });
  } catch (error) {
    logServerError("api/wallet", error, { userId });
    return jsonInternalError();
  }
}
