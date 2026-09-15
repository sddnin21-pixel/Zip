/**
 * Raw XKIRO API shapes. These mirror exactly what docs.xkiro.com/api/list-models
 * and /api/chat-completions document, and what GET https://api.xkiro.com/v1/models
 * returns live (verified 2026-09-14). Do not hand-edit without re-checking the
 * live endpoint — this is the one place XKIRO-specific fields are allowed to exist.
 */

export interface XkiroModelEntry {
  id: string; // "vendor/model", e.g. "anthropic/claude-sonnet-5"
  object: "model";
  type?: "model";
  display_name: string;
  created?: number;
  owned_by: string;
  modality: "chat" | "image" | "tts" | "stt" | "embedding" | "ocr" | "moderation" | "video" | "music";
  access_tier: "free" | "paid" | "premium";
  pricing?: {
    currency: string;
    unit: string;
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
  capabilities: {
    vision: boolean;
    tools: boolean;
    reasoning: boolean;
  };
  context_length?: number;
  max_output_tokens?: number;
  reasoning_efforts?: {
    levels: string[];
    default: string;
  };
  min_plan_usd?: number;
  min_plan_names?: string[];
}

export interface XkiroModelsListResponse {
  object: "list";
  data: XkiroModelEntry[];
}

export interface XkiroChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content:
    | string
    | (| { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } })[];
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
}

export interface XkiroChatCompletionRequest {
  model: string;
  messages: XkiroChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
  response_format?: { type: "json_object" | "text" };
  tools?: {
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  reasoning_effort?: string;
  user?: string;
}

export interface XkiroChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    };
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter";
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface XkiroStreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
      tool_calls?: {
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
