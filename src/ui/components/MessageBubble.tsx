import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { QusinMessage } from "../../core/conversation/message-types";
import { messageToPlainText } from "../../core/conversation/message-types";
import { useTheme } from "../theme/use-theme";
import { spacing, radius, typography, providerAccent } from "../theme/tokens";

const PROVIDER_LABELS: Record<string, string> = {
  xkiro: "XKIRO",
  kiraai: "KiraAI",
  openrouter: "OpenRouter",
  local: "Local",
};

export function MessageBubble({ message }: { message: QusinMessage }) {
  const { colors } = useTheme();
  const isUser = message.role === "user";
  const text = messageToPlainText(message);
  const accent = message.provider ? providerAccent[message.provider] : undefined;

  if (message.role === "tool" || message.role === "system") return null;

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? colors.bubbleUser : colors.bubbleAssistant,
            borderBottomRightRadius: isUser ? radius.sm : radius.lg,
            borderBottomLeftRadius: isUser ? radius.lg : radius.sm,
          },
        ]}
      >
        {!isUser && message.provider && (
          <View style={styles.badgeRow}>
            <View style={[styles.dot, { backgroundColor: accent }]} />
            <Text style={[styles.badgeText, { color: colors.textTertiary }]}>
              {PROVIDER_LABELS[message.provider] ?? message.provider}
              {message.model ? ` · ${message.model}` : ""}
            </Text>
          </View>
        )}
        <Text style={{ color: isUser ? colors.bubbleUserText : colors.bubbleAssistantText, fontSize: typography.sizes.base }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.md, marginVertical: spacing.xs },
  rowUser: { alignItems: "flex-end" },
  rowAssistant: { alignItems: "flex-start" },
  bubble: { maxWidth: "85%", padding: spacing.md, borderRadius: radius.lg },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.xs },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: typography.sizes.xs, fontWeight: "600" },
});
