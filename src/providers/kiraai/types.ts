/**
 * Raw KiraAI API shapes, per https://kiraai.vn/documents/ (fetched 2026-09-14).
 * KiraAI's chat/completions surface is OpenAI-compatible; the models list
 * shape is NOT documented field-by-field the way XKIRO's is — the docs only
 * state it returns "ID, tên hiển thị, thể loại, trạng thái và đơn giá"
 * (id, display name, category, status, pricing). We model the conservative
 * superset and treat unknown/missing fields as optional so we never invent
 * data the response doesn't actually contain (brief section 2, section 80).
 *
 * GET /api/v1/models requires Authorization: Bearer <key> per the docs —
 * unlike XKIRO this is not a public endpoint, so we could not verify the
 * exact live response body without an account key. If the live shape
 * differs from what's modeled here, only normalize.ts needs to change.
 */

export interface KiraAiModelEntry {
  id: string; // e.g. "kira-3.5-flash", or a partner model id
  display_name?: string;
  name?: string; // possible alternate field name — docs are not explicit
  category?: "chat" | "image" | "video" | "tts" | string;
  status?: "active" | "inactive" | string;
  description?: string;
  context_length?: number;
  max_output_tokens?: number;
  pricing?: {
    input?: number;
    output?: number;
    currency?: string;
    unit?: string;
  };
  capabilities?: {
    vision?: boolean;
    tools?: boolean;
    reasoning?: boolean;
  };
  /** Free-tier models use the "kira-" prefix per docs section 2 (pricing page). */
  free?: boolean;
}

/**
 * The docs do not show a wrapper envelope for GET /models the way XKIRO's
 * `{ object: "list", data: [...] }` is documented. We accept either a bare
 * array or an `{ data: [...] }` wrapper and normalize whichever we get —
 * see kiraai-provider.ts#parseModelsResponse.
 */
export type KiraAiModelsListResponse = KiraAiModelEntry[] | { data: KiraAiModelEntry[] };

export interface KiraAiChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content:
    | string
    | (| { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } })[];
  tool_call_id?: string;
}

export interface KiraAiChatCompletionRequest {
  model: string;
  messages: KiraAiChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface KiraAiChatCompletionResponse {
  id?: string;
  model: string;
  choices: {
    index: number;
    message: { role: "assistant"; content: string };
    finish_reason?: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface KiraAiStreamChunk {
  id?: string;
  model: string;
  choices: {
    index: number;
    delta: { role?: string; content?: string };
    finish_reason?: string | null;
  }[];
}

export interface KiraAiUserProfile {
  vnd_balance?: number;
  token_balance?: number;
  daily_limit?: number;
  used_today?: number;
}
