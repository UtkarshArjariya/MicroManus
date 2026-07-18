import Link from "next/link";
import { redirect } from "next/navigation";

import { KeysClient } from "@/app/app/settings/keys/keys-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function KeysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: keys } = await supabase
    .from("provider_keys")
    .select("id, provider, label, base_url, key_last4, default_model, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Settings</p>
            <h1 className="text-2xl font-semibold">Provider keys</h1>
          </div>
          <Button asChild variant="outline">
            <Link href="/app">Back to chat</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bring your own LLM key</CardTitle>
            <CardDescription>
              Keys are encrypted on the server. Client responses only include provider metadata and the last four characters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <KeysClient keys={keys ?? []} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
