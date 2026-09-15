import React, { useState } from "react";
import { View, TextInput, Pressable, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/use-theme";
import { spacing, radius, typography, providerAccent } from "../theme/tokens";
import type { ProviderId } from "../../core/models/types";

interface Props {
  onSend: (text: string) => void;
  onAttach: () => void;
  onOpenModelPicker: () => void;
  onToggleAgentMode: () => void;
  onToggleWebSearch: () => void;
  agentModeEnabled: boolean;
  webSearchEnabled: boolean;
  selectedProviderId: ProviderId | null;
  selectedModelLabel: string | null;
  isStreaming: boolean;
  onCancel: () => void;
}

export function ChatComposer({
  onSend,
  onAttach,
  onOpenModelPicker,
  onToggleAgentMode,
  onToggleWebSearch,
  agentModeEnabled,
  webSearchEnabled,
  selectedProviderId,
  selectedModelLabel,
  isStreaming,
  onCancel,
}: Props) {
  const { colors } = useTheme();
  const [text, setText] = useState("");

  const handleSend = () => {
    if (!text.trim() || isStreaming) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        onPress={onOpenModelPicker}
        style={[styles.modelChip, { borderColor: selectedProviderId ? providerAccent[selectedProviderId] : colors.border }]}
      >
        <Text style={[styles.modelChipText, { color: colors.textSecondary }]} numberOfLines={1}>
          {selectedModelLabel ?? "Select a model"}
        </Text>
      </Pressable>

      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Message Qusin AI..."
        placeholderTextColor={colors.textTertiary}
        multiline
        style={[styles.input, { color: colors.textPrimary }]}
      />

      <View style={styles.toolbar}>
        <Pressable onPress={onAttach} style={styles.iconButton}>
          <Text style={{ color: colors.textSecondary }}>📎</Text>
        </Pressable>
        <Pressable
          onPress={onToggleWebSearch}
          style={[styles.iconButton, webSearchEnabled && { backgroundColor: colors.accentSoft }]}
        >
          <Text style={{ color: webSearchEnabled ? colors.accent : colors.textSecondary }}>🌐</Text>
        </Pressable>
        <Pressable
          onPress={onToggleAgentMode}
          style={[styles.iconButton, agentModeEnabled && { backgroundColor: colors.accentSoft }]}
        >
          <Text style={{ color: agentModeEnabled ? colors.accent : colors.textSecondary }}>🤖</Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        {isStreaming ? (
          <Pressable onPress={onCancel} style={[styles.sendButton, { backgroundColor: colors.danger }]}>
            <Text style={styles.sendButtonText}>Stop</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSend}
            disabled={!text.trim()}
            style={[styles.sendButton, { backgroundColor: text.trim() ? colors.accent : colors.border }]}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderRadius: radius.xl,
    margin: spacing.sm,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  modelChip: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    maxWidth: 220,
  },
  modelChipText: { fontSize: typography.sizes.xs, fontWeight: "600" },
  input: {
    fontSize: typography.sizes.base,
    minHeight: 40,
    maxHeight: 140,
    paddingHorizontal: spacing.xs,
  },
  toolbar: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  sendButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  sendButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: typography.sizes.sm },
});
