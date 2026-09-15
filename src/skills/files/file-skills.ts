import * as FileSystem from "expo-file-system";
import { skillRegistry } from "../../core/tools/skill-registry";
import { fileStore } from "../../core/files/file-store";
import { uploadFile } from "../../core/files/file-pipeline";

skillRegistry.register({
  name: "file-read",
  description: "Read the extracted text content of a previously-uploaded file by its file ID.",
  inputSchema: { type: "object", properties: { fileId: { type: "string" } }, required: ["fileId"] },
  outputSchema: { type: "object" },
  permissions: ["READ"],
  isAvailable: () => true,
  execute: async (input: { fileId: string }) => {
    const record = await fileStore.get(input.fileId);
    if (!record) throw new Error(`No file found with id ${input.fileId}`);
    return { fileName: record.fileName, mimeType: record.mimeType, text: record.extractedTextPreview ?? "" };
  },
});

skillRegistry.register({
  name: "file-write",
  description: "Write text content to a new file in the app's local documents area.",
  inputSchema: {
    type: "object",
    properties: { fileName: { type: "string" }, content: { type: "string" } },
    required: ["fileName", "content"],
  },
  outputSchema: { type: "object" },
  permissions: ["WRITE"],
  isAvailable: () => true,
  execute: async (input: { fileName: string; content: string }) => {
    const dir = `${FileSystem.documentDirectory}qusin-generated/`;
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const uri = `${dir}${input.fileName}`;
    await FileSystem.writeAsStringAsync(uri, input.content, { encoding: FileSystem.EncodingType.UTF8 });
    return { localUri: uri };
  },
});

skillRegistry.register({
  name: "file-upload",
  description: "Run the full upload pipeline (validate, scan, parse) on a locally-picked file and attach it to the current conversation.",
  inputSchema: {
    type: "object",
    properties: {
      localUri: { type: "string" },
      fileName: { type: "string" },
      mimeType: { type: "string" },
      conversationId: { type: "string" },
      destination: { type: "string", enum: ["local", "remote"] },
    },
    required: ["localUri", "fileName", "destination"],
  },
  outputSchema: { type: "object" },
  permissions: ["READ", "WRITE"],
  isAvailable: () => true,
  execute: (input: Parameters<typeof uploadFile>[0]) => uploadFile(input),
});

skillRegistry.register({
  name: "file-download",
  description: "Get a shareable local URI for a previously-generated or uploaded file so the user can save/export it.",
  inputSchema: { type: "object", properties: { fileId: { type: "string" } }, required: ["fileId"] },
  outputSchema: { type: "object" },
  permissions: ["READ"],
  isAvailable: () => true,
  execute: async (input: { fileId: string }) => {
    const record = await fileStore.get(input.fileId);
    if (!record) throw new Error(`No file found with id ${input.fileId}`);
    return { localUri: record.localUri, fileName: record.fileName };
  },
});

skillRegistry.register({
  name: "file-convert",
  description:
    "Convert a supported file's extracted text into a different plain-format output (e.g. spreadsheet -> CSV text, docx -> plain text). Does not support format conversions requiring layout preservation (e.g. docx -> pdf) — use the relevant document-generation skill for that instead.",
  inputSchema: {
    type: "object",
    properties: { fileId: { type: "string" }, targetFormat: { type: "string", enum: ["txt", "csv"] } },
    required: ["fileId", "targetFormat"],
  },
  outputSchema: { type: "object" },
  permissions: ["READ", "WRITE"],
  isAvailable: () => true,
  execute: async (input: { fileId: string; targetFormat: string }) => {
    const record = await fileStore.get(input.fileId);
    if (!record) throw new Error(`No file found with id ${input.fileId}`);
    if (!record.extractedTextPreview) {
      throw new Error(`"${record.fileName}" has no extracted text to convert (UNSUPPORTED or parsing failed).`);
    }
    return { text: record.extractedTextPreview, targetFormat: input.targetFormat };
  },
});
