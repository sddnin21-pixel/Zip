import { skillRegistry } from "../../core/tools/skill-registry";
import { searxngSearch, isSearxngConfigured, type SearXNGResult } from "./searxng-client";
import { extractPage } from "./web-extract";

export interface WebSearchInput {
  query: string;
  mode?: "quick" | "deep";
}

export interface CitedSource {
  title: string;
  url: string;
  snippet: string;
  /** Full extracted text only present in "deep" mode, where sources are actually opened. */
  extractedText?: string;
}

export interface WebSearchOutput {
  query: string;
  mode: "quick" | "deep";
  sources: CitedSource[];
  /** Explicit marker so the agent/UI can label this content correctly and never blend it with the model's own training knowledge (brief section 22: "AI must distinguish Known from model vs Retrieved from web"). */
  retrievedFromWeb: true;
}

async function runSearch(input: WebSearchInput): Promise<WebSearchOutput> {
  const mode = input.mode ?? "quick";
  const raw = await searxngSearch(input.query);

  const topResults: SearXNGResult[] = raw.results.slice(0, mode === "quick" ? 5 : 8);

  if (mode === "quick") {
    return {
      query: input.query,
      mode,
      sources: topResults.map((r) => ({ title: r.title, url: r.url, snippet: r.content ?? "" })),
      retrievedFromWeb: true,
    };
  }

  // Deep mode: actually open each source and extract full text for
  // cross-checking, per brief section 23's diagram (search -> multiple
  // sources -> cross-check -> extract -> synthesize -> cite).
  const opened = await Promise.allSettled(
    topResults.map(async (r): Promise<CitedSource> => {
      const extracted = await extractPage(r.url);
      return { title: r.title, url: r.url, snippet: r.content ?? "", extractedText: extracted.text };
    })
  );

  const sources = opened
    .filter((r): r is PromiseFulfilledResult<CitedSource> => r.status === "fulfilled")
    .map((r) => r.value);

  return { query: input.query, mode, sources, retrievedFromWeb: true };
}

skillRegistry.register({
  name: "web-search",
  description:
    "Search the web via a configured SearXNG instance. 'quick' returns 1-5 source snippets; 'deep' opens up to 8 sources and extracts their full text for cross-checking.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query." },
      mode: { type: "string", enum: ["quick", "deep"], description: "quick = snippets only, deep = opens and extracts sources" },
    },
    required: ["query"],
  },
  outputSchema: {
    type: "object",
    properties: {
      sources: { type: "array" },
      retrievedFromWeb: { type: "boolean" },
    },
  },
  permissions: ["NETWORK"],
  isAvailable: isSearxngConfigured,
  execute: (input: WebSearchInput) => runSearch(input),
});

skillRegistry.register({
  name: "web-open",
  description: "Open a specific URL and extract its readable text content.",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
  },
  outputSchema: { type: "object" },
  permissions: ["NETWORK"],
  isAvailable: () => true,
  execute: async (input: { url: string }) => extractPage(input.url),
});

skillRegistry.register({
  name: "web-extract",
  description: "Extract readable text from raw HTML content already fetched.",
  inputSchema: {
    type: "object",
    properties: { html: { type: "string" }, url: { type: "string" } },
    required: ["html"],
  },
  outputSchema: { type: "object" },
  permissions: ["READ"],
  isAvailable: () => true,
  execute: async (input: { html: string; url: string }) => {
    const text = input.html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { url: input.url, text };
  },
});
