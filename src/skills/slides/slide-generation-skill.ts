import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";
import { skillRegistry } from "../../core/tools/skill-registry";

export interface SlideContent {
  title: string;
  bullets?: string[];
  notes?: string;
}

export interface SlideGenInput {
  presentationTitle: string;
  slides: SlideContent[];
  theme?: { primaryColor?: string; fontFace?: string };
}

export interface SlideGenOutput {
  localUri: string;
  slideCount: number;
}

/**
 * Real PPTX generation via pptxgenjs (brief section 29 — "Do not just
 * return text pretending to be a PowerPoint"). Builds an actual OOXML
 * .pptx file, then validates it by re-reading the zip's slide count so a
 * corrupt output never gets returned as a success.
 */
async function generateSlides(input: SlideGenInput): Promise<SlideGenOutput> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pres = new PptxGenJS();

  const primaryColor = input.theme?.primaryColor ?? "2563EB";
  const fontFace = input.theme?.fontFace ?? "Arial";

  // Title slide
  const titleSlide = pres.addSlide();
  titleSlide.addText(input.presentationTitle, {
    x: 0.5,
    y: 2.2,
    w: 9,
    h: 1.5,
    fontSize: 36,
    bold: true,
    color: primaryColor,
    fontFace,
    align: "center",
  });

  for (const content of input.slides) {
    const slide = pres.addSlide();
    slide.addText(content.title, {
      x: 0.5,
      y: 0.4,
      w: 9,
      h: 0.8,
      fontSize: 26,
      bold: true,
      color: primaryColor,
      fontFace,
    });
    if (content.bullets && content.bullets.length > 0) {
      slide.addText(
        content.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        { x: 0.5, y: 1.4, w: 9, h: 4.5, fontSize: 18, fontFace, color: "333333" }
      );
    }
    if (content.notes) {
      slide.addNotes(content.notes);
    }
  }

  const dir = `${FileSystem.documentDirectory}qusin-generated/`;
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const localUri = `${dir}${sanitizeFileName(input.presentationTitle)}-${Crypto.randomUUID().slice(0, 8)}.pptx`;

  const base64 = (await pres.write({ outputType: "base64" })) as string;
  await FileSystem.writeAsStringAsync(localUri, base64, { encoding: FileSystem.EncodingType.Base64 });

  // Validate: re-open the zip and confirm the expected number of slide XML files exist.
  const JSZip = (await import("jszip")).default;
  const verifyZip = await JSZip.loadAsync(base64, { base64: true });
  const slideFileCount = Object.keys(verifyZip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length;
  const expectedCount = input.slides.length + 1; // +1 for title slide
  if (slideFileCount !== expectedCount) {
    throw new Error(
      `Generated PPTX validation failed: expected ${expectedCount} slides, found ${slideFileCount} in the output file.`
    );
  }

  return { localUri, slideCount: slideFileCount };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "presentation";
}

skillRegistry.register({
  name: "slide-generate",
  description: "Generate a real .pptx PowerPoint file from a title and a list of slides (each with a title and bullet points).",
  inputSchema: {
    type: "object",
    properties: {
      presentationTitle: { type: "string" },
      slides: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
            notes: { type: "string" },
          },
          required: ["title"],
        },
      },
    },
    required: ["presentationTitle", "slides"],
  },
  outputSchema: { type: "object" },
  permissions: ["WRITE"],
  isAvailable: () => true,
  execute: generateSlides,
});
