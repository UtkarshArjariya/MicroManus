import { AppShell } from "@/app/app/app-shell";

export default async function ChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  return <AppShell selectedChatId={chatId} />;
}
