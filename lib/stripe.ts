import "server-only";

import Stripe from "stripe";

import { getRequiredEnv } from "@/lib/env";

export function createStripeClient() {
  const secretKey = getRequiredEnv("STRIPE_SECRET_KEY");
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe test-mode secret key.");
  }

  return new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
  });
}
