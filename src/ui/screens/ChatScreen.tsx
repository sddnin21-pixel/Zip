import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { FlashList } from "@shopify/flash-list";
import * as DocumentPicker from "expo-document-picker";
import { useChatStore } from "../../state/chat-store";
import { useTheme } from "../theme/use-theme";
import { spacing, typography, radius } from "../theme/tokens";
import { MessageBubble } from "../components/MessageBubble";
import { ChatComposer } from "../components/ChatComposer";
import { ModelPickerScreen } from "./ModelPickerScreen";
import type { QusinMessage } from "../../core/conversation/message-types";
import { uploadFile } from "../../core/files/file-pipeline";

export function ChatScreen() {
  const { colors } = useTheme();
  const {
    conversation,
    isStreaming,
    streamingText,
    lastSwitchNotice,
    selectedProviderId,
    selectedModelId,
    startNewConversation,
    selectModel,
    sendMessage,
    cancelGeneration,
    clearSwitchNotice,
  } = useChatStore();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const listRef = useRef<FlashList<QusinMessage>>(null);

  useEffect(() => {
    if (!conversation) startNewConversation();
  }, [conversation, startNewConversation]);

  useEffect(() => {
    if (lastSwitchNotice) {
      const timer = setTimeout(clearSwitchNotice, 4000);
      return () => clearTimeout(timer);
    }
  }, [lastSwitchNotice, clearSwitchNotice]);

  const messages = conversation?.messages ?? [];
  const displayMessages: QusinMessage[] = isStreaming
    ? [
        ...messages,
        {
          id: "__streaming__",
          role: "assistant",
          parts: [{ type: "text", text: streamingText }],
          provider: selectedProviderId,
          model: selectedModelId ?? undefined,
          timestamp: Date.now(),
        },
      ]
    : messages;

  const handleAttach = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const uploadResult = await uploadFile({
      localUri: asset.uri,
      fileName: asset.name,
      mimeType: asset.mimeType,
      conversationId: conversation?.id,
      destination: selectedProviderId === "local" ? "local" : "remote",
    });
    if (!uploadResult.ok) {
      // In a full build this surfaces via a toast/snackbar component; kept
      // minimal here since the file-pipeline error already has a clear message.
      console.warn(uploadResult.error.message);
    }
  };

  if (pickerOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ModelPickerScreen
          selectedProviderId={selectedProviderId}
          selectedModelId={selectedModelId}
          onSelect={(providerId, modelId) => {
            void selectModel(providerId, modelId);
            setPickerOpen(false);
          }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {lastSwitchNotice && (
        <View style={[styles.switchBanner, { backgroundColor: colors.accentSoft }]}>
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>
            Model switched: {lastSwitchNotice.fromModel ?? "—"} → {lastSwitchNotice.toModel}
            {lastSwitchNotice.reason !== "user_choice" ? ` (${lastSwitchNotice.reason})` : ""}
          </Text>
        </View>
      )}

      {messages.length === 0 && !isStreaming ? (
        <View style={styles.emptyState}>
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.lg, textAlign: "center" }}>
            Start a conversation
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: typography.sizes.sm, textAlign: "center", marginTop: spacing.xs }}>
            Pick a model below to begin
          </Text>
        </View>
      ) : (
        <FlashList
          ref={listRef}
          data={displayMessages}
          keyExtractor={(item: QusinMessage) => item.id}
          renderItem={({ item }: { item: QusinMessage }) => <MessageBubble message={item} />}
          estimatedItemSize={80}
          contentContainerStyle={{ paddingVertical: spacing.md }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      <ChatComposer
        selectedProviderId={selectedProviderId}
        selectedModelLabel={selectedModelId}
        isStreaming={isStreaming}
        agentModeEnabled={agentMode}
        webSearchEnabled={webSearch}
        onToggleAgentMode={() => setAgentMode((v) => !v)}
        onToggleWebSearch={() => setWebSearch((v) => !v)}
        onAttach={handleAttach}
        onOpenModelPicker={() => setPickerOpen(true)}
        onCancel={cancelGeneration}
        onSend={(text) => {
          if (!selectedModelId) {
            setPickerOpen(true);
            return;
          }
          void sendMessage(text);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  switchBanner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
  },
});
