import type { ProviderId } from "../models/types";
import type { QusinMessage } from "./message-types";

export interface ModelSwitchEvent {
  id: string;
  fromProvider?: ProviderId;
  fromModel?: string;
  toProvider: ProviderId;
  toModel: string;
  /** Message index at which the switch took effect. */
  atMessageIndex: number;
  reason: "user_choice" | "failover" | "rate_limit" | "error";
  timestamp: number;
}

export interface ConversationSettings {
  /** Preferred provider/model for new messages, until the user switches again. */
  defaultProviderId?: ProviderId;
  defaultModelId?: string;
  /** Optional per-conversation system prompt. */
  systemPrompt?: string;
  /** Whether Qusin's memory system should read/write for this conversation. */
  memoryEnabled: boolean;
  /** Provider fallback chain, evaluated in order on failure (section 14). */
  fallbackChain?: { providerId: ProviderId; modelId: string }[];
}

export interface Conversation {
  id: string;
  projectId?: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: QusinMessage[];
  memoryRefIds: string[];
  fileRefIds: string[];
  modelHistory: ModelSwitchEvent[];
  settings: ConversationSettings;
  pinned: boolean;
  archived: boolean;
  /** Rolling summary maintained by the context manager once the transcript grows past what fits in a typical context window. */
  summary?: string;
  summaryUpToMessageIndex?: number;
}

export function createConversation(partial?: Partial<Conversation>): Conversation {
  const now = Date.now();
  return {
    id: partial?.id ?? crypto.randomUUID(),
    title: partial?.title ?? "New conversation",
    createdAt: partial?.createdAt ?? now,
    updatedAt: partial?.updatedAt ?? now,
    messages: partial?.messages ?? [],
    memoryRefIds: partial?.memoryRefIds ?? [],
    fileRefIds: partial?.fileRefIds ?? [],
    modelHistory: partial?.modelHistory ?? [],
    settings: partial?.settings ?? { memoryEnabled: true },
    pinned: partial?.pinned ?? false,
    archived: partial?.archived ?? false,
    ...partial,
  };
}
