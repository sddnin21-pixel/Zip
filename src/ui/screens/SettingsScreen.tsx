import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useTheme } from "../theme/use-theme";
import { spacing, radius, typography } from "../theme/tokens";

export interface SettingsSection {
  id: string;
  title: string;
  subtitle: string;
}

const SECTIONS: SettingsSection[] = [
  { id: "general", title: "General", subtitle: "Language, defaults" },
  { id: "providers", title: "Providers", subtitle: "XKIRO, KiraAI, OpenRouter, Local" },
  { id: "keys", title: "Keys", subtitle: "Manage API keys per provider" },
  { id: "models", title: "Models", subtitle: "Catalog cache, refresh" },
  { id: "local-models", title: "Local Models", subtitle: "Download and manage on-device models" },
  { id: "memory", title: "Memory", subtitle: "View, search, export, clear memory" },
  { id: "agents", title: "Agents", subtitle: "Agent limits and behavior" },
  { id: "skills", title: "Skills", subtitle: "Enable/disable individual tools" },
  { id: "web-search", title: "Web Search", subtitle: "SearXNG instance configuration" },
  { id: "files", title: "Files", subtitle: "Format support, storage" },
  { id: "image", title: "Image", subtitle: "Image generation settings" },
  { id: "video", title: "Video", subtitle: "Video generation settings" },
  { id: "audio", title: "Audio", subtitle: "TTS/STT settings" },
  { id: "privacy", title: "Privacy", subtitle: "Local vs remote data handling" },
  { id: "security", title: "Security", subtitle: "Tool permissions, confirmations" },
  { id: "storage", title: "Storage", subtitle: "Local model storage usage" },
  { id: "appearance", title: "Appearance", subtitle: "Light/dark mode" },
  { id: "advanced", title: "Advanced", subtitle: "Diagnostics, export/import" },
];

export function SettingsScreen({ onSelectSection }: { onSelectSection: (id: string) => void }) {
  const { colors } = useTheme();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={[styles.header, { color: colors.textPrimary }]}>Settings</Text>
      {SECTIONS.map((section) => (
        <Pressable
          key={section.id}
          onPress={() => onSelectSection(section.id)}
          style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: typography.sizes.base }}>
              {section.title}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>{section.subtitle}</Text>
          </View>
          <Text style={{ color: colors.textTertiary }}>›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: typography.sizes.xxl, fontWeight: "700", marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
});
