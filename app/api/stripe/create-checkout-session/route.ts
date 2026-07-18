import { NextResponse } from "next/server";

import { CREDIT_UNLOCK_AMOUNT } from "@/lib/credits";
import { getRequiredEnv, getSiteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createStripeClient } from "@/lib/stripe";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = createStripeClient();
  const siteUrl = getSiteUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    line_items: [
      {
        price: getRequiredEnv("STRIPE_PRICE_ID"),
        quantity: 1,
      },
    ],
    metadata: {
      user_id: user.id,
      credits: String(CREDIT_UNLOCK_AMOUNT),
    },
    success_url: `${siteUrl}/paywall?stripe=success`,
    cancel_url: `${siteUrl}/paywall?stripe=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
