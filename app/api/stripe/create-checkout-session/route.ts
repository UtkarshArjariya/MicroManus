import { NextResponse } from "next/server";

import {
  DEFAULT_APP_RETURN_TO,
  setAppReturnToSearchParam,
  validateAppReturnTo,
} from "@/lib/app-return-to";
import {
  CREDIT_UNLOCK_AMOUNT,
  STRIPE_UNLOCK_AMOUNT_MINOR,
  STRIPE_UNLOCK_CURRENCY,
} from "@/lib/credits";
import { getRequiredEnv, getSiteUrl } from "@/lib/env";
import { jsonInternalError, logServerError } from "@/lib/server-errors";
import { createClient } from "@/lib/supabase/server";
import { createStripeClient } from "@/lib/stripe";

type CheckoutRequest = {
  returnTo?: unknown;
};

const CHECKOUT_SESSION_PLACEHOLDER = "{CHECKOUT_SESSION_ID}";

function paywallCallbackPath(
  status: "success" | "cancelled",
  returnTo: string,
  stripeSessionId?: string,
) {
  const searchParams = new URLSearchParams({
    stripe: status,
    returnTo,
  });
  if (stripeSessionId) {
    searchParams.set("stripe_session_id", stripeSessionId);
  }
  return `/paywall?${searchParams.toString()}`;
}

function preserveStripePlaceholder(path: string) {
  return path.replace(encodeURIComponent(CHECKOUT_SESSION_PLACEHOLDER), CHECKOUT_SESSION_PLACEHOLDER);
}

export async function POST(request: Request) {
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
    let body: CheckoutRequest = {};
    const rawBody = await request.text();
    if (rawBody) {
      try {
        const parsedBody: unknown = JSON.parse(rawBody);
        if (typeof parsedBody !== "object" || parsedBody === null || Array.isArray(parsedBody)) {
          return NextResponse.json({ error: "Checkout request must be a JSON object." }, { status: 400 });
        }
        body = parsedBody as CheckoutRequest;
      } catch {
        return NextResponse.json({ error: "Checkout request must be valid JSON." }, { status: 400 });
      }
    }

    const returnTo = body.returnTo === undefined
      ? DEFAULT_APP_RETURN_TO
      : validateAppReturnTo(body.returnTo);
    if (!returnTo) {
      return NextResponse.json(
        { error: "Checkout can only return to a page inside the MicroManus app." },
        { status: 400 },
      );
    }

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
    const usesStandalonePaywall = returnTo === DEFAULT_APP_RETURN_TO;
    const successPathWithStatus = usesStandalonePaywall
      ? paywallCallbackPath("success", returnTo, CHECKOUT_SESSION_PLACEHOLDER)
      : setAppReturnToSearchParam(
          setAppReturnToSearchParam(returnTo, "stripe", "success"),
          "stripe_session_id",
          CHECKOUT_SESSION_PLACEHOLDER,
        );
    const successPath = preserveStripePlaceholder(successPathWithStatus);
    const cancelPath = usesStandalonePaywall
      ? paywallCallbackPath("cancelled", returnTo)
      : setAppReturnToSearchParam(returnTo, "stripe", "cancelled");

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
      success_url: `${siteUrl}${successPath}`,
      cancel_url: `${siteUrl}${cancelPath}`,
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
