import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import { CREDIT_UNLOCK_AMOUNT } from "@/lib/credits";
import { getRequiredEnv } from "@/lib/env";
import { jsonInternalError, logServerError } from "@/lib/server-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const stripe = createStripeClient();
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      const webhookSecret = getRequiredEnv("STRIPE_WEBHOOK_SECRET");
      if (!webhookSecret.startsWith("whsec_")) {
        throw new Error("STRIPE_WEBHOOK_SECRET must be a Stripe endpoint signing secret.");
      }
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error) {
      logServerError("api/stripe/webhook.signature", error);
      return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id ?? session.metadata?.user_id;

      if (!userId) {
        logServerError("api/stripe/webhook", new Error("Missing user reference"), {
          eventId: event.id,
          sessionId: session.id,
        });
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
        logServerError("api/stripe/webhook.fulfillment", error, {
          eventId: event.id,
          sessionId: session.id,
          userId,
        });
        return jsonInternalError("Could not record payment");
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logServerError("api/stripe/webhook", error);
    return jsonInternalError();
  }
}
