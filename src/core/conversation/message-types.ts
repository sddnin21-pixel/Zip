/**
 * Provider-agnostic message format. Every provider adapter translates
 * QusinMessage -> its own request shape, and its own response shape ->
 * QusinMessage. This indirection is what makes model switching possible
 * without losing context (brief section 53).
 */

import type { ProviderId } from "../models/types";

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ImagePart {
  type: "image";
  /** Either a remote URL or a data: URL. Provider adapters decide whether to pass through or re-encode. */
  url: string;
  mimeType?: string;
}

export interface FilePart {
  type: "file";
  fileRefId: string;
  fileName: string;
  mimeType: string;
}

export interface ToolCallPart {
  type: "tool_call";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultPart {
  type: "tool_result";
  toolCallId: string;
  name: string;
  result: unknown;
  isError?: boolean;
}

export type MessagePart =
  | TextPart
  | ImagePart
  | FilePart
  | ToolCallPart
  | ToolResultPart;

export interface QusinMessage {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  /** Which provider/model actually produced this message (assistant messages only). */
  provider?: ProviderId;
  model?: string;
  timestamp: number;
  /** Token usage as reported by the provider, when available. */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** finish_reason / stop_reason normalized across providers. */
  finishReason?: "stop" | "length" | "tool_calls" | "content_filter" | "error";
  metadata?: Record<string, unknown>;
}

/** Convenience constructor — most messages are plain text. */
export function textMessage(
  role: MessageRole,
  text: string,
  extra?: Partial<QusinMessage>
): QusinMessage {
  return {
    id: extra?.id ?? crypto.randomUUID(),
    role,
    parts: [{ type: "text", text }],
    timestamp: extra?.timestamp ?? Date.now(),
    ...extra,
  };
}

/** Extract plain text from a message, concatenating all text parts. Used for token estimation and providers/UIs that don't handle multi-part content. */
export function messageToPlainText(message: QusinMessage): string {
  return message.parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}
