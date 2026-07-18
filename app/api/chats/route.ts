import { NextResponse } from "next/server";

import { jsonInternalError, logServerError } from "@/lib/server-errors";
import { createClient } from "@/lib/supabase/server";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let userId: string | undefined;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    userId = user.id;
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
      if (keyError) {
        logServerError("api/chats.provider-key", keyError, { userId, providerKeyId });
      }
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
      logServerError("api/chats.insert", error ?? new Error("Chat insert returned no row"), {
        userId,
        providerKeyId,
      });
      return jsonInternalError("Could not create chat.");
    }

    return NextResponse.json({ id: chat.id });
  } catch (error) {
    logServerError("api/chats", error, { userId });
    return jsonInternalError();
  }
}
