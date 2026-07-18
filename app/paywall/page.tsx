import { redirect } from "next/navigation";

import { PaywallClient } from "@/app/paywall/paywall-client";
import { CreditStamp } from "@/components/credit-stamp";
import { Wordmark } from "@/components/wordmark";
import { createClient } from "@/lib/supabase/server";

type PaywallPageProps = {
  searchParams: Promise<{
    stripe?: string;
  }>;
};

export default async function PaywallPage({ searchParams }: PaywallPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: wallet } = await supabase
    .from("credit_wallets")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();
  const params = await searchParams;
  const paymentSuccess = params.stripe === "success";
  const paymentCancelled = params.stripe === "cancelled";
  const balance = wallet?.balance ?? 0;

  if (balance > 0 && !paymentSuccess) {
    redirect("/app");
  }

  return (
    <main className="min-h-screen bg-paper px-5 py-7 sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex items-center justify-between border-b border-ink/20 pb-6">
          <div>
            <Wordmark href="/app" />
            <p className="mt-2 text-sm text-ink-muted">Research access desk</p>
          </div>
          <CreditStamp balance={balance} />
        </header>

        <section className="py-9 sm:py-12">
          <div className="max-w-2xl">
            <p className="utility-label">Access clearance</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
              Add credits to open the desk
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-ink-muted">
              Redeem the launch code or pay by card. Either option adds five research credits to your account.
            </p>
          </div>
          <div className="mt-8">
            <PaywallClient paymentCancelled={paymentCancelled} paymentSuccess={paymentSuccess} />
          </div>
        </section>
      </div>
    </main>
  );
}
