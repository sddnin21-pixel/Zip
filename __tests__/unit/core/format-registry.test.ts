import { lookupFormat, FORMAT_REGISTRY } from "../../../src/core/files/format-registry";

describe("lookupFormat", () => {
  // Brief section 68 explicitly lists these formats as the acceptance test set.
  const shouldBeParseable = ["report.pdf", "report.docx", "sheet.xlsx", "data.csv", "notes.json", "readme.txt", "photo.png", "photo.jpg", "archive.zip"];

  it.each(shouldBeParseable)("recognizes %s as a supported, parseable format", (fileName) => {
    const format = lookupFormat(fileName);
    expect(format).toBeDefined();
    expect(format?.parseable).toBe(true);
  });

  it("recognizes legacy .doc as unsupported with a clear reason, not silently accepted", () => {
    const format = lookupFormat("old-report.doc");
    expect(format?.parseable).toBe(false);
    expect(format?.notes).toMatch(/not supported/i);
  });

  it("recognizes legacy .ppt as unsupported with a clear reason", () => {
    const format = lookupFormat("old-slides.ppt");
    expect(format?.parseable).toBe(false);
  });

  it("returns undefined (not a fabricated default) for a completely unknown extension", () => {
    expect(lookupFormat("mystery.xyz123")).toBeUndefined();
  });

  it("matches by MIME type when the filename extension is ambiguous", () => {
    const format = lookupFormat("upload", "application/pdf");
    expect(format?.category).toBe("document");
  });

  it("marks video/audio formats as metadata-only rather than claiming transcription", () => {
    const mp4 = lookupFormat("clip.mp4");
    expect(mp4?.notes).toMatch(/metadata only/i);
  });

  it("every registry entry has at least one extension and one mime type", () => {
    for (const entry of FORMAT_REGISTRY) {
      expect(entry.extensions.length).toBeGreaterThan(0);
      expect(entry.mimeTypes.length).toBeGreaterThan(0);
    }
  });
});
