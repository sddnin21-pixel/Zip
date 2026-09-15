import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import type { AIModel } from "../../core/models/types";
import { useTheme } from "../theme/use-theme";
import { spacing, radius, typography, providerAccent } from "../theme/tokens";
import { CapabilityBadges } from "./CapabilityBadges";

interface Props {
  model: AIModel;
  selected: boolean;
  onPress: () => void;
}

export function ModelListItem({ model, selected, onPress }: Props) {
  const { colors } = useTheme();
  const accent = providerAccent[model.providerId] ?? colors.accent;

  const priceLabel =
    model.pricing?.input !== undefined
      ? `$${model.pricing.input.toFixed(2)} / 1M in`
      : model.accessTier === "free"
        ? "Free"
        : undefined;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.container,
        { backgroundColor: selected ? colors.accentSoft : colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {model.displayName}
        </Text>
        <View style={styles.metaRow}>
          {model.contextWindow && (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {formatContext(model.contextWindow)} ctx
            </Text>
          )}
          {priceLabel && <Text style={[styles.meta, { color: colors.textSecondary }]}>{priceLabel}</Text>}
          {model.status === "unavailable" && (
            <Text style={[styles.meta, { color: colors.danger }]}>Unavailable</Text>
          )}
          {model.local && !model.local.compatible && (
            <Text style={[styles.meta, { color: colors.danger }]} numberOfLines={1}>
              {model.local.incompatibleReason ?? "Incompatible"}
            </Text>
          )}
        </View>
        <CapabilityBadges model={model} />
      </View>
    </Pressable>
  );
}

function formatContext(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  info: { flex: 1, gap: spacing.xs },
  name: { fontSize: typography.sizes.base, fontWeight: "600" },
  metaRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  meta: { fontSize: typography.sizes.xs },
});
