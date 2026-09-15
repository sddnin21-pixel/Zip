/**
 * Format support matrix. Every entry here reflects what Qusin AI can
 * ACTUALLY parse with the libraries wired into this build — brief section
 * 24: "Do not promise 'every format' if no parser exists." Formats not
 * listed (or listed with parseable: false) surface the "Unsupported
 * format" message from section 24's flow, never a silently-broken attempt.
 */

export type FileCategory =
  | "document"
  | "spreadsheet"
  | "presentation"
  | "text"
  | "data"
  | "code"
  | "archive"
  | "image"
  | "audio"
  | "video";

export interface FormatSupport {
  extensions: string[];
  mimeTypes: string[];
  category: FileCategory;
  parseable: boolean;
  /** Which module actually implements parsing — undefined when parseable is false. */
  parserModule?: string;
  notes?: string;
}

/**
 * Parseable today, using libraries this build actually ships:
 *  - PDF: pdf-parse (text extraction only, no OCR — scanned/image PDFs report as low-text-yield rather than silently empty)
 *  - DOCX: mammoth (docx -> text/html)
 *  - XLSX/CSV/TSV: xlsx (SheetJS) for tabular parsing
 *  - PPTX: a minimal OOXML/zip-based slide-text extractor (slide XML -> text runs). No image/layout extraction.
 *  - Plain text / code / markdown / json / xml / html / css: read directly, no special parser needed
 *  - Images: not "parsed" as text — routed to vision-capable models instead (see providers/*)
 *  - Audio/video: metadata only (duration, codec) — no transcription bundled; a future stt skill could add this via a real model, not fabricated
 *
 * NOT parseable in this build (declared honestly, not silently dropped):
 *  - Legacy binary DOC / PPT / XLS (pre-2007 OOXML) — would require a
 *    different parser (e.g. a WASM port of libreoffice or antiword) not
 *    included here. Reported as UNSUPPORTED with that reason.
 *  - ZIP: file listing only (to prevent zip-bomb/path-traversal risk per
 *    section 25) — contents are not auto-extracted.
 */
export const FORMAT_REGISTRY: FormatSupport[] = [
  { extensions: ["pdf"], mimeTypes: ["application/pdf"], category: "document", parseable: true, parserModule: "pdf-parser" },
  { extensions: ["docx"], mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], category: "document", parseable: true, parserModule: "docx-parser" },
  { extensions: ["doc"], mimeTypes: ["application/msword"], category: "document", parseable: false, notes: "Legacy binary .doc is not supported — no parser is bundled. Convert to .docx first." },
  { extensions: ["pptx"], mimeTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"], category: "presentation", parseable: true, parserModule: "pptx-parser" },
  { extensions: ["ppt"], mimeTypes: ["application/vnd.ms-powerpoint"], category: "presentation", parseable: false, notes: "Legacy binary .ppt is not supported. Convert to .pptx first." },
  { extensions: ["xlsx", "xls"], mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"], category: "spreadsheet", parseable: true, parserModule: "xlsx-parser" },
  { extensions: ["csv"], mimeTypes: ["text/csv"], category: "data", parseable: true, parserModule: "xlsx-parser" },
  { extensions: ["tsv"], mimeTypes: ["text/tab-separated-values"], category: "data", parseable: true, parserModule: "xlsx-parser" },
  { extensions: ["txt"], mimeTypes: ["text/plain"], category: "text", parseable: true, parserModule: "text-passthrough" },
  { extensions: ["md"], mimeTypes: ["text/markdown"], category: "text", parseable: true, parserModule: "text-passthrough" },
  { extensions: ["json"], mimeTypes: ["application/json"], category: "data", parseable: true, parserModule: "text-passthrough" },
  { extensions: ["xml"], mimeTypes: ["application/xml", "text/xml"], category: "data", parseable: true, parserModule: "text-passthrough" },
  { extensions: ["html", "htm"], mimeTypes: ["text/html"], category: "text", parseable: true, parserModule: "text-passthrough" },
  { extensions: ["css"], mimeTypes: ["text/css"], category: "code", parseable: true, parserModule: "text-passthrough" },
  { extensions: ["js", "ts", "tsx", "jsx"], mimeTypes: ["text/javascript", "application/typescript"], category: "code", parseable: true, parserModule: "text-passthrough" },
  { extensions: ["py"], mimeTypes: ["text/x-python"], category: "code", parseable: true, parserModule: "text-passthrough" },
  { extensions: ["java"], mimeTypes: ["text/x-java"], category: "code", parseable: true, parserModule: "text-passthrough" },
  { extensions: ["kt"], mimeTypes: ["text/x-kotlin"], category: "code", parseable: true, parserModule: "text-passthrough" },
  { extensions: ["c", "h"], mimeTypes: ["text/x-c"], category: "code", parseable: true, parserModule: "text-passthrough" },
  { extensions: ["cpp", "hpp", "cc"], mimeTypes: ["text/x-c++"], category: "code", parseable: true, parserModule: "text-passthrough" },
  { extensions: ["zip"], mimeTypes: ["application/zip"], category: "archive", parseable: true, parserModule: "zip-lister", notes: "File listing only — contents are not auto-extracted, to prevent zip-bomb/path-traversal risk (section 25)." },
  { extensions: ["jpg", "jpeg"], mimeTypes: ["image/jpeg"], category: "image", parseable: true, parserModule: "image-passthrough" },
  { extensions: ["png"], mimeTypes: ["image/png"], category: "image", parseable: true, parserModule: "image-passthrough" },
  { extensions: ["webp"], mimeTypes: ["image/webp"], category: "image", parseable: true, parserModule: "image-passthrough" },
  { extensions: ["gif"], mimeTypes: ["image/gif"], category: "image", parseable: true, parserModule: "image-passthrough" },
  { extensions: ["svg"], mimeTypes: ["image/svg+xml"], category: "image", parseable: true, parserModule: "text-passthrough" },
  { extensions: ["mp3"], mimeTypes: ["audio/mpeg"], category: "audio", parseable: true, parserModule: "media-metadata", notes: "Metadata only (duration/codec) — no transcription bundled." },
  { extensions: ["wav"], mimeTypes: ["audio/wav"], category: "audio", parseable: true, parserModule: "media-metadata", notes: "Metadata only." },
  { extensions: ["m4a"], mimeTypes: ["audio/mp4"], category: "audio", parseable: true, parserModule: "media-metadata", notes: "Metadata only." },
  { extensions: ["mp4"], mimeTypes: ["video/mp4"], category: "video", parseable: true, parserModule: "media-metadata", notes: "Metadata only — no frame/transcript extraction bundled." },
  { extensions: ["mov"], mimeTypes: ["video/quicktime"], category: "video", parseable: true, parserModule: "media-metadata", notes: "Metadata only." },
  { extensions: ["webm"], mimeTypes: ["video/webm"], category: "video", parseable: true, parserModule: "media-metadata", notes: "Metadata only." },
];

export function lookupFormat(fileName: string, mimeType?: string): FormatSupport | undefined {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return FORMAT_REGISTRY.find(
    (f) => (ext && f.extensions.includes(ext)) || (mimeType && f.mimeTypes.includes(mimeType))
  );
}
