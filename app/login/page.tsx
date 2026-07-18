import { Github } from "lucide-react";
import { redirect } from "next/navigation";

import { signInWithGitHub, signInWithGoogle } from "@/app/login/actions";
import { InterfaceNotice } from "@/components/interface-notice";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: wallet } = await supabase
      .from("credit_wallets")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();

    redirect((wallet?.balance ?? 0) > 0 ? "/app" : "/paywall");
  }

  const params = await searchParams;

  return (
    <main className="min-h-screen bg-paper px-5 py-8 sm:px-8 lg:grid lg:place-items-center">
      <section className="mx-auto grid w-full max-w-5xl overflow-hidden border border-ink/20 bg-paper-surface lg:grid-cols-[1.15fr_0.85fr]">
        <div className="flex min-h-[22rem] flex-col justify-between border-b border-ink/20 p-7 sm:p-10 lg:min-h-[36rem] lg:border-b-0 lg:border-r">
          <Wordmark />
          <div className="max-w-xl py-12 lg:py-0">
            <p className="utility-label mb-5">Deep research desk</p>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl">
              Open a case. Follow every finding.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-ink-muted">
              Search sources, cross-check evidence, and produce a cited report with every cost logged.
            </p>
          </div>
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-ink/20" />
            <span className="h-2 w-2 rounded-full border border-ochre" />
          </div>
        </div>

        <div className="flex flex-col justify-center p-7 sm:p-10">
          <p className="utility-label">Case access</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em]">Sign in to your desk</h2>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            Continue with your existing Google or GitHub account.
          </p>

          <div className="mt-8 space-y-3">
            {params.error ? (
              <InterfaceNotice className="mb-5" tone="error">
                We couldn&apos;t start sign-in. Try again or choose another account.
              </InterfaceNotice>
            ) : null}
            <form action={signInWithGoogle}>
              <Button className="w-full justify-start" type="submit" variant="outline">
                <span aria-hidden="true" className="grid h-5 w-5 place-items-center font-mono text-xs font-semibold">
                  G
                </span>
                Continue with Google
              </Button>
            </form>
            <form action={signInWithGitHub}>
              <Button className="w-full justify-start" type="submit" variant="outline">
                <Github aria-hidden="true" />
                Continue with GitHub
              </Button>
            </form>
          </div>

          <p className="mt-8 border-t border-ink/15 pt-5 text-xs leading-5 text-ink-muted">
            Your provider keys stay encrypted. MicroManus records usage without exposing key values.
          </p>
        </div>
      </section>
    </main>
  );
}
