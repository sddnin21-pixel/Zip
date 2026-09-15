import { fetchJson } from "../../providers/shared/http";
import { getSetting } from "../../storage/settings-store";

/**
 * SearXNG search API, per https://docs.searxng.org/dev/search_api.html
 * (fetched 2026-09-14). IMPORTANT — verified fact that shapes this whole
 * module: most *public* SearXNG instances ship with the JSON output format
 * disabled by default (only HTML is on unless the instance operator
 * explicitly enables `formats: [html, json]` in settings.yml). There is no
 * single official "public SearXNG API" URL we can hard-code and expect to
 * keep working — doing so would violate brief section 80 ("do not invent
 * endpoints... isolate provider adapters... document provider limitations").
 *
 * So: the instance URL is a user-configured setting (Settings > Web
 * Search), pointing at either a self-hosted SearXNG or a public instance
 * the user has confirmed has JSON enabled (see https://searx.space/ for a
 * list of instances and their supported formats). If unset, isAvailable()
 * returns false and the skill reports REQUIRES CONFIGURATION rather than
 * silently failing or fabricating results (brief section 72/79).
 */

export interface SearXNGResult {
  title: string;
  url: string;
  content?: string;
  engine?: string;
  publishedDate?: string;
}

interface SearXNGResponse {
  query: string;
  number_of_results: number;
  results: SearXNGResult[];
  answers?: string[];
  infoboxes?: { infobox: string; content?: string }[];
}

export async function getSearxngBaseUrl(): Promise<string | undefined> {
  return getSetting<string>("web_search.searxng_base_url");
}

export async function isSearxngConfigured(): Promise<boolean> {
  const url = await getSearxngBaseUrl();
  return !!url;
}

export async function searxngSearch(
  query: string,
  opts?: { timeRange?: "day" | "month" | "year"; language?: string; pageno?: number }
): Promise<SearXNGResponse> {
  const baseUrl = await getSearxngBaseUrl();
  if (!baseUrl) {
    throw new Error(
      "REQUIRES CONFIGURATION: no SearXNG instance URL is set. Add one in Settings > Web Search — either self-host SearXNG or use a public instance from searx.space that has the JSON format enabled."
    );
  }

  const params = new URLSearchParams({ q: query, format: "json" });
  if (opts?.timeRange) params.set("time_range", opts.timeRange);
  if (opts?.language) params.set("language", opts.language);
  if (opts?.pageno) params.set("pageno", String(opts.pageno));

  const url = `${baseUrl.replace(/\/$/, "")}/search?${params.toString()}`;
  const result = await fetchJson<SearXNGResponse>(url);
  if (!result.ok) {
    throw new Error(
      result.error.httpStatus === 403
        ? "This SearXNG instance has the JSON format disabled. Configure a different instance or enable `formats: [html, json]` in its settings.yml."
        : result.error.message
    );
  }
  return result.data;
}
