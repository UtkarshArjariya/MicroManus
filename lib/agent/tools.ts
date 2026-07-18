import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { renderPdfReport, type PdfReportSection } from "@/lib/agent/report-pdf";
import {
  REPORT_ARTIFACTS_BUCKET,
  REPORT_SIGNED_URL_TTL_SECONDS,
  createReportSignedUrl,
} from "@/lib/report-artifacts";
import { logServerError } from "@/lib/server-errors";
import { createAdminClient } from "@/lib/supabase/admin";

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

const MAX_WEB_SEARCHES_PER_TURN = 8;
const MAX_PAGE_FETCHES_PER_TURN = 10;
const TOOL_TIMEOUT_MS = 15_000;
const MAX_FETCH_CONTENT_LENGTH = 2_000_000;

export type ToolRunContext = {
  chatId: string;
  messageId: string;
  discoveredSources: Set<string>;
  visitedSources: Set<string>;
  toolUsage: {
    webSearches: number;
    pageFetches: number;
  };
};

type GeneratePdfReportInput = {
  title: string;
  sections: PdfReportSection[];
  sources: string[];
};

function capText(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n\n[truncated]` : text;
}

function stripHtml(html: string) {
  return capText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim(),
    12_000,
  );
}

function timeoutSignal() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

export const openAiTools = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the current web for up-to-date public sources.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The web search query.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_page",
      description: "Fetch and extract readable text from a web page URL.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "HTTP or HTTPS URL to fetch.",
          },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_pdf_report",
      description: "Generate a polished PDF report artifact for the current chat message when the user explicitly asks for a report, write-up, document, or saveable/shareable research output.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The report title.",
          },
          sections: {
            type: "array",
            description: "Headed report sections with synthesized prose.",
            items: {
              type: "object",
              properties: {
                heading: {
                  type: "string",
                  description: "The section heading.",
                },
                content: {
                  type: "string",
                  description: "The section body. Include source attributions inline where claims depend on sources.",
                },
              },
              required: ["heading", "content"],
              additionalProperties: false,
            },
            minItems: 1,
          },
          sources: {
            type: "array",
            description: "URLs used for this report. The runtime will keep fetched URLs and validate requested sources against URLs seen in web_search or fetch_page.",
            items: {
              type: "string",
            },
          },
        },
        required: ["title", "sections", "sources"],
        additionalProperties: false,
      },
    },
  },
];

export const anthropicTools = [
  {
    name: "web_search",
    description: "Search the current web for up-to-date public sources.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The web search query.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "fetch_page",
    description: "Fetch and extract readable text from a web page URL.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "HTTP or HTTPS URL to fetch.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "generate_pdf_report",
    description: "Generate a polished PDF report artifact for the current chat message when the user explicitly asks for a report, write-up, document, or saveable/shareable research output.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The report title.",
        },
        sections: {
          type: "array",
          description: "Headed report sections with synthesized prose.",
          items: {
            type: "object",
            properties: {
              heading: {
                type: "string",
                description: "The section heading.",
              },
              content: {
                type: "string",
                description: "The section body. Include source attributions inline where claims depend on sources.",
              },
            },
            required: ["heading", "content"],
            additionalProperties: false,
          },
          minItems: 1,
        },
        sources: {
          type: "array",
          description: "URLs used for this report. The runtime will keep fetched URLs and validate requested sources against URLs seen in web_search or fetch_page.",
          items: {
            type: "string",
          },
        },
      },
      required: ["title", "sections", "sources"],
      additionalProperties: false,
    },
  },
];

export async function runTool(name: string, input: unknown, context: ToolRunContext) {
  if (name === "web_search") {
    context.toolUsage.webSearches += 1;
    if (context.toolUsage.webSearches > MAX_WEB_SEARCHES_PER_TURN) {
      return { error: `Search limit reached for this turn (${MAX_WEB_SEARCHES_PER_TURN}). Continue with the sources already found.` };
    }

    const query = typeof input === "object" && input !== null && "query" in input
      ? String((input as { query?: unknown }).query ?? "")
      : "";
    const output = await webSearch(query);
    output.results?.forEach((result) => addDiscoveredSource(context, result.url));
    return output;
  }

  if (name === "fetch_page") {
    context.toolUsage.pageFetches += 1;
    if (context.toolUsage.pageFetches > MAX_PAGE_FETCHES_PER_TURN) {
      return { error: `Page fetch limit reached for this turn (${MAX_PAGE_FETCHES_PER_TURN}). Continue with the pages already read.` };
    }

    const url = typeof input === "object" && input !== null && "url" in input
      ? String((input as { url?: unknown }).url ?? "")
      : "";
    const output = await fetchPage(url);
    if (output.url && !output.error) {
      addVisitedSource(context, output.url);
    }
    return output;
  }

  if (name === "generate_pdf_report") {
    return generatePdfReport(input, context);
  }

  return { error: `Unknown tool: ${name}` };
}

export function persistedToolOutput(name: string, output: unknown) {
  if (name !== "generate_pdf_report" || typeof output !== "object" || output === null) {
    return output;
  }

  const report = output as {
    ok?: unknown;
    title?: unknown;
    artifact?: {
      id?: unknown;
      title?: unknown;
      storage_path?: unknown;
      created_at?: unknown;
      expires_at?: unknown;
    };
    sources?: unknown;
    error?: unknown;
  };

  return {
    ok: report.ok,
    title: report.title,
    artifact: report.artifact
      ? {
          id: report.artifact.id,
          title: report.artifact.title,
          storage_path: report.artifact.storage_path,
          created_at: report.artifact.created_at,
          expires_at: report.artifact.expires_at,
        }
      : undefined,
    sources: report.sources,
    error: report.error,
  };
}

export function artifactFromToolOutput(output: unknown) {
  if (typeof output !== "object" || output === null || !("artifact" in output)) {
    return null;
  }

  const artifact = (output as { artifact?: unknown }).artifact;
  if (typeof artifact !== "object" || artifact === null) {
    return null;
  }

  const value = artifact as {
    id?: unknown;
    message_id?: unknown;
    title?: unknown;
    storage_path?: unknown;
    signed_url?: unknown;
    created_at?: unknown;
    expires_at?: unknown;
  };

  if (
    typeof value.id !== "string" ||
    typeof value.message_id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.storage_path !== "string" ||
    typeof value.signed_url !== "string" ||
    typeof value.created_at !== "string" ||
    typeof value.expires_at !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    message_id: value.message_id,
    title: value.title,
    storage_path: value.storage_path,
    signed_url: value.signed_url,
    created_at: value.created_at,
    expires_at: value.expires_at,
  };
}

function addVisitedSource(context: ToolRunContext, url: string) {
  const normalized = normalizeUrl(url);
  if (normalized) {
    context.visitedSources.add(normalized);
    context.discoveredSources.add(normalized);
  }
}

function addDiscoveredSource(context: ToolRunContext, url: string) {
  const normalized = normalizeUrl(url);
  if (normalized) {
    context.discoveredSources.add(normalized);
  }
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function isBlockedIp(address: string) {
  const version = isIP(address);
  if (version === 4) {
    return isPrivateIpv4(address);
  }

  if (version === 6) {
    return isPrivateIpv6(address);
  }

  return true;
}

async function validatePublicHttpUrl(url: string): Promise<URL | { error: string }> {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return { error: "Invalid URL." };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { error: "Only HTTP and HTTPS URLs can be fetched." };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { error: "Local URLs cannot be fetched." };
  }

  if (isIP(hostname)) {
    return isBlockedIp(hostname) ? { error: "Private or local network URLs cannot be fetched." } : parsed;
  }

  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0 || records.some((record) => isBlockedIp(record.address))) {
      return { error: "Private or local network URLs cannot be fetched." };
    }
  } catch {
    return { error: "Could not resolve URL host." };
  }

  return parsed;
}

function dedupeUrls(urls: string[]) {
  return [...new Set(urls.map((url) => normalizeUrl(url)).filter((url): url is string => Boolean(url)))];
}

function parseGeneratePdfReportInput(input: unknown): GeneratePdfReportInput | { error: string } {
  if (typeof input !== "object" || input === null) {
    return { error: "Report input must be an object." };
  }

  const value = input as {
    title?: unknown;
    sections?: unknown;
    sources?: unknown;
  };
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title) {
    return { error: "Report title is required." };
  }

  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    return { error: "At least one report section is required." };
  }

  const sections = value.sections
    .map((section) => {
      if (typeof section !== "object" || section === null) {
        return null;
      }

      const item = section as { heading?: unknown; content?: unknown };
      const heading = typeof item.heading === "string" ? item.heading.trim() : "";
      const content = typeof item.content === "string" ? item.content.trim() : "";
      if (!heading || !content) {
        return null;
      }

      return {
        heading: heading.slice(0, 160),
        content: content.slice(0, 10_000),
      };
    })
    .filter((section): section is PdfReportSection => Boolean(section));

  if (sections.length === 0) {
    return { error: "Report sections must include headings and content." };
  }

  const sources = Array.isArray(value.sources)
    ? value.sources.filter((source): source is string => typeof source === "string")
    : [];

  return {
    title: title.slice(0, 180),
    sections,
    sources,
  };
}

async function generatePdfReport(input: unknown, context: ToolRunContext) {
  try {
    const parsed = parseGeneratePdfReportInput(input);
    if ("error" in parsed) {
      return { error: parsed.error };
    }

    const knownSources = new Set([...context.discoveredSources, ...context.visitedSources]);
    const requestedSources = dedupeUrls(parsed.sources).filter((source) => knownSources.has(source));
    const sources = dedupeUrls([...context.visitedSources, ...requestedSources]);
    const artifactId = crypto.randomUUID();
    const createdAt = new Date();
    const storagePath = `${context.chatId}/${context.messageId}/${artifactId}.pdf`;
    const pdfBuffer = await renderPdfReport({
      title: parsed.title,
      generatedAt: createdAt,
      sections: parsed.sections,
      sources,
    });
    const admin = createAdminClient();

    const { error: uploadError } = await admin.storage
      .from(REPORT_ARTIFACTS_BUCKET)
      .upload(storagePath, pdfBuffer, {
        cacheControl: "3600",
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      logServerError("agent/report.upload", uploadError, {
        chatId: context.chatId,
        messageId: context.messageId,
        storagePath,
      });
      return { error: `PDF upload failed: ${uploadError.message}` };
    }

    const { data: artifact, error: insertError } = await admin
      .from("report_artifacts")
      .insert({
        id: artifactId,
        chat_id: context.chatId,
        message_id: context.messageId,
        title: parsed.title,
        storage_path: storagePath,
        created_at: createdAt.toISOString(),
      })
      .select("id, message_id, title, storage_path, created_at")
      .single();

    if (insertError || !artifact) {
      await admin.storage.from(REPORT_ARTIFACTS_BUCKET).remove([storagePath]);
      logServerError("agent/report.metadata", insertError ?? new Error("Artifact insert returned no row"), {
        chatId: context.chatId,
        messageId: context.messageId,
        storagePath,
      });
      return { error: `Report metadata insert failed: ${insertError?.message ?? "Unknown error"}` };
    }

    const signedUrl = await createReportSignedUrl(storagePath, parsed.title);
    const expiresAt = new Date(Date.now() + REPORT_SIGNED_URL_TTL_SECONDS * 1000).toISOString();

    return {
      ok: true,
      title: parsed.title,
      artifact: {
        id: artifact.id,
        message_id: artifact.message_id,
        title: artifact.title,
        storage_path: artifact.storage_path,
        created_at: artifact.created_at,
        signed_url: signedUrl,
        expires_at: expiresAt,
      },
      sources,
    };
  } catch (error) {
    logServerError("agent/report", error, {
      chatId: context.chatId,
      messageId: context.messageId,
    });
    return {
      error: `Report generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

async function webSearch(query: string): Promise<{ results?: SearchResult[]; error?: string }> {
  if (!query.trim()) {
    return { error: "Missing search query." };
  }

  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    return { error: "BRAVE_SEARCH_API_KEY is not configured on the server." };
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query.trim().slice(0, 300));
  url.searchParams.set("count", "5");
  url.searchParams.set("safesearch", "moderate");

  const timeout = timeoutSignal();
  let response: Response;

  try {
    response = await fetch(url, {
      signal: timeout.signal,
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
    });
  } catch (error) {
    logServerError("agent/web-search.fetch", error, { query: query.slice(0, 120) });
    return {
      error: error instanceof Error && error.name === "AbortError"
        ? "Brave Search timed out. Try again in a moment."
        : "Brave Search could not be reached.",
    };
  } finally {
    timeout.clear();
  }

  if (!response.ok) {
    logServerError("agent/web-search.response", new Error(`Brave Search returned HTTP ${response.status}.`), {
      status: response.status,
      query: query.slice(0, 120),
    });
    return { error: `Brave Search failed with HTTP ${response.status}.` };
  }

  let payload: {
    web?: {
      results?: Array<{
        title?: string;
        url?: string;
        description?: string;
      }>;
    };
  };

  try {
    payload = (await response.json()) as typeof payload;
  } catch (error) {
    logServerError("agent/web-search.parse", error, { query: query.slice(0, 120) });
    return { error: "Brave Search returned an invalid response." };
  }

  return {
    results: (payload.web?.results ?? []).slice(0, 5).map((result) => ({
      title: result.title ?? "Untitled result",
      url: result.url ?? "",
      snippet: result.description ?? "",
    })),
  };
}

