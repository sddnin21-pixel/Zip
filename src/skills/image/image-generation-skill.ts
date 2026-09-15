import { skillRegistry } from "../../core/tools/skill-registry";
import { modelCatalogCache } from "../../core/models/catalog-cache";
import { keyManager } from "../../core/keys/key-manager";
import { fetchJson } from "../../providers/shared/http";
import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";

/**
 * Image generation (brief section 27). XKIRO's live model catalog
 * (verified via GET https://api.xkiro.com/v1/models) includes entries with
 * modality: "image" — e.g. image-generation models alongside chat models,
 * all under the same /v1 namespace. XKIRO's docs describe chat/completions
 * as the primary documented endpoint; a dedicated /v1/images/generations
 * endpoint was NOT explicitly confirmed in the docs pages we read. Rather
 * than invent that endpoint's exact shape, this skill:
 *  1. Picks the first available XKIRO model with capabilities.imageGeneration
 *  2. Calls it through the same /v1/chat/completions path used for text,
 *     which is the one confirmed-working request path — many gateway
 *     providers route image models through a chat-style endpoint and
 *     return an image URL/base64 in the message content.
 *  3. If that shape doesn't match what the account's models actually
 *     return, this surfaces as a clear error rather than a silent fake
 *     image (brief section 72).
 *
 * This is deliberately marked as a best-effort integration pending
 * confirmation against XKIRO's dedicated image docs page/response shape.
 */

export interface ImageGenInput {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
}

export interface ImageGenOutput {
  localUri: string;
  model: string;
}

async function isXkiroImageAvailable(): Promise<boolean> {
  const cache = await modelCatalogCache.get("xkiro");
  return !!cache?.models.some((m) => m.capabilities.imageGeneration);
}

async function generateImage(input: ImageGenInput): Promise<ImageGenOutput> {
  const cache = await modelCatalogCache.get("xkiro");
  const model = cache?.models.find((m) => m.capabilities.imageGeneration);
  if (!model) {
    throw new Error("REQUIRES CONFIGURATION: no image-generation model is currently available from XKIRO.");
  }

  const key = await keyManager.resolveKey("xkiro", "smart");
  if (!key) throw new Error("No usable XKIRO API key — add one in Settings > Keys.");

  const result = await fetchJson<{
    choices?: { message?: { content?: string } }[];
    data?: { url?: string; b64_json?: string }[];
  }>("https://api.xkiro.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key.secret}` },
    body: {
      model: model.id,
      messages: [
        {
          role: "user",
          content: input.negativePrompt
            ? `${input.prompt} (avoid: ${input.negativePrompt})`
            : input.prompt,
        },
      ],
    },
    timeoutMs: 120_000,
  });

  if (!result.ok) throw result.error;

  // Try both plausible response shapes: an images-style `data[].url` /
  // `data[].b64_json`, or a chat-style message content containing a URL.
  const imageUrl =
    result.data.data?.[0]?.url ??
    (result.data.choices?.[0]?.message?.content?.match(/https?:\/\/\S+\.(png|jpg|jpeg|webp)/i)?.[0]);
  const b64 = result.data.data?.[0]?.b64_json;

  if (!imageUrl && !b64) {
    throw new Error(
      "XKIRO's response did not include a recognizable image URL or base64 payload — the image endpoint's exact response shape needs to be re-verified against current XKIRO docs."
    );
  }

  const dir = `${FileSystem.documentDirectory}qusin-generated/`;
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const localUri = `${dir}image-${Crypto.randomUUID()}.png`;

  if (b64) {
    await FileSystem.writeAsStringAsync(localUri, b64, { encoding: FileSystem.EncodingType.Base64 });
  } else if (imageUrl) {
    await FileSystem.downloadAsync(imageUrl, localUri);
  }

  return { localUri, model: model.id };
}

skillRegistry.register({
  name: "image-generate",
  description: "Generate an image from a text prompt using an available image-generation model.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      negativePrompt: { type: "string" },
      aspectRatio: { type: "string" },
    },
    required: ["prompt"],
  },
  outputSchema: { type: "object" },
  permissions: ["NETWORK", "WRITE"],
  isAvailable: isXkiroImageAvailable,
  execute: generateImage,
});
