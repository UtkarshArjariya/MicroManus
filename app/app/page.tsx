import { LogOut, Search } from "lucide-react";
import { redirect } from "next/navigation";

import { signOut } from "@/app/app/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

function initials(nameOrEmail: string) {
  return nameOrEmail
    .split(/[ @._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default async function AppPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: wallet }] = await Promise.all([
    supabase.from("profiles").select("display_name, email, avatar_url").eq("id", user.id).maybeSingle(),
    supabase.from("credit_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
  ]);

  const balance = wallet?.balance ?? 0;

  if (balance <= 0) {
    redirect("/paywall");
  }

  const displayName = profile?.display_name ?? user.user_metadata?.full_name ?? user.email ?? "Researcher";
  const email = profile?.email ?? user.email ?? "";
  const avatarUrl = profile?.avatar_url ?? user.user_metadata?.avatar_url;

  return (
    <main className="min-h-screen bg-stone-50">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Search aria-hidden="true" className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">MicroManus</p>
              <p className="text-sm text-muted-foreground">Deep research agent workspace</p>
            </div>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="outline">
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 md:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <CardHeader>
            <CardTitle>Chat UI coming next</CardTitle>
            <CardDescription>
              The protected workspace is ready for the research agent interface in the next prompt.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
              Conversation threads, BYOK provider settings, and report generation will live here.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
            <CardDescription>Signed in user and current wallet balance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage alt={displayName} src={avatarUrl ?? undefined} />
                <AvatarFallback>{initials(displayName || email) || "MM"}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{displayName}</p>
                <p className="truncate text-sm text-muted-foreground">{email}</p>
              </div>
            </div>
            <div className="rounded-md border px-4 py-3">
              <p className="text-sm text-muted-foreground">Credits</p>
              <p className="text-3xl font-semibold">{balance}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
