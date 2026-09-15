/**
 * Raw OpenRouter API shapes, per https://openrouter.ai/docs — a fully
 * public, well-documented API. GET /api/v1/models requires no key at all.
 */

export interface OpenRouterModelEntry {
  id: string; // "vendor/model", e.g. "anthropic/claude-sonnet-4.6"
  name: string;
  description?: string;
  context_length?: number;
  architecture?: {
    modality?: string; // e.g. "text+image->text"
    input_modalities?: string[];
    output_modalities?: string[];
    tokenizer?: string;
  };
  pricing?: {
    prompt?: string; // stringified decimal, USD per token (not per-1M!)
    completion?: string;
    image?: string;
    request?: string;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  per_request_limits?: Record<string, unknown> | null;
  supported_parameters?: string[]; // e.g. ["tools", "reasoning", "response_format"]
}

export interface OpenRouterModelsListResponse {
  data: OpenRouterModelEntry[];
}

export interface OpenRouterChatMessage {
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

export interface OpenRouterChatCompletionRequest {
  model: string;
  messages: OpenRouterChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  tools?: {
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  reasoning?: { effort?: "low" | "medium" | "high" };
  response_format?: { type: "json_object" | "text" };
  /** OpenRouter-specific: lets us pin/exclude upstream providers for a given model. */
  provider?: { order?: string[]; allow_fallbacks?: boolean };
}

export interface OpenRouterChatCompletionResponse {
  id: string;
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
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenRouterStreamChunk {
  id: string;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: {
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
