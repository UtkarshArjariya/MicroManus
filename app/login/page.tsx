import { Github, Search } from "lucide-react";
import { redirect } from "next/navigation";

import { signInWithGitHub, signInWithGoogle } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Search aria-hidden="true" className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-2xl">MicroManus</CardTitle>
            <CardDescription>Sign in to start usage-based deep research.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {params.error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {params.error}
            </p>
          ) : null}
          <form action={signInWithGoogle}>
            <Button className="w-full" type="submit" variant="outline">
              <Search aria-hidden="true" />
              Continue with Google
            </Button>
          </form>
          <form action={signInWithGitHub}>
            <Button className="w-full" type="submit" variant="outline">
              <Github aria-hidden="true" />
              Continue with GitHub
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
