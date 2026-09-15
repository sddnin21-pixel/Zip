import { create } from "zustand";
import type { Conversation } from "../core/conversation/conversation-types";
import { conversationStore } from "../core/conversation/conversation-store";

interface ConversationsState {
  conversations: Conversation[];
  searchQuery: string;
  loading: boolean;

  load: () => Promise<void>;
  setSearchQuery: (q: string) => void;
  pin: (id: string, pinned: boolean) => Promise<void>;
  archive: (id: string, archived: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
}

export const useConversationsStore = create<ConversationsState>((set, get) => ({
  conversations: [],
  searchQuery: "",
  loading: false,

  load: async () => {
    set({ loading: true });
    const { searchQuery } = get();
    const conversations = await conversationStore.list({
      archived: false,
      searchQuery: searchQuery || undefined,
    });
    set({ conversations, loading: false });
  },

  setSearchQuery: (q) => {
    set({ searchQuery: q });
    void get().load();
  },

  pin: async (id, pinned) => {
    await conversationStore.setPinned(id, pinned);
    await get().load();
  },

  archive: async (id, archived) => {
    await conversationStore.setArchived(id, archived);
    await get().load();
  },

  remove: async (id) => {
    await conversationStore.delete(id);
    await get().load();
  },

  rename: async (id, title) => {
    await conversationStore.rename(id, title);
    await get().load();
  },
}));
