import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { AIModel } from "../../core/models/types";
import { useTheme } from "../theme/use-theme";
import { spacing, radius, typography } from "../theme/tokens";

const CAPABILITY_LABELS: { key: keyof AIModel["capabilities"]; label: string }[] = [
  { key: "vision", label: "Vision" },
  { key: "toolCalling", label: "Tools" },
  { key: "reasoning", label: "Reasoning" },
  { key: "imageGeneration", label: "Image" },
  { key: "videoGeneration", label: "Video" },
  { key: "audioOutput", label: "Audio" },
];

export function CapabilityBadges({ model }: { model: AIModel }) {
  const { colors } = useTheme();
  const active = CAPABILITY_LABELS.filter((c) => model.capabilities[c.key]);

  if (active.length === 0) return null;

  return (
    <View style={styles.row}>
      {active.map((c) => (
        <View key={c.key} style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.badgeText, { color: colors.accent }]}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontSize: typography.sizes.xs,
    fontWeight: "600",
  },
});
