import * as FileSystem from "expo-file-system";

/**
 * PPTX is a zip of OOXML XML files (one slideN.xml per slide, under
 * ppt/slides/). We use JSZip (pure JS, widely used, no native deps) to
 * unzip and regex out <a:t> text-run contents — a minimal but honest
 * implementation: text only, no layout/speaker-notes/image extraction
 * (declared in format-registry.ts notes).
 */
export async function parsePptx(localUri: string): Promise<{ text: string; truncated: boolean }> {
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(base64, { base64: true });

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      const numB = Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      return numA - numB;
    });

  const MAX_CHARS = 12000;
  let text = "";
  for (const [i, fileName] of slideFiles.entries()) {
    const xml = await zip.files[fileName]!.async("string");
    const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
    text += `--- Slide ${i + 1} ---\n${runs.join(" ")}\n\n`;
    if (text.length > MAX_CHARS) break;
  }

  const truncated = text.length > MAX_CHARS;
  return { text: truncated ? text.slice(0, MAX_CHARS) : text, truncated };
}
