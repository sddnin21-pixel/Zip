import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";
import { skillRegistry } from "../../core/tools/skill-registry";

export interface DocGenInput {
  format: "docx" | "csv" | "json" | "txt" | "md" | "xlsx" | "pdf";
  fileName: string;
  /** For docx/txt/md/pdf: plain text content, paragraphs split on \n\n. For csv/xlsx: array of row arrays. For json: any serializable value. */
  content: string | unknown[][] | Record<string, unknown>;
}

export interface DocGenOutput {
  localUri: string;
  format: string;
}

async function generateDocument(input: DocGenInput): Promise<DocGenOutput> {
  const dir = `${FileSystem.documentDirectory}qusin-generated/`;
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  const baseName = sanitizeFileName(input.fileName) || `document-${Crypto.randomUUID().slice(0, 8)}`;

  switch (input.format) {
    case "docx":
      return generateDocx(dir, baseName, input.content as string);
    case "csv":
      return generateCsv(dir, baseName, input.content as unknown[][]);
    case "xlsx":
      return generateXlsx(dir, baseName, input.content as unknown[][]);
    case "pdf":
      return generatePdf(dir, baseName, input.content as string);
    case "json":
      return generateJson(dir, baseName, input.content);
    case "txt":
      return generatePlain(dir, baseName, "txt", input.content as string);
    case "md":
      return generatePlain(dir, baseName, "md", input.content as string);
    default:
      throw new Error(`UNSUPPORTED: document format "${input.format}" is not implemented.`);
  }
}

async function generateXlsx(dir: string, baseName: string, rows: unknown[][]): Promise<DocGenOutput> {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  const localUri = `${dir}${baseName}.xlsx`;
  await FileSystem.writeAsStringAsync(localUri, base64, { encoding: FileSystem.EncodingType.Base64 });

  // Validate: re-read it back and confirm the row count matches.
  const reread = XLSX.read(base64, { type: "base64" });
  const sheet = reread.Sheets["Sheet1"];
  if (!sheet) {
    throw new Error("Generated XLSX validation failed: Sheet1 is missing from the re-read workbook.");
  }
  const rereadRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
  if (rereadRows.length !== rows.length) {
    throw new Error(`Generated XLSX validation failed: expected ${rows.length} rows, found ${rereadRows.length}.`);
  }

  return { localUri, format: "xlsx" };
}

async function generatePdf(dir: string, baseName: string, content: string): Promise<DocGenOutput> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 11;
  const margin = 50;
  const pageWidth = 612;
  const pageHeight = 792;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = fontSize * 1.4;

  const lines = wrapText(content, font, fontSize, maxWidth);

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  for (const line of lines) {
    if (y < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
    y -= lineHeight;
  }

  const base64 = await pdfDoc.saveAsBase64();
  const localUri = `${dir}${baseName}.pdf`;
  await FileSystem.writeAsStringAsync(localUri, base64, { encoding: FileSystem.EncodingType.Base64 });

  // Validate: confirm the file starts with the PDF magic header.
  const header = base64.startsWith("JVBERi0"); // base64 of "%PDF-"
  if (!header) {
    throw new Error("Generated PDF validation failed: output does not start with a valid PDF header.");
  }

  return { localUri, format: "pdf" };
}

function wrapText(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ");
    let current = "";
    for (const word of words) {
      const attempt = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(attempt, fontSize) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = attempt;
      }
    }
    lines.push(current);
  }
  return lines;
}

async function generateDocx(dir: string, baseName: string, content: string): Promise<DocGenOutput> {
  const { Document, Packer, Paragraph } = await import("docx");

  const paragraphs = content.split(/\n\n+/).map((block) => new Paragraph({ text: block }));
  const doc = new Document({ sections: [{ children: paragraphs }] });

  const base64 = await Packer.toBase64String(doc);
  const localUri = `${dir}${baseName}.docx`;
  await FileSystem.writeAsStringAsync(localUri, base64, { encoding: FileSystem.EncodingType.Base64 });

  // Validate: a well-formed docx is itself a zip with word/document.xml present.
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(base64, { base64: true });
  if (!zip.files["word/document.xml"]) {
    throw new Error("Generated DOCX validation failed: word/document.xml is missing from the output.");
  }

  return { localUri, format: "docx" };
}

async function generateCsv(dir: string, baseName: string, rows: unknown[][]): Promise<DocGenOutput> {
  const csv = rows
    .map((row) => row.map((cell) => escapeCsvCell(String(cell ?? ""))).join(","))
    .join("\n");
  const localUri = `${dir}${baseName}.csv`;
  await FileSystem.writeAsStringAsync(localUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  return { localUri, format: "csv" };
}

async function generateJson(dir: string, baseName: string, content: unknown): Promise<DocGenOutput> {
  const localUri = `${dir}${baseName}.json`;
  await FileSystem.writeAsStringAsync(localUri, JSON.stringify(content, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  // Validate it round-trips.
  const written = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.UTF8 });
  JSON.parse(written);
  return { localUri, format: "json" };
}

async function generatePlain(dir: string, baseName: string, ext: string, content: string): Promise<DocGenOutput> {
  const localUri = `${dir}${baseName}.${ext}`;
  await FileSystem.writeAsStringAsync(localUri, content, { encoding: FileSystem.EncodingType.UTF8 });
  return { localUri, format: ext };
}

function escapeCsvCell(cell: string): string {
  if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
}

skillRegistry.register({
  name: "document-generate",
  description: "Generate a real downloadable document file: docx, pdf, xlsx, csv, json, txt, or md.",
  inputSchema: {
    type: "object",
    properties: {
      format: { type: "string", enum: ["docx", "csv", "json", "txt", "md", "xlsx", "pdf"] },
      fileName: { type: "string" },
      content: {},
    },
    required: ["format", "fileName", "content"],
  },
  outputSchema: { type: "object" },
  permissions: ["WRITE"],
  isAvailable: () => true,
  execute: generateDocument,
});
