import "server-only";

import { appendToolResults, callProvider, initialWorkingMessages, type ChatMessage, type ProviderCredentials, type UsageNumbers } from "@/lib/agent/providers";
import { artifactFromToolOutput, persistedToolOutput, runTool } from "@/lib/agent/tools";
import type { ProviderId } from "@/lib/models";

const MAX_AGENT_STEPS = 15;

export type PersistStepInput = {
  type: "thought" | "tool_call" | "tool_result" | "artifact" | "final_answer";
  toolName?: string | null;
  toolInput?: unknown;
  toolOutput?: unknown;
};

export type AgentRunOptions = {
  credentials: ProviderCredentials;
  history: ChatMessage[];
  chatId: string;
  messageId: string;
  onStep: (step: PersistStepInput) => Promise<void>;
  onArtifact?: (artifact: {
    id: string;
    message_id: string;
    title: string;
    storage_path: string;
    signed_url: string;
    created_at: string;
    expires_at: string;
  }) => Promise<void>;
  onUsage: (usage: UsageNumbers & { provider: ProviderId; model: string }) => Promise<void>;
};

const SYSTEM_PROMPT = `You are MicroManus, a careful deep-research agent.

Use the available web_search and fetch_page tools for current or source-dependent claims. Simple stable facts can be answered directly without tools.
For open-ended research questions, behave like a real research agent:
- Start with a short public research plan or rationale suitable for the trace.
- Run multiple distinct web_search queries that cover different angles of the question.
- Read at least 2-3 of the most relevant sources with fetch_page before synthesizing; do not rely on snippets alone.
- Cross-check important claims for agreement, disagreement, date, and source quality.
- Cite sourced claims inline in the final answer with the source domain or link, such as "(Source: latimes.com)".
If the user asks for a report, document, write-up, brief, memo, PDF, or output they can save/share, use generate_pdf_report as your final tool call before answering. Otherwise answer inline in chat without creating a PDF.
When creating a PDF report, include clear headed sections and pass every URL you used or read in the sources array.
Before using tools, include only a short public rationale suitable for a user-facing trace. Do not reveal hidden chain-of-thought.
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
  const discoveredSources = new Set<string>();
  const visitedSources = new Set<string>();
  const toolUsage = {
    webSearches: 0,
    pageFetches: 0,
  };
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

      const output = await runTool(toolCall.name, toolCall.input, {
        chatId: options.chatId,
        messageId: options.messageId,
        discoveredSources,
        visitedSources,
        toolUsage,
      });
      const artifact = toolCall.name === "generate_pdf_report" ? artifactFromToolOutput(output) : null;

      await options.onStep({
        type: "tool_result",
        toolName: toolCall.name,
        toolInput: toolCall.input,
        toolOutput: persistedToolOutput(toolCall.name, output),
      });

      if (artifact) {
        await options.onStep({
          type: "artifact",
          toolName: toolCall.name,
          toolOutput: {
            artifact_id: artifact.id,
            title: artifact.title,
            storage_path: artifact.storage_path,
          },
        });
        await options.onArtifact?.(artifact);
      }

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
