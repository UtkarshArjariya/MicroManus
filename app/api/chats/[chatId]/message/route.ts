import { NextResponse } from "next/server";

import { runAgent, type PersistStepInput } from "@/lib/agent";
import type { ChatMessage } from "@/lib/agent/providers";
import { calculateUsageCost } from "@/lib/cost";
import { decrypt } from "@/lib/crypto";
import type { ProviderId } from "@/lib/models";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type MessageRole = "user" | "assistant" | "system" | "tool";

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function titleFrom(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact || "New chat";
}

function paywallResponse() {
  return NextResponse.json(
    { error: "You need credits to send a message.", redirectTo: "/paywall" },
    { status: 402 },
  );
}

async function appendMessage(chatId: string, role: MessageRole, content: string) {
  const admin = createAdminClient();
  const { data: lastMessage } = await admin
    .from("messages")
    .select("seq")
    .eq("chat_id", chatId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  const seq = (lastMessage?.seq ?? 0) + 1;
  const { data, error } = await admin
    .from("messages")
    .insert({ chat_id: chatId, role, content, seq })
    .select("id, chat_id, role, content, created_at, seq")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not append message.");
  }

  return data as {
    id: string;
    chat_id: string;
    role: MessageRole;
    content: string;
    created_at: string;
    seq: number;
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const { chatId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { content?: string } | null;
  const content = body?.content?.trim();

  if (!content) {
    return NextResponse.json({ error: "Message content is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: chat, error: chatError } = await admin
    .from("chats")
    .select("id, user_id, title, provider_key_id, model")
    .eq("id", chatId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (chatError || !chat) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }

  if (!chat.provider_key_id) {
    return NextResponse.json(
      { error: "This chat's provider key was deleted. Start a new chat with an active key." },
      { status: 409 },
    );
  }

  const { data: providerKey, error: keyError } = await admin
    .from("provider_keys")
    .select("provider, base_url, encrypted_key")
    .eq("id", chat.provider_key_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (keyError || !providerKey) {
    return NextResponse.json({ error: "Provider key not found." }, { status: 404 });
  }

  const { data: wallet, error: walletError } = await admin
    .from("credit_wallets")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();

  if (walletError) {
    return NextResponse.json({ error: "Could not check credit balance." }, { status: 500 });
  }

  if ((wallet?.balance ?? 0) <= 0) {
    return paywallResponse();
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };

      try {
        const userMessage = await appendMessage(chatId, "user", content);

        if (chat.title === "New chat") {
          await admin.from("chats").update({ title: titleFrom(content) }).eq("id", chatId);
        }

        const { data: persistedMessages, error: messagesError } = await admin
          .from("messages")
          .select("role, content, seq")
          .eq("chat_id", chatId)
          .lte("seq", userMessage.seq)
          .in("role", ["user", "assistant", "system"])
          .order("seq", { ascending: true });

        if (messagesError) {
          throw new Error(messagesError.message);
        }

        const assistantMessage = await appendMessage(chatId, "assistant", "");
        send("message", { userMessage, assistantMessage });

        let stepIndex = 0;
        const persistStep = async (step: PersistStepInput) => {
          stepIndex += 1;
          const { data, error } = await admin
            .from("agent_steps")
            .insert({
              message_id: assistantMessage.id,
              step_index: stepIndex,
              type: step.type,
              tool_name: step.toolName ?? null,
              tool_input: step.toolInput ?? null,
              tool_output: step.toolOutput ?? null,
            })
            .select("id, message_id, step_index, type, tool_name, tool_input, tool_output, created_at")
            .single();

          if (error || !data) {
            throw new Error(error?.message ?? "Could not persist agent step.");
          }

          send("step", data);
        };

        const finalAnswer = await runAgent({
          credentials: {
            provider: providerKey.provider as ProviderId,
            apiKey: decrypt(providerKey.encrypted_key),
            baseUrl: providerKey.base_url,
            model: chat.model,
          },
          chatId,
          messageId: assistantMessage.id,
          history: (persistedMessages ?? []).map((message) => ({
            role: message.role as ChatMessage["role"],
            content: message.content,
          })),
          onStep: persistStep,
          onArtifact: async (artifact) => {
            send("artifact", artifact);
          },
          onUsage: async (usage) => {
            const cost = calculateUsageCost({
              provider: usage.provider,
              model: usage.model,
              input_tokens: usage.inputTokens,
              output_tokens: usage.outputTokens,
              cached_input_tokens: usage.cachedInputTokens,
            });
            const { error } = await admin.from("usage_events").insert({
              chat_id: chatId,
              message_id: assistantMessage.id,
              provider: usage.provider,
              model: usage.model,
              input_tokens: usage.inputTokens,
              output_tokens: usage.outputTokens,
              cached_input_tokens: usage.cachedInputTokens,
              input_cost_usd: cost.input_cost_usd,
              output_cost_usd: cost.output_cost_usd,
              cached_cost_usd: cost.cached_cost_usd,
              total_cost_usd: cost.total_cost_usd,
            });

            if (error) {
              throw new Error(error.message);
            }
          },
        });

        const { data: debitRows, error: debitError } = await admin.rpc("apply_credit", {
          p_user_id: user.id,
          p_delta: -1,
          p_reason: "agent_turn_debit",
          p_reference_id: assistantMessage.id,
        });

        if (debitError) {
          throw new Error(debitError.message);
        }

        const newBalance = Array.isArray(debitRows)
          ? (debitRows[0] as { wallet_balance?: number } | undefined)?.wallet_balance
          : undefined;

        await admin
          .from("messages")
          .update({ content: finalAnswer })
          .eq("id", assistantMessage.id);
        await admin.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);

        for (const chunk of finalAnswer.match(/.{1,24}(\s|$)/g) ?? [finalAnswer]) {
          send("content", { messageId: assistantMessage.id, chunk });
        }

        if (typeof newBalance === "number") {
          send("credit", { balance: newBalance });
        }

        send("done", { messageId: assistantMessage.id });
      } catch (error) {
        send("error", {
          error: error instanceof Error ? error.message : "Agent run failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
