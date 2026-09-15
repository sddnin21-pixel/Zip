import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useModelsStore } from "../../state/models-store";
import type { AIModel, ProviderId } from "../../core/models/types";
import { useTheme } from "../theme/use-theme";
import { spacing, radius, typography, providerAccent } from "../theme/tokens";
import { ModelListItem } from "../components/ModelListItem";

const PROVIDER_TABS: { id: ProviderId; label: string }[] = [
  { id: "xkiro", label: "XKIRO" },
  { id: "kiraai", label: "KiraAI" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "local", label: "Local" },
];

interface Props {
  onSelect: (providerId: ProviderId, modelId: string) => void;
  selectedProviderId?: ProviderId;
  selectedModelId?: string | null;
}

export function ModelPickerScreen({ onSelect, selectedProviderId, selectedModelId }: Props) {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<ProviderId>(selectedProviderId ?? "openrouter");
  const { catalogs, loading, errors, staleFlags, searchQuery, setSearchQuery, filteredModels, loadAll, refresh } =
    useModelsStore();

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // filteredModels closes over Zustand store state (catalogs, searchQuery)
  // rather than reading it from React props/state directly, so those two
  // must stay listed here for useMemo to actually recompute when they
  // change — the lint rule can't see the closure and flags them as
  // "unnecessary", but removing them would make model search/refresh stop
  // updating the list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const models = useMemo(() => filteredModels(activeTab), [filteredModels, activeTab, catalogs, searchQuery]);
  const isLoading = loading[activeTab];
  const error = errors[activeTab];
  const isStale = staleFlags[activeTab];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          placeholder="Search models..."
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={[styles.searchInput, { color: colors.textPrimary }]}
        />
      </View>

      <View style={styles.tabs}>
        {PROVIDER_TABS.map((tab) => {
          const active = tab.id === activeTab;
          const accent = providerAccent[tab.id];
          return (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={[
                styles.tab,
                { borderColor: active ? accent : colors.border, backgroundColor: active ? colors.accentSoft : "transparent" },
              ]}
            >
              <View style={[styles.tabDot, { backgroundColor: accent }]} />
              <Text style={[styles.tabLabel, { color: active ? colors.textPrimary : colors.textSecondary }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isStale && (
        <View style={[styles.banner, { backgroundColor: colors.accentSoft }]}>
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>
            Using cached model list — refresh for the latest.
          </Text>
          <Pressable onPress={() => refresh(activeTab)}>
            <Text style={{ color: colors.accent, fontSize: typography.sizes.xs, fontWeight: "600" }}>Refresh</Text>
          </Pressable>
        </View>
      )}

      {error && (
        <View style={[styles.banner, { backgroundColor: colors.dangerSoft }]}>
          <Text style={{ color: colors.danger, fontSize: typography.sizes.xs, flex: 1 }} numberOfLines={2}>
            {error}
          </Text>
        </View>
      )}

      {isLoading && models.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : models.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Text style={{ color: colors.textSecondary }}>
            {activeTab === "kiraai" ? "Add a KiraAI key in Settings to load its models." : "No models found."}
          </Text>
        </View>
      ) : (
        <FlashList
          data={models}
          estimatedItemSize={90}
          keyExtractor={(item: AIModel) => item.id}
          renderItem={({ item }: { item: AIModel }) => (
            <ModelListItem
              model={item}
              selected={item.id === selectedModelId && activeTab === selectedProviderId}
              onPress={() => onSelect(activeTab, item.id)}
            />
          )}
          contentContainerStyle={{ padding: spacing.md }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: {
    margin: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  searchInput: { height: 44, fontSize: typography.sizes.base },
  tabs: { flexDirection: "row", paddingHorizontal: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  tabDot: { width: 6, height: 6, borderRadius: 3 },
  tabLabel: { fontSize: typography.sizes.sm, fontWeight: "600" },
  banner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
});
