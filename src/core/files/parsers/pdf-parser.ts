import * as FileSystem from "expo-file-system";

/**
 * PDF text extraction via pdfjs-dist (Mozilla's PDF.js), the reference
 * implementation most other "pure JS PDF text extraction" packages wrap
 * internally. We depend on it directly rather than a thinner wrapper
 * (e.g. `pdf-parse`) because those wrappers are written for Node's `fs`
 * environment and their React-Native compatibility is not something we
 * could verify — see brief section 80 ("do not invent... document
 * limitations"). pdfjs-dist's core parsing (`getDocument` + `getTextContent`)
 * does not depend on `fs`, only on a byte buffer, which is what makes it
 * usable here. Verified against the actually-installed pdfjs-dist@4.10.38:
 * its package.json has no `legacy/` subpath (that existed in older
 * versions) — the main entry `pdfjs-dist` (-> build/pdf.mjs) is correct.
 *
 * KNOWN LIMITATION (declared per section 72, never hidden): this extracts
 * embedded text layers only. Scanned/image-only PDFs will return little or
 * no text — there is no OCR bundled. That case surfaces as a short/empty
 * result rather than a fabricated transcription.
 */
export async function parsePdf(localUri: string): Promise<{ text: string; truncated: boolean }> {
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = base64ToUint8Array(base64);

  const pdfjs = await import("pdfjs-dist");
  const loadingTask = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useWorkerFetch: false });
  const doc = await loadingTask.promise;

  const MAX_PAGES = 50;
  const MAX_CHARS = 12000;
  let text = "";
  let truncated = false;

  const pageCount = Math.min(doc.numPages, MAX_PAGES);
  truncated = doc.numPages > MAX_PAGES;

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    text += pageText + "\n\n";
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
      truncated = true;
      break;
    }
  }

  if (text.trim().length === 0) {
    text = "[No extractable text found — this PDF may be scanned/image-only. Qusin AI does not perform OCR.]";
  }

  return { text, truncated };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = globalThis.atob ? globalThis.atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
