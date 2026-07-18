import { redirect } from "next/navigation";

import { AuthenticatedShell } from "@/app/app/authenticated-shell";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: wallet }, { data: keys = [] }, { data: chats = [] }] = await Promise.all([
    supabase.from("credit_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("provider_keys")
      .select("id, provider, api_format, label, base_url, key_last4, default_model, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("chats")
      .select("id, title, model, provider_key_id, updated_at")
      .eq("user_id", user.id)
      .eq("archived", false)
      .order("updated_at", { ascending: false }),
  ]);

  const balance = wallet?.balance ?? 0;
  if (balance <= 0) redirect("/paywall");

  const chatIds = (chats ?? []).map((chat) => chat.id);
  const { data: artifacts = [] } = chatIds.length > 0
    ? await supabase.from("report_artifacts").select("chat_id").in("chat_id", chatIds)
    : { data: [] };
  const reportChatIds = new Set((artifacts ?? []).map((artifact) => artifact.chat_id));
  const chatsWithReports = (chats ?? []).map((chat) => ({
    ...chat,
    has_report: reportChatIds.has(chat.id),
  }));

  const metadata = user.user_metadata ?? {};
  const email = user.email ?? "Signed-in account";
  const name = String(
    metadata.full_name ?? metadata.name ?? metadata.user_name ?? metadata.preferred_username ?? email.split("@")[0],
  );
  const avatarUrl = typeof metadata.avatar_url === "string"
    ? metadata.avatar_url
    : typeof metadata.picture === "string"
      ? metadata.picture
      : null;

  return (
    <AuthenticatedShell
      balance={balance}
      chats={chatsWithReports}
      keys={keys ?? []}
      user={{ name, email, avatarUrl }}
    >
      {children}
    </AuthenticatedShell>
  );
}
