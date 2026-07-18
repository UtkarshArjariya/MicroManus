import { Search } from "lucide-react";
import { redirect } from "next/navigation";

import { PaywallClient } from "@/app/paywall/paywall-client";
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

  if ((wallet?.balance ?? 0) > 0 && !paymentSuccess) {
    redirect("/app");
  }

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Search aria-hidden="true" className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xl font-semibold">MicroManus</p>
            <p className="text-sm text-muted-foreground">Add credits to unlock the research workspace.</p>
          </div>
        </header>

        <section className="space-y-3">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-normal">Unlock your first research credits</h1>
            <p className="mt-2 text-muted-foreground">
              New accounts start at 0 credits. Redeem the launch coupon or use Stripe Checkout to add 5 credits.
            </p>
          </div>
          <PaywallClient paymentCancelled={paymentCancelled} paymentSuccess={paymentSuccess} />
        </section>
      </div>
    </main>
  );
}
