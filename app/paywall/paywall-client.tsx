"use client";

import { useActionState, useEffect, useState } from "react";
import { CreditCard, Loader2, Ticket } from "lucide-react";

import { redeemCoupon } from "@/app/paywall/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InterfaceNotice } from "@/components/interface-notice";
import { resolveAppReturnTo } from "@/lib/app-return-to";
import { CREDIT_UNLOCK_AMOUNT, STRIPE_UNLOCK_PRICE_DISPLAY } from "@/lib/credits";
import { parseJsonResponse } from "@/lib/http";
import { cn } from "@/lib/utils";

export type PaywallClientProps = {
  embedded?: boolean;
  paymentCancelled?: boolean;
  paymentSuccess?: boolean;
  returnTo?: string;
};

export function PaywallClient({
  embedded = false,
  paymentCancelled = false,
  paymentSuccess = false,
  returnTo = "/app",
}: PaywallClientProps) {
  const safeReturnTo = resolveAppReturnTo(returnTo);
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
        const stripeSessionId = new URLSearchParams(window.location.search).get("stripe_session_id");
        const walletUrl = new URL("/api/wallet", window.location.origin);
        if (stripeSessionId) {
          walletUrl.searchParams.set("stripeSessionId", stripeSessionId);
        }
        const response = await fetch(walletUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Wallet polling failed.");
        }

        const data = await parseJsonResponse<{ balance?: number; checkoutFulfilled?: boolean }>(response);
        const checkoutIsReady = stripeSessionId
          ? data?.checkoutFulfilled === true
          : typeof data?.balance === "number" && data.balance > 0;

        if (!cancelled && checkoutIsReady) {
          window.location.assign(safeReturnTo);
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
  }, [paymentSuccess, safeReturnTo]);

  async function startCheckout() {
    setIsStartingCheckout(true);
    setCheckoutError(null);

    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        body: JSON.stringify({ returnTo: safeReturnTo }),
        headers: { "Content-Type": "application/json" },
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
    <div
      className={cn(
        "grid",
        embedded ? "gap-4 xl:grid-cols-2" : "border border-ink/20 md:grid-cols-2",
      )}
    >
      <Card
        className={cn(
          "rounded-none bg-paper-surface",
          embedded
            ? "border border-ink/20"
            : "border-0 border-b border-ink/20 md:border-b-0 md:border-r",
        )}
      >
        <CardHeader className="pb-4">
          <p className="utility-label">
            Option <span className="font-mono">01</span>
          </p>
          <CardTitle className="mt-2 flex items-center gap-2 text-2xl">
            <Ticket aria-hidden="true" className="h-5 w-5 text-ochre" />
            Coupon code
          </CardTitle>
          <CardDescription>Enter an active coupon to add its configured credits.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={couponAction} className="space-y-3">
            <input name="returnTo" type="hidden" value={safeReturnTo} />
            <Input
              aria-label="Coupon code"
              autoCapitalize="characters"
              autoComplete="off"
              className="font-mono"
              name="code"
              placeholder="ENTER_COUPON"
            />
            {couponState.error ? <InterfaceNotice tone="error">{couponState.error}</InterfaceNotice> : null}
            <Button className="w-full" disabled={isRedeeming} type="submit">
              {isRedeeming ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Ticket aria-hidden="true" />}
              <span>Redeem coupon</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className={cn("rounded-none bg-paper-surface", embedded ? "border border-ink/20" : "border-0")}>
        <CardHeader className="pb-4">
          <p className="utility-label">
            Option <span className="font-mono">02</span>
          </p>
          <CardTitle className="mt-2 flex items-center gap-2 text-2xl">
            <CreditCard aria-hidden="true" className="h-5 w-5 text-ochre" />
            Card payment
          </CardTitle>
          <CardDescription>Make a one-time domestic card payment for five research credits.</CardDescription>
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
            <span>
              Pay <span className="font-mono tabular-nums">{STRIPE_UNLOCK_PRICE_DISPLAY}</span> for{" "}
              <span className="font-mono tabular-nums">{CREDIT_UNLOCK_AMOUNT}</span> credits
            </span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
