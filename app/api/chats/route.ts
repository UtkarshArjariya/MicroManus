import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const body = (await request.json().catch(() => null)) as {
    providerKeyId?: string;
    model?: string;
  } | null;

  const providerKeyId = body?.providerKeyId;
  const model = body?.model?.trim();

  if (!providerKeyId || !model) {
    return jsonError("Provider key and model are required.");
  }

  const { data: key, error: keyError } = await supabase
    .from("provider_keys")
    .select("id")
    .eq("id", providerKeyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (keyError || !key) {
    return jsonError("Provider key not found.", 404);
  }

  const { data: chat, error } = await supabase
    .from("chats")
    .insert({
      user_id: user.id,
      provider_key_id: providerKeyId,
      model,
      title: "New chat",
    })
    .select("id")
    .single();

  if (error || !chat) {
    return jsonError(error?.message ?? "Could not create chat.", 500);
  }

  return NextResponse.json({ id: chat.id });
}
