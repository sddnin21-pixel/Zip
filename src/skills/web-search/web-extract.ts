import { fetchJson } from "../../providers/shared/http";
import { isSafeExternalUrl } from "../../security/input-validation";

export interface ExtractedPage {
  url: string;
  title?: string;
  text: string;
  truncated: boolean;
}

const MAX_EXTRACT_CHARS = 8000;

/**
 * Fetch a page and reduce HTML to a readable text approximation. This is a
 * lightweight regex-based reduction, not a full readability/DOM parser
 * (React Native has no DOMParser by default) — good enough for feeding an
 * LLM synthesis step, not a pixel-perfect content extractor. We are
 * explicit about that limitation rather than claiming full-fidelity
 * extraction (brief section 72).
 */
export async function extractPage(url: string): Promise<ExtractedPage> {
  const safety = isSafeExternalUrl(url);
  if (!safety.safe) {
    throw new Error(`Refused to fetch "${url}": ${safety.reason}`);
  }

  const result = await fetchJson<string>(url, { headers: { Accept: "text/html,application/xhtml+xml" } });
  if (!result.ok) throw result.error;

  const html = typeof result.data === "string" ? result.data : JSON.stringify(result.data);
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  const truncated = text.length > MAX_EXTRACT_CHARS;
  return {
    url,
    title: titleMatch?.[1]?.trim(),
    text: truncated ? text.slice(0, MAX_EXTRACT_CHARS) : text,
    truncated,
  };
}
