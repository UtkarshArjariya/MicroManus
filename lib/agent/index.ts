import "server-only";

import {
  appendProviderContinuation,
  appendToolResults,
  callProvider,
  initialWorkingMessages,
  type ChatMessage,
  type ProviderCredentials,
  type ProviderToolName,
  type ToolCall,
  type UsageNumbers,
} from "@/lib/agent/providers";
import { artifactFromToolOutput, persistedToolOutput, runTool } from "@/lib/agent/tools";
import type { ProviderId } from "@/lib/models";

const MAX_AGENT_STEPS = 15;
const MAX_RESEARCH_CORRECTIONS = 3;
const MAX_ARTIFACT_CORRECTIONS = 2;

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

type TaskRoute = {
  kind: "direct" | "lookup" | "research" | "artifact";
  wantsArtifact: boolean;
  toolNames: ProviderToolName[];
};

function latestUserRequest(history: ChatMessage[]) {
  return [...history].reverse().find((message) => message.role === "user")?.content.trim() ?? "";
}

function routeTask(history: ChatMessage[]): TaskRoute {
  const request = latestUserRequest(history);
  const compact = request.replace(/\s+/g, " ").trim();
  const rejectsArtifact =
    /\b(?:do not|don['’]?t|without|no need (?:for|to create)|not)\b.{0,35}\b(?:pdf|report|artifact|file|document)\b/i.test(compact) ||
    /\b(?:pdf|report|artifact|file|document)\b.{0,25}\b(?:isn['’]?t needed|is not needed|unnecessary|not required)\b/i.test(compact);
  const requestsArtifact =
    /\bpdf\b/i.test(compact) ||
    /\b(?:create|generate|make|write|prepare|produce|export|save|share|download|give me|i need|i want)\b.{0,60}\b(?:report|brief|memo|document|write[- ]?up|file|artifact)\b/i.test(compact) ||
    /\b(?:report|brief|memo|document|write[- ]?up)\b.{0,40}\b(?:save|share|download|export)\b/i.test(compact);
  const wantsArtifact = requestsArtifact && !rejectsArtifact;
  const explicitResearch =
    /\b(?:deep[- ]?research|research|investigat(?:e|ion)|deep dive|systematic review|literature review|survey the evidence)\b/i.test(compact) ||
    /\b(?:multiple angles|primary sources?|independent sources?|reconcile disagreements?|cross[- ]?check|source[- ]?dependent)\b/i.test(compact);
  const evidenceRequest = /\b(?:cite|citation|sources?|evidence|according to|verify|fact[- ]?check)\b/i.test(compact);
  const freshLookup =
    /\b(?:today|currently|latest|recent|recently|this (?:week|month|year)|news|live|up[- ]?to[- ]?date|as of|current (?:status|state|events?|news|price|weather|version|release|law|policy|market|officeholder|data))\b/i.test(compact);
  const depthRequest =
    /\b(?:in[- ]depth|thorough|deep|detailed|broad) (?:analysis|overview|assessment|review|explanation|comparison)\b/i.test(compact) ||
    /\b(?:comprehensive overview|research overview|survey|landscape|state of (?:the )?(?:field|art|market|industry|evidence))\b/i.test(compact);
  const analyticalRequest =
    /\b(?:compare|contrast|evaluate|assess|analy[sz]e|explain)\b/i.test(compact) &&
    /\b(?:causes?|effects?|impacts?|risks?|trade[- ]?offs?|solutions?|timeline|implementation|outlook|options?|stakeholders?)\b/i.test(compact);
  const requiresResearch =
    explicitResearch ||
    (depthRequest && compact.length >= 80) ||
    (evidenceRequest && compact.length >= 80) ||
    (analyticalRequest && compact.length >= 120) ||
    (wantsArtifact && (freshLookup || evidenceRequest));

  if (requiresResearch) {
    return {
      kind: "research",
      wantsArtifact,
      toolNames: [
        "web_search",
        "fetch_page",
        ...(wantsArtifact ? ["generate_pdf_report" as const] : []),
      ],
    };
  }

  if (freshLookup || evidenceRequest) {
    return {
      kind: "lookup",
      wantsArtifact,
      toolNames: [
        "web_search",
        "fetch_page",
        ...(wantsArtifact ? ["generate_pdf_report" as const] : []),
      ],
    };
  }

  if (wantsArtifact) {
    return {
      kind: "artifact",
      wantsArtifact: true,
      toolNames: ["generate_pdf_report"],
    };
  }

  return { kind: "direct", wantsArtifact: false, toolNames: [] };
}

function systemPrompt(route: TaskRoute) {
  const shared = `You are MicroManus, an adaptable assistant that can answer directly, perform live web research, and create PDF artifacts when the user asks for one.

Match the shape of the user's request instead of forcing every turn into research. Preserve conversational context from earlier messages. Be concise for simple questions and helpful for creative, writing, or technical requests. Before any tool call, provide at most a short public rationale suitable for a user-facing trace; never reveal hidden chain-of-thought.`;
  const artifact = route.wantsArtifact
    ? `The user explicitly requested a saveable or shareable artifact. Use generate_pdf_report only after the content is ready, include clear headed sections, and pass every URL actually used in the sources array.`
    : `The user did not explicitly request a PDF or saveable report. Answer in chat and do not create an artifact.`;

  if (route.kind === "research") {
    return `${shared}

This turn is a deep-research task. Use web_search and fetch_page in a genuine iterative loop:
- State a brief public research plan.
- Run at least two meaningfully distinct searches covering different angles.
- Successfully read at least two relevant pages; never synthesize from search snippets alone.
- Cross-check important claims for agreement, disagreement, dates, and source quality.
- Cite source domains or links inline with source-dependent claims.
Do not give a final synthesis until those minimum source checks are complete. ${artifact}`;
  }

  if (route.kind === "lookup") {
    return `${shared}

This turn needs a current or explicitly sourced lookup. Use web_search and fetch_page only as much as needed to answer accurately, then cite the source link or domain. ${artifact}`;
  }

  if (route.kind === "artifact") {
    return `${shared}

No live research was requested. Use the conversation and user-provided material without inventing sources. ${artifact}`;
  }

  return `${shared}

No tools are enabled for this turn. Answer the stable factual, creative, conversational, or technical request directly. Do not claim to have searched the web or created a PDF. ${artifact}`;
}

function truncateHistory(history: ChatMessage[], route: TaskRoute) {
  const system: ChatMessage = { role: "system", content: systemPrompt(route) };
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

function toolOutputError(output: unknown) {
  if (typeof output !== "object" || output === null || !("error" in output)) {
    return "";
  }

  const error = (output as { error?: unknown }).error;
  return typeof error === "string" ? error : "Tool failed.";
}

function recordResearchEvidence(
  toolCall: ToolCall,
  output: unknown,
  searchQueries: Set<string>,
  successfulPageReads: Set<string>,
) {
  if (toolOutputError(output)) {
    return;
  }

  if (toolCall.name === "web_search") {
    const query = typeof toolCall.input.query === "string"
      ? toolCall.input.query.replace(/\s+/g, " ").trim().toLocaleLowerCase()
      : "";
    const results = typeof output === "object" && output !== null && "results" in output
      ? (output as { results?: unknown }).results
      : null;
    if (query && Array.isArray(results) && results.length > 0) {
      searchQueries.add(query);
    }
  }

  if (toolCall.name === "fetch_page") {
    const page = typeof output === "object" && output !== null
      ? (output as { url?: unknown; text?: unknown })
      : null;
    if (page && typeof page.url === "string" && typeof page.text === "string" && page.text.trim()) {
      successfulPageReads.add(page.url);
    }
  }
}

function missingResearchEvidence(searchQueries: Set<string>, successfulPageReads: Set<string>) {
  return {
    searches: Math.max(0, 2 - searchQueries.size),
    pageReads: Math.max(0, 2 - successfulPageReads.size),
  };
}

function researchEvidenceComplete(searchQueries: Set<string>, successfulPageReads: Set<string>) {
  const missing = missingResearchEvidence(searchQueries, successfulPageReads);
  return missing.searches === 0 && missing.pageReads === 0;
}

function correctiveResearchInstruction(searchQueries: Set<string>, successfulPageReads: Set<string>) {
  const missing = missingResearchEvidence(searchQueries, successfulPageReads);
  return `Continue the research before answering. The runtime still requires ${missing.searches} more distinct successful search${missing.searches === 1 ? "" : "es"} and ${missing.pageReads} more successful page read${missing.pageReads === 1 ? "" : "s"}. Use the available tools now, then synthesize only after both minimums are met.`;
}

export async function runAgent(options: AgentRunOptions) {
  const route = routeTask(options.history);
  const messages = truncateHistory(options.history, route);
  const workingMessages = initialWorkingMessages(options.credentials, messages);
  const discoveredSources = new Set<string>();
  const visitedSources = new Set<string>();
  const successfulSearchQueries = new Set<string>();
  const successfulPageReads = new Set<string>();
  const toolUsage = {
    webSearches: 0,
    pageFetches: 0,
  };
  let researchCorrections = 0;
  let artifactCorrections = 0;
  let artifactCreated = false;
  let finalAnswer = "";

  for (let i = 0; i < MAX_AGENT_STEPS; i += 1) {
    const response = await callProvider(options.credentials, messages, workingMessages, route.toolNames);

    await options.onUsage({
      ...response.usage,
      provider: options.credentials.provider,
      model: options.credentials.model,
    });

    if (response.toolCalls.length === 0) {
      if (route.kind === "research" && !researchEvidenceComplete(successfulSearchQueries, successfulPageReads)) {
        const instruction = correctiveResearchInstruction(successfulSearchQueries, successfulPageReads);
        if (researchCorrections < MAX_RESEARCH_CORRECTIONS) {
          researchCorrections += 1;
          await options.onStep({
            type: "thought",
            toolOutput: { content: instruction },
          });
          appendProviderContinuation(
            options.credentials,
            workingMessages,
            response.rawAssistantMessage,
            instruction,
          );
          continue;
        }

        finalAnswer = `I couldn’t complete a reliable synthesis because the minimum source checks were not met after ${MAX_RESEARCH_CORRECTIONS} corrective attempts. ${instruction}`;
        await options.onStep({
          type: "final_answer",
          toolOutput: { content: finalAnswer },
        });
        return finalAnswer;
      }

      if (route.wantsArtifact && !artifactCreated) {
        const instruction = "The requested PDF artifact has not been created yet. Call generate_pdf_report now with the completed content and every source URL actually used, then confirm it is ready.";
        if (artifactCorrections < MAX_ARTIFACT_CORRECTIONS) {
          artifactCorrections += 1;
          await options.onStep({
            type: "thought",
            toolOutput: { content: instruction },
          });
          appendProviderContinuation(
            options.credentials,
            workingMessages,
            response.rawAssistantMessage,
            instruction,
          );
          continue;
        }

        finalAnswer = `I completed the content, but couldn’t create the requested PDF after ${MAX_ARTIFACT_CORRECTIONS} corrective attempts. Retry this turn to generate the artifact.`;
        await options.onStep({
          type: "final_answer",
          toolOutput: { content: finalAnswer },
        });
        return finalAnswer;
      }

      finalAnswer = response.content || "The provider returned no answer. Retry this turn or choose another model.";
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

      const output = route.kind === "research" &&
        toolCall.name === "generate_pdf_report" &&
        !researchEvidenceComplete(successfulSearchQueries, successfulPageReads)
        ? {
            error: `Finish the required source work before generating the PDF. ${correctiveResearchInstruction(successfulSearchQueries, successfulPageReads)}`,
          }
        : await runTool(toolCall.name, toolCall.input, {
            chatId: options.chatId,
            messageId: options.messageId,
            discoveredSources,
            visitedSources,
            toolUsage,
          });
      recordResearchEvidence(
        toolCall,
        output,
        successfulSearchQueries,
        successfulPageReads,
      );
      const artifact = toolCall.name === "generate_pdf_report" ? artifactFromToolOutput(output) : null;

      await options.onStep({
        type: "tool_result",
        toolName: toolCall.name,
        toolInput: toolCall.input,
        toolOutput: persistedToolOutput(toolCall.name, output),
      });

      if (artifact) {
        artifactCreated = true;
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

  finalAnswer = route.kind === "research" && !researchEvidenceComplete(successfulSearchQueries, successfulPageReads)
    ? `I reached the step limit before completing the required source checks. ${correctiveResearchInstruction(successfulSearchQueries, successfulPageReads)}`
    : route.wantsArtifact && !artifactCreated
      ? "I reached the step limit before the requested PDF could be created. Retry this turn to finish the artifact."
      : "I've reached my step limit. Here's what I found so far from the completed tool calls; start a follow-up message if you want me to continue.";
  await options.onStep({
    type: "final_answer",
    toolOutput: { content: finalAnswer },
  });

  return finalAnswer;
}
