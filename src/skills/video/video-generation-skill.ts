import { skillRegistry } from "../../core/tools/skill-registry";
import { modelCatalogCache } from "../../core/models/catalog-cache";
import { keyManager } from "../../core/keys/key-manager";
import { fetchJson } from "../../providers/shared/http";
import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";

/**
 * Video generation (brief section 28). Same honesty constraint as
 * image-generation-skill.ts: XKIRO's live catalog includes modality:"video"
 * entries, confirming video models exist on the platform, but a dedicated
 * video-generation endpoint's exact async job/polling shape was not
 * confirmed against docs in this session. Many gateway-style video APIs
 * (including several referenced in general research) use a two-step
 * create-job -> poll-status pattern rather than a single synchronous call.
 * We implement that pattern defensively: submit, then poll a `/v1/jobs/{id}`
 * style endpoint if XKIRO returns a job id, otherwise treat the response as
 * already-complete. If the account's actual video model uses a different
 * response contract, this surfaces as a clear, specific error rather than
 * a silently fabricated video (brief section 72).
 */

export interface VideoGenInput {
  prompt: string;
  negativePrompt?: string;
  durationSeconds?: number;
  aspectRatio?: string;
}

export interface VideoGenOutput {
  localUri: string;
  model: string;
}

async function isXkiroVideoAvailable(): Promise<boolean> {
  const cache = await modelCatalogCache.get("xkiro");
  return !!cache?.models.some((m) => m.capabilities.videoGeneration);
}

async function generateVideo(input: VideoGenInput): Promise<VideoGenOutput> {
  const cache = await modelCatalogCache.get("xkiro");
  const model = cache?.models.find((m) => m.capabilities.videoGeneration);
  if (!model) {
    throw new Error("REQUIRES CONFIGURATION: no video-generation model is currently available from XKIRO.");
  }

  const key = await keyManager.resolveKey("xkiro", "smart");
  if (!key) throw new Error("No usable XKIRO API key — add one in Settings > Keys.");

  const submitResult = await fetchJson<{
    id?: string;
    status?: string;
    video_url?: string;
    url?: string;
  }>("https://api.xkiro.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key.secret}` },
    body: {
      model: model.id,
      messages: [{ role: "user", content: input.prompt }],
      duration: input.durationSeconds,
    },
    timeoutMs: 60_000,
  });

  if (!submitResult.ok) throw submitResult.error;

  let videoUrl = submitResult.data.video_url ?? submitResult.data.url;

  // If XKIRO returned a job id instead of a direct result, poll for completion.
  if (!videoUrl && submitResult.data.id) {
    videoUrl = await pollForVideoUrl(submitResult.data.id, key.secret);
  }

  if (!videoUrl) {
    throw new Error(
      "XKIRO's response did not include a video URL or a job id to poll — the video endpoint's exact response shape needs to be re-verified against current XKIRO docs."
    );
  }

  const dir = `${FileSystem.documentDirectory}qusin-generated/`;
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const localUri = `${dir}video-${Crypto.randomUUID()}.mp4`;
  await FileSystem.downloadAsync(videoUrl, localUri);

  return { localUri, model: model.id };
}

async function pollForVideoUrl(jobId: string, apiKey: string): Promise<string | undefined> {
  const MAX_ATTEMPTS = 30;
  const POLL_INTERVAL_MS = 4000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const result = await fetchJson<{ status?: string; video_url?: string; url?: string }>(
      `https://api.xkiro.com/v1/jobs/${jobId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!result.ok) continue; // transient poll failure — keep trying until MAX_ATTEMPTS
    if (result.data.status === "completed" || result.data.video_url || result.data.url) {
      return result.data.video_url ?? result.data.url;
    }
    if (result.data.status === "failed") {
      throw new Error(`Video generation job ${jobId} failed.`);
    }
  }
  throw new Error(`Video generation job ${jobId} did not complete within the polling window.`);
}

skillRegistry.register({
  name: "video-generate",
  description: "Generate a short video from a text prompt using an available video-generation model.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      negativePrompt: { type: "string" },
      durationSeconds: { type: "number" },
      aspectRatio: { type: "string" },
    },
    required: ["prompt"],
  },
  outputSchema: { type: "object" },
  permissions: ["NETWORK", "WRITE"],
  isAvailable: isXkiroVideoAvailable,
  execute: generateVideo,
});
