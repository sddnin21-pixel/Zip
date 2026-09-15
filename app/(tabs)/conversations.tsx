import React from "react";
import { useRouter } from "expo-router";
import { ConversationsListScreen } from "../../src/ui/screens/ConversationsListScreen";
import { useChatStore } from "../../src/state/chat-store";

export default function ConversationsTab() {
  const router = useRouter();
  const { loadConversation, startNewConversation } = useChatStore();

  return (
    <ConversationsListScreen
      onOpen={async (id) => {
        await loadConversation(id);
        router.push("/");
      }}
      onNew={() => {
        startNewConversation();
        router.push("/");
      }}
    />
  );
}
