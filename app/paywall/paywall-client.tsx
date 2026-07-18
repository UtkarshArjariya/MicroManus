"use client";

import { useActionState, useEffect, useState } from "react";
import { CreditCard, Loader2, Ticket } from "lucide-react";

import { redeemCoupon } from "@/app/paywall/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InterfaceNotice } from "@/components/interface-notice";
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
        setCheckoutError(
          response.status === 401
            ? "Your session ended. Sign in again, then restart checkout."
            : "We couldn’t start checkout. Try again in a moment.",
        );
        return;
      }

      const data = await parseJsonResponse<{ url?: string }>(response);
      if (!data?.url) {
        setCheckoutError("We couldn’t start checkout. Try again in a moment.");
        return;
      }

      window.location.assign(data.url);
    } catch {
      setCheckoutError("We couldn’t reach checkout. Check your connection and try again.");
    } finally {
      setIsStartingCheckout(false);
    }
  }

  return (
    <div className="grid border border-ink/20 md:grid-cols-2">
      <Card className="rounded-none border-0 border-b border-ink/20 bg-paper-surface md:border-b-0 md:border-r">
        <CardHeader className="pb-4">
          <p className="utility-label">Option 01</p>
          <CardTitle className="mt-2 flex items-center gap-2 text-2xl">
            <Ticket aria-hidden="true" className="h-5 w-5 text-ochre" />
            Coupon code
          </CardTitle>
          <CardDescription>Redeem the launch code for five research credits.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={couponAction} className="space-y-3">
            <Input
              aria-label="Coupon code"
              autoCapitalize="characters"
              autoComplete="off"
              className="font-mono"
              name="code"
              placeholder="SID_DRDROID"
            />
            {couponState.error ? <InterfaceNotice tone="error">{couponState.error}</InterfaceNotice> : null}
            <Button className="w-full" disabled={isRedeeming} type="submit">
              {isRedeeming ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Ticket aria-hidden="true" />}
              Unlock 5 credits
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-none border-0 bg-paper-surface">
        <CardHeader className="pb-4">
          <p className="utility-label">Option 02</p>
          <CardTitle className="mt-2 flex items-center gap-2 text-2xl">
            <CreditCard aria-hidden="true" className="h-5 w-5 text-ochre" />
            Card payment
          </CardTitle>
          <CardDescription>Use Stripe Checkout for a one-time credit purchase.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pollMessage ? <InterfaceNotice tone="success">{pollMessage}</InterfaceNotice> : null}
          {paymentCancelled ? (
            <InterfaceNotice>
              Checkout closed before payment. Choose card payment when you&apos;re ready to continue.
            </InterfaceNotice>
          ) : null}
          {checkoutError ? <InterfaceNotice tone="error">{checkoutError}</InterfaceNotice> : null}
          <Button className="w-full" disabled={isStartingCheckout} onClick={startCheckout} type="button" variant="outline">
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
