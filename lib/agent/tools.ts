import "server-only";

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
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
];

export async function runTool(name: string, input: unknown) {
  if (name === "web_search") {
    const query = typeof input === "object" && input !== null && "query" in input
      ? String((input as { query?: unknown }).query ?? "")
      : "";
    return webSearch(query);
  }

  if (name === "fetch_page") {
    const url = typeof input === "object" && input !== null && "url" in input
      ? String((input as { url?: unknown }).url ?? "")
      : "";
    return fetchPage(url);
  }

  return { error: `Unknown tool: ${name}` };
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
  url.searchParams.set("q", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("safesearch", "moderate");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    return { error: `Brave Search failed with HTTP ${response.status}.` };
  }

  const payload = (await response.json()) as {
    web?: {
      results?: Array<{
        title?: string;
        url?: string;
        description?: string;
      }>;
    };
  };

  return {
    results: (payload.web?.results ?? []).slice(0, 5).map((result) => ({
      title: result.title ?? "Untitled result",
      url: result.url ?? "",
      snippet: result.description ?? "",
    })),
  };
}

async function fetchPage(url: string): Promise<{ url?: string; text?: string; error?: string }> {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return { error: "Invalid URL." };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { error: "Only HTTP and HTTPS URLs can be fetched." };
  }

  const response = await fetch(parsed, {
    headers: {
      Accept: "text/html, text/plain;q=0.9, */*;q=0.8",
      "User-Agent": "MicroManus/0.1 research-agent",
    },
  });

  if (!response.ok) {
    return { url, error: `Fetch failed with HTTP ${response.status}.` };
  }

  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();

  return {
    url,
    text: contentType.includes("html") ? stripHtml(body) : capText(body.replace(/\s+/g, " ").trim(), 12_000),
  };
}
