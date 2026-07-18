import { NextResponse } from "next/server";

import {
  CREDIT_UNLOCK_AMOUNT,
  STRIPE_UNLOCK_AMOUNT_MINOR,
  STRIPE_UNLOCK_CURRENCY,
} from "@/lib/credits";
import { getRequiredEnv, getSiteUrl } from "@/lib/env";
import { jsonInternalError, logServerError } from "@/lib/server-errors";
import { createClient } from "@/lib/supabase/server";
import { createStripeClient } from "@/lib/stripe";

export async function POST() {
  let userId: string | undefined;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Your session ended. Sign in again, then restart checkout." }, { status: 401 });
    }

    userId = user.id;
    const priceId = getRequiredEnv("STRIPE_PRICE_ID_INR");
    if (!priceId.startsWith("price_")) {
      throw new Error("STRIPE_PRICE_ID_INR must be a Stripe price ID beginning with price_.");
    }

    const stripe = createStripeClient();
    const price = await stripe.prices.retrieve(priceId);
    if (
      price.currency !== STRIPE_UNLOCK_CURRENCY ||
      price.unit_amount !== STRIPE_UNLOCK_AMOUNT_MINOR ||
      price.type !== "one_time"
    ) {
      throw new Error("STRIPE_PRICE_ID_INR must be the one-time ₹399 INR price for the credit package.");
    }

    const siteUrl = getSiteUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        user_id: user.id,
        credits: String(CREDIT_UNLOCK_AMOUNT),
        package: "research_unlock",
      },
      payment_intent_data: {
        description: `MicroManus — ${CREDIT_UNLOCK_AMOUNT} research credits`,
      },
      custom_text: {
        submit: {
          message: `This one-time payment adds ${CREDIT_UNLOCK_AMOUNT} research credits to your MicroManus account.`,
        },
      },
      success_url: `${siteUrl}/paywall?stripe=success`,
      cancel_url: `${siteUrl}/paywall?stripe=cancelled`,
    });

    if (!session.url) {
      throw new Error(`Stripe checkout session ${session.id} did not include a URL.`);
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logServerError("api/stripe/create-checkout-session", error, { userId });
    return jsonInternalError("We couldn’t start checkout. Try again in a moment.");
  }
}
