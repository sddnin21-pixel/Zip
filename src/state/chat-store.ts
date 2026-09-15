import { create } from "zustand";
import type { Conversation } from "../core/conversation/conversation-types";
import type { ProviderId } from "../core/models/types";
import { conversationStore } from "../core/conversation/conversation-store";
import { conversationEngine } from "../core/conversation/conversation-engine";
import { createConversation } from "../core/conversation/conversation-types";
import type { RouteTarget } from "../core/router/model-router";

interface SwitchNotice {
  fromModel?: string;
  toModel: string;
  reason: string;
}

interface ChatState {
  conversation: Conversation | null;
  isStreaming: boolean;
  streamingText: string;
  lastSwitchNotice: SwitchNotice | null;
  selectedProviderId: ProviderId;
  selectedModelId: string | null;
  abortController: AbortController | null;

  loadConversation: (id: string) => Promise<void>;
  startNewConversation: () => void;
  selectModel: (providerId: ProviderId, modelId: string) => Promise<void>;
  sendMessage: (text: string, fallbacks?: RouteTarget[]) => Promise<void>;
  cancelGeneration: () => void;
  clearSwitchNotice: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversation: null,
  isStreaming: false,
  streamingText: "",
  lastSwitchNotice: null,
  selectedProviderId: "openrouter",
  selectedModelId: null,
  abortController: null,

  loadConversation: async (id: string) => {
    const conversation = await conversationStore.get(id);
    if (conversation) {
      set({
        conversation,
        selectedProviderId: conversation.settings.defaultProviderId ?? "openrouter",
        selectedModelId: conversation.settings.defaultModelId ?? null,
      });
    }
  },

  startNewConversation: () => {
    const conversation = createConversation();
    conversationStore.create(conversation);
    set({ conversation, streamingText: "", lastSwitchNotice: null });
  },

  selectModel: async (providerId, modelId) => {
    const { conversation } = get();
    set({ selectedProviderId: providerId, selectedModelId: modelId });
    if (conversation) {
      await conversationEngine.switchModel(conversation, { providerId, modelId }, "user_choice");
      set({ conversation: { ...conversation } });
    }
  },

  sendMessage: async (text, fallbacks) => {
    const { conversation, selectedProviderId, selectedModelId } = get();
    if (!conversation || !selectedModelId) return;

    const abortController = new AbortController();
    set({ isStreaming: true, streamingText: "", abortController });

    try {
      const gen = conversationEngine.sendMessage({
        conversation,
        userText: text,
        target: { providerId: selectedProviderId, modelId: selectedModelId },
        fallbacks,
        onSwitchNotice: (notice) => set({ lastSwitchNotice: notice }),
      });

      let result = await gen.next();
      while (!result.done) {
        const chunk = result.value;
        if (chunk.textDelta) {
          set((s) => ({ streamingText: s.streamingText + chunk.textDelta }));
        }
        result = await gen.next();
      }

      set({ conversation: { ...conversation }, isStreaming: false, streamingText: "", abortController: null });
    } catch (err) {
      set({ isStreaming: false, streamingText: "", abortController: null });
      throw err;
    }
  },

  cancelGeneration: () => {
    get().abortController?.abort();
    set({ isStreaming: false, abortController: null });
  },

  clearSwitchNotice: () => set({ lastSwitchNotice: null }),
}));
