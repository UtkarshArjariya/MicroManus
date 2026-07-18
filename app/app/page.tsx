import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function AppPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: latestChat } = await supabase
    .from("chats")
    .select("id")
    .eq("user_id", user.id)
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  redirect(latestChat?.id ? `/app/${latestChat.id}` : "/app/new");
}
