import "server-only";

import Stripe from "stripe";

import { getRequiredEnv } from "@/lib/env";

export function createStripeClient() {
  return new Stripe(getRequiredEnv("STRIPE_SECRET_KEY"));
}
