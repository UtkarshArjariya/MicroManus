import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import { CREDIT_UNLOCK_AMOUNT } from "@/lib/credits";
import { getRequiredEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = createStripeClient();
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, getRequiredEnv("STRIPE_WEBHOOK_SECRET"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Stripe signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id ?? session.metadata?.user_id;

    if (!userId) {
      return NextResponse.json({ error: "Missing user reference" }, { status: 400 });
    }

    const admin = createAdminClient();
    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

    const { error } = await admin.rpc("grant_stripe_purchase_credit", {
      p_user_id: userId,
      p_stripe_session_id: session.id,
      p_stripe_payment_intent_id: paymentIntentId,
      p_amount_cents: session.amount_total ?? 0,
      p_currency: session.currency ?? "usd",
      p_status: session.payment_status ?? "paid",
      p_delta: CREDIT_UNLOCK_AMOUNT,
    });

    if (error) {
      return NextResponse.json({ error: "Could not record payment" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
