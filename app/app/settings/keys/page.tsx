import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { KeysClient } from "@/app/app/settings/keys/keys-client";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function KeysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: keys } = await supabase
    .from("provider_keys")
    .select("id, provider, label, base_url, key_last4, default_model, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-paper px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/20 pb-5">
          <Wordmark href="/app" />
          <Button asChild variant="outline">
            <Link href="/app"><ArrowLeft aria-hidden="true" />Back to chats</Link>
          </Button>
        </header>

        <section className="py-8 sm:py-10">
          <p className="utility-label">Settings · Provider access</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Research keys</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-ink-muted">
            Add your own model provider. Key values are encrypted on the server; this page shows only their final four characters.
          </p>
          <div className="mt-8">
            <KeysClient keys={keys ?? []} />
          </div>
        </section>
      </div>
    </main>
  );
}
