import * as FileSystem from "expo-file-system";

/**
 * Spreadsheet/CSV/TSV parsing via SheetJS (xlsx package) — handles all
 * three formats through one reader since SheetJS's `read()` auto-detects
 * the format from content, and CSV/TSV are trivial cases of the same
 * workbook model.
 */
export async function parseXlsx(localUri: string, mimeType: string): Promise<{ text: string; truncated: boolean }> {
  const XLSX = await import("xlsx");

  const isCsvLike = mimeType.includes("csv") || mimeType.includes("tab-separated");
  let workbook;

  if (isCsvLike) {
    const raw = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.UTF8 });
    workbook = XLSX.read(raw, { type: "string" });
  } else {
    const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
    workbook = XLSX.read(base64, { type: "base64" });
  }

  const MAX_CHARS = 12000;
  let text = "";
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet);
    text += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
    if (text.length > MAX_CHARS) break;
  }

  const truncated = text.length > MAX_CHARS;
  return { text: truncated ? text.slice(0, MAX_CHARS) : text, truncated };
}
