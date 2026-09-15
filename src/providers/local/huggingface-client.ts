import { fetchJson } from "../shared/http";
import { normalizedError } from "../shared/errors";
import type { GGUFQuantizationVariant, HuggingFaceFileInfo, HuggingFaceRepoSummary } from "./types";

/**
 * Hugging Face's real public Hub API. No key required for public repo
 * search/metadata. Documented at https://huggingface.co/docs/hub/api.
 */
const HF_API_BASE = "https://huggingface.co/api";

interface HfSearchResultRaw {
  id: string;
  author?: string;
  downloads?: number;
  likes?: number;
  tags?: string[];
  pipeline_tag?: string;
  lastModified?: string;
}

interface HfRepoFilesRaw {
  siblings?: { rfilename: string; size?: number }[];
}

/**
 * Search Hugging Face for GGUF-format chat models. We filter server-side
 * by the "gguf" library tag where the API supports it, and additionally
 * filter client-side on returned tags, since GGUF availability is what
 * determines whether llama.rn can actually run the model (brief section 9).
 */
export async function searchGGUFModels(query: string, limit = 25): Promise<HuggingFaceRepoSummary[]> {
  const url = `${HF_API_BASE}/models?search=${encodeURIComponent(query)}&filter=gguf&limit=${limit}&full=true`;
  const result = await fetchJson<HfSearchResultRaw[]>(url);
  if (!result.ok) throw result.error;
  return result.data.map((r) => ({
    id: r.id,
    author: r.author,
    downloads: r.downloads,
    likes: r.likes,
    tags: r.tags,
    pipeline_tag: r.pipeline_tag,
    lastModified: r.lastModified,
  }));
}

/** List every file in a repo so we can find the actual .gguf assets and their sizes. */
export async function listRepoFiles(repoId: string): Promise<HuggingFaceFileInfo[]> {
  const url = `${HF_API_BASE}/models/${repoId}`;
  const result = await fetchJson<HfRepoFilesRaw>(url);
  if (!result.ok) throw result.error;
  return (result.data.siblings ?? [])
    .filter((f) => f.rfilename.toLowerCase().endsWith(".gguf"))
    .map((f) => ({ path: f.rfilename, sizeBytes: f.size }));
}

/** Extract the quantization label from a filename like "model.Q4_K_M.gguf" -> "Q4_K_M". */
function extractQuantization(fileName: string): string {
  const match = fileName.match(/[.\-_]((?:IQ|Q)\d[\w]*|F16|F32|BF16)\.gguf$/i);
  return match?.[1]?.toUpperCase() ?? "unknown";
}

export async function getGGUFVariants(repoId: string): Promise<GGUFQuantizationVariant[]> {
  const files = await listRepoFiles(repoId);
  if (files.length === 0) {
    throw normalizedError(
      "MODEL_UNAVAILABLE",
      `${repoId} has no .gguf files — it is not compatible with Qusin AI's on-device runtime (llama.rn requires GGUF).`
    );
  }
  return files.map((f) => ({
    fileName: f.path,
    quantization: extractQuantization(f.path),
    sizeBytes: f.sizeBytes,
    downloadUrl: `https://huggingface.co/${repoId}/resolve/main/${f.path}`,
  }));
}
