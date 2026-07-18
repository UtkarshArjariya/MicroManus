import "server-only";

import { appendToolResults, callProvider, initialWorkingMessages, type ChatMessage, type ProviderCredentials, type UsageNumbers } from "@/lib/agent/providers";
import { runTool } from "@/lib/agent/tools";
import type { ProviderId } from "@/lib/models";

const MAX_AGENT_STEPS = 10;

export type PersistStepInput = {
  type: "thought" | "tool_call" | "tool_result" | "final_answer";
  toolName?: string | null;
  toolInput?: unknown;
  toolOutput?: unknown;
};

export type AgentRunOptions = {
  credentials: ProviderCredentials;
  history: ChatMessage[];
  onStep: (step: PersistStepInput) => Promise<void>;
  onUsage: (usage: UsageNumbers & { provider: ProviderId; model: string }) => Promise<void>;
};

const SYSTEM_PROMPT = `You are MicroManus, a careful deep-research agent.

Use the available web_search and fetch_page tools for current or source-dependent claims.
For research questions, search first, read multiple credible pages, then synthesize.
Before using tools, include only a short public rationale suitable for a user-facing trace. Do not reveal hidden chain-of-thought.
When citing sources in the final answer, include source links inline.
If you hit the step limit, clearly say what you found so far and what is missing.`;

function truncateHistory(history: ChatMessage[]) {
  const system: ChatMessage = { role: "system", content: SYSTEM_PROMPT };
  const kept = history.slice(-30);
  let budget = 28_000;
  const truncated = kept
    .reverse()
    .map((message) => {
      if (budget <= 0) {
        return null;
      }

      const content = message.content.slice(Math.max(0, message.content.length - budget));
      budget -= content.length;
      return { ...message, content };
    })
    .filter((message): message is ChatMessage => Boolean(message))
    .reverse();

  return [system, ...truncated];
}

export async function runAgent(options: AgentRunOptions) {
  const messages = truncateHistory(options.history);
  const workingMessages = initialWorkingMessages(options.credentials, messages);
  let finalAnswer = "";

  for (let i = 0; i < MAX_AGENT_STEPS; i += 1) {
    const response = await callProvider(options.credentials, messages, workingMessages);

    await options.onUsage({
      ...response.usage,
      provider: options.credentials.provider,
      model: options.credentials.model,
    });

    if (response.toolCalls.length === 0) {
      finalAnswer = response.content || "I could not produce an answer from the provider response.";
      await options.onStep({
        type: "final_answer",
        toolOutput: { content: finalAnswer },
      });
      return finalAnswer;
    }

    if (response.content.trim()) {
      await options.onStep({
        type: "thought",
        toolOutput: { content: response.content.trim() },
      });
    }

    const toolResults = [];

    for (const toolCall of response.toolCalls) {
      await options.onStep({
        type: "tool_call",
        toolName: toolCall.name,
        toolInput: toolCall.input,
      });

      const output = await runTool(toolCall.name, toolCall.input);

      await options.onStep({
        type: "tool_result",
        toolName: toolCall.name,
        toolInput: toolCall.input,
        toolOutput: output,
      });

      toolResults.push({ toolCall, output });
    }

    appendToolResults(options.credentials, workingMessages, response.rawAssistantMessage, toolResults);
  }

  finalAnswer = "I've reached my step limit. Here's what I found so far from the completed tool calls; start a follow-up message if you want me to continue the research.";
  await options.onStep({
    type: "final_answer",
    toolOutput: { content: finalAnswer },
  });

  return finalAnswer;
}
