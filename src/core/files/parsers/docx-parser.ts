import * as FileSystem from "expo-file-system";

/**
 * DOCX -> text via mammoth (https://github.com/mwilliamson/mammoth.js),
 * a widely-used pure-JS docx converter. mammoth.convertToHtml/extractRawText
 * both accept an arrayBuffer, which is what we build from the file's
 * base64 content.
 */
export async function parseDocx(localUri: string): Promise<{ text: string; truncated: boolean }> {
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
  const arrayBuffer = base64ToArrayBuffer(base64);

  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer });

  const MAX_CHARS = 12000;
  const truncated = result.value.length > MAX_CHARS;
  return { text: truncated ? result.value.slice(0, MAX_CHARS) : result.value, truncated };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = globalThis.atob ? globalThis.atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