async function fetchPage(url: string): Promise<{ url?: string; text?: string; error?: string }> {
  const validated = await validatePublicHttpUrl(url.trim());
  if ("error" in validated) {
    return { error: validated.error };
  }

  const timeout = timeoutSignal();
  let response: Response;

  try {
    response = await fetch(validated, {
      signal: timeout.signal,
      headers: {
        Accept: "text/html, text/plain;q=0.9, */*;q=0.8",
        "User-Agent": "MicroManus/0.1 research-agent",
      },
    });
  } catch (error) {
    logServerError("agent/fetch-page.fetch", error, { url: validated.toString() });
    return {
      url,
      error: error instanceof Error && error.name === "AbortError"
        ? "Fetch timed out."
        : "Fetch failed before a response was received.",
    };
  } finally {
    timeout.clear();
  }

  if (!response.ok) {
    logServerError("agent/fetch-page.response", new Error(`Page returned HTTP ${response.status}.`), {
      status: response.status,
      url: validated.toString(),
    });
    return { url, error: `Fetch failed with HTTP ${response.status}.` };
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_FETCH_CONTENT_LENGTH) {
    return { url, error: "Page is too large to fetch safely." };
  }

  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();

  return {
    url: validated.toString(),
    text: contentType.includes("html") ? stripHtml(body) : capText(body.replace(/\s+/g, " ").trim(), 12_000),
  };
}
