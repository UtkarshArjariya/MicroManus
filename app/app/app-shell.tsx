import { redirect } from "next/navigation";

import { ChatClient } from "@/app/app/chat-client";
import {
  REPORT_SIGNED_URL_TTL_SECONDS,
  createReportSignedUrl,
  type SignedReportArtifact,
} from "@/lib/report-artifacts";
import { createClient } from "@/lib/supabase/server";

export async function AppShell({ selectedChatId }: { selectedChatId: string | null }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: wallet }, { data: keys = [] }, { data: chats = [] }] = await Promise.all([
    supabase.from("credit_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("provider_keys")
      .select("id, provider, label, base_url, key_last4, default_model")
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

  const chatIds = (chats ?? []).map((chat) => chat.id);
  const { data: chatArtifacts = [] } = chatIds.length > 0
    ? await supabase.from("report_artifacts").select("chat_id").in("chat_id", chatIds)
    : { data: [] };
  const reportChatIds = new Set((chatArtifacts ?? []).map((artifact) => artifact.chat_id));
  const chatsWithReports = (chats ?? []).map((chat) => ({
    ...chat,
    has_report: reportChatIds.has(chat.id),
  }));

  const selectedChat = selectedChatId
    ? chatsWithReports.find((chat) => chat.id === selectedChatId)
    : null;

  if (selectedChatId && !selectedChat) {
    redirect("/app");
  }

  const { data: loadedMessages } = selectedChatId
    ? await supabase
        .from("messages")
        .select("id, role, content, created_at, seq")
        .eq("chat_id", selectedChatId)
        .order("seq", { ascending: true })
    : { data: [] };
  const messages = loadedMessages ?? [];

  const assistantMessageIds = messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.id);

  const { data: loadedSteps } = assistantMessageIds.length > 0
    ? await supabase
        .from("agent_steps")
        .select("id, message_id, step_index, type, tool_name, tool_input, tool_output, created_at")
        .in("message_id", assistantMessageIds)
        .order("step_index", { ascending: true })
    : { data: [] };
  const steps = loadedSteps ?? [];
  const { data: loadedArtifacts } = assistantMessageIds.length > 0
    ? await supabase
        .from("report_artifacts")
        .select("id, message_id, title, storage_path, created_at")
        .in("message_id", assistantMessageIds)
        .order("created_at", { ascending: true })
    : { data: [] };
  const artifacts = await Promise.all(
    (loadedArtifacts ?? []).map(async (artifact) => {
      const signedUrl = await createReportSignedUrl(artifact.storage_path, artifact.title);
      return {
        ...artifact,
        signed_url: signedUrl,
        expires_at: new Date(Date.now() + REPORT_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      } satisfies SignedReportArtifact;
    }),
  );

  return (
    <ChatClient
      selectedChatId={selectedChatId}
      chats={chatsWithReports}
      keys={keys ?? []}
      messages={messages}
      steps={steps}
      artifacts={artifacts}
      balance={balance}
    />
  );
}
