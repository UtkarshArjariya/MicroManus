"use client";

import { useActionState, useEffect, useState } from "react";
import { CreditCard, Loader2, Ticket } from "lucide-react";

import { redeemCoupon } from "@/app/paywall/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { STRIPE_UNLOCK_COPY } from "@/lib/credits";
import { parseJsonResponse } from "@/lib/http";

type PaywallClientProps = {
  paymentCancelled: boolean;
  paymentSuccess: boolean;
};

export function PaywallClient({ paymentCancelled, paymentSuccess }: PaywallClientProps) {
  const [couponState, couponAction, isRedeeming] = useActionState(redeemCoupon, {});
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [pollMessage, setPollMessage] = useState<string | null>(
    paymentSuccess ? "Payment received, unlocking..." : null,
  );

  useEffect(() => {
    if (!paymentSuccess) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 12;

    async function pollWallet() {
      attempts += 1;

      try {
        const response = await fetch("/api/wallet", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Wallet polling failed.");
        }

        const data = await parseJsonResponse<{ balance?: number }>(response);

        if (!cancelled && typeof data?.balance === "number" && data.balance > 0) {
          window.location.assign("/app");
          return;
        }
      } catch {
        // Keep polling until the timeout message is shown.
      }

      if (!cancelled && attempts >= maxAttempts) {
        setPollMessage("This can take a few seconds. Refresh if needed.");
        return;
      }

      if (!cancelled) {
        window.setTimeout(pollWallet, 2500);
      }
    }

    void pollWallet();

    return () => {
      cancelled = true;
    };
  }, [paymentSuccess]);

  async function startCheckout() {
    setIsStartingCheckout(true);
    setCheckoutError(null);

    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
      });

      if (!response.ok) {
        const errorPayload = await parseJsonResponse<{ error?: string }>(response);
        setCheckoutError(errorPayload?.error ?? "Something went wrong. Try again.");
        return;
      }

      const data = await parseJsonResponse<{ url?: string }>(response);
      if (!data?.url) {
        setCheckoutError("Something went wrong. Try again.");
        return;
      }

      window.location.assign(data.url);
    } catch {
      setCheckoutError("Something went wrong. Try again.");
    } finally {
      setIsStartingCheckout(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ticket aria-hidden="true" className="h-5 w-5 text-primary" />
            Coupon code
          </CardTitle>
          <CardDescription>Redeem the launch code for 5 research credits.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={couponAction} className="space-y-3">
            <Input
              aria-label="Coupon code"
              autoCapitalize="characters"
              autoComplete="off"
              name="code"
              placeholder="SID_DRDROID"
            />
            {couponState.error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {couponState.error}
              </p>
            ) : null}
            <Button className="w-full" disabled={isRedeeming} type="submit">
              {isRedeeming ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Ticket aria-hidden="true" />}
              Unlock 5 credits
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CreditCard aria-hidden="true" className="h-5 w-5 text-primary" />
            Card payment
          </CardTitle>
          <CardDescription>Use Stripe Checkout in test mode for a one-time unlock.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pollMessage ? (
            <p className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-primary">
              {pollMessage}
            </p>
          ) : null}
          {paymentCancelled ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Checkout was cancelled. No credits were added and no payment was recorded.
            </p>
          ) : null}
          {checkoutError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {checkoutError}
            </p>
          ) : null}
          <Button className="w-full" disabled={isStartingCheckout} onClick={startCheckout} type="button">
            {isStartingCheckout ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <CreditCard aria-hidden="true" />
            )}
            {STRIPE_UNLOCK_COPY}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
