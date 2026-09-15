import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { searchGGUFModels, getGGUFVariants } from "../../providers/local/huggingface-client";
import { checkGGUFCompatibility } from "../../providers/local/compatibility";
import { localModelManager } from "../../providers/local/local-model-manager";
import { localModelStore } from "../../providers/local/local-model-store";
import type { HuggingFaceRepoSummary, GGUFQuantizationVariant, LocalModelRecord } from "../../providers/local/types";
import { useTheme } from "../theme/use-theme";
import { spacing, radius, typography } from "../theme/tokens";

export function LocalModelManagerScreen() {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<HuggingFaceRepoSummary[]>([]);
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);
  const [variants, setVariants] = useState<GGUFQuantizationVariant[]>([]);
  const [downloading, setDownloading] = useState<Record<string, number>>({});
  const [downloaded, setDownloaded] = useState<LocalModelRecord[]>([]);

  const loadDownloaded = async () => setDownloaded(await localModelStore.list());

  React.useEffect(() => {
    void loadDownloaded();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const repos = await searchGGUFModels(query.trim());
      setResults(repos);
    } catch (err) {
      Alert.alert("Search failed", err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const handleExpand = async (repoId: string) => {
    if (expandedRepo === repoId) {
      setExpandedRepo(null);
      return;
    }
    try {
      const v = await getGGUFVariants(repoId);
      setVariants(v);
      setExpandedRepo(repoId);
    } catch (err) {
      Alert.alert(
        "Incompatible",
        err instanceof Error ? err.message : `${repoId} has no GGUF files — not compatible with this app's on-device runtime.`
      );
    }
  };

  const handleDownload = async (repoId: string, variant: GGUFQuantizationVariant) => {
    const compatibility = checkGGUFCompatibility(variant);
    const record: LocalModelRecord = {
      id: `${repoId}::${variant.quantization}`,
      repo: repoId,
      quantization: variant.quantization,
      displayName: `${repoId.split("/").pop()} (${variant.quantization})`,
      fileName: variant.fileName,
      downloadUrl: variant.downloadUrl,
      fileSizeBytes: variant.sizeBytes,
      downloadedBytes: 0,
      status: compatibility.compatible ? "downloading" : "incompatible",
      compatibility,
      addedAt: Date.now(),
    };

    if (!compatibility.compatible) {
      await localModelStore.upsert(record);
      await loadDownloaded();
      Alert.alert("Unsupported/incompatible", compatibility.reason ?? "This model cannot run on this device.");
      return;
    }

    await localModelStore.upsert(record);
    await loadDownloaded();

    try {
      const { localPath, sizeBytes } = await localModelManager.download(record, (progress) => {
        const pct = progress.totalBytesExpectedToWrite
          ? progress.totalBytesWritten / progress.totalBytesExpectedToWrite
          : 0;
        setDownloading((s) => ({ ...s, [record.id]: pct }));
      });

      const verification = await localModelManager.verify(localPath, variant.sizeBytes);
      if (!verification.ok) {
        await localModelStore.upsert({ ...record, status: "corrupted", error: verification.reason });
        Alert.alert("Download verification failed", verification.reason);
        await loadDownloaded();
        return;
      }

      await localModelStore.upsert({ ...record, status: "downloaded", localPath, fileSizeBytes: sizeBytes, downloadedBytes: sizeBytes });
    } catch (err) {
      await localModelStore.upsert({ ...record, status: "error", error: err instanceof Error ? err.message : String(err) });
      Alert.alert("Download failed", err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading((s) => {
        const next = { ...s };
        delete next[record.id];
        return next;
      });
      await loadDownloaded();
    }
  };

  const handleDelete = async (record: LocalModelRecord) => {
    if (record.localPath) await localModelManager.delete(record.localPath);
    await localModelStore.delete(record.id);
    await loadDownloaded();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.searchBar, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          placeholder="Search Hugging Face (GGUF models)"
          placeholderTextColor={colors.textTertiary}
          style={[styles.searchInput, { color: colors.textPrimary }]}
        />
        <Pressable onPress={handleSearch} style={styles.searchButton}>
          {searching ? <ActivityIndicator color={colors.accent} /> : <Text style={{ color: colors.accent, fontWeight: "700" }}>Search</Text>}
        </Pressable>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Downloaded models</Text>
      <FlashList
        data={downloaded}
        keyExtractor={(item: LocalModelRecord) => item.id}
        estimatedItemSize={70}
        contentContainerStyle={{ paddingHorizontal: spacing.md }}
        renderItem={({ item }: { item: LocalModelRecord }) => (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>{item.displayName}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>
                {item.status} {item.fileSizeBytes ? `· ${(item.fileSizeBytes / 1e9).toFixed(2)} GB` : ""}
              </Text>
              {item.error && <Text style={{ color: colors.danger, fontSize: typography.sizes.xs }}>{item.error}</Text>}
            </View>
            <Pressable onPress={() => handleDelete(item)}>
              <Text style={{ color: colors.danger, fontSize: typography.sizes.xs, fontWeight: "600" }}>Delete</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: colors.textTertiary, padding: spacing.md }}>No local models downloaded yet.</Text>}
      />

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Search results</Text>
      <FlashList
        data={results}
        keyExtractor={(item: HuggingFaceRepoSummary) => item.id}
        estimatedItemSize={70}
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xl }}
        renderItem={({ item }: { item: HuggingFaceRepoSummary }) => (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: "column", alignItems: "stretch" }]}>
            <Pressable onPress={() => handleExpand(item.id)}>
              <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>{item.id}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>
                {item.downloads ?? 0} downloads · {item.likes ?? 0} likes
              </Text>
            </Pressable>
            {expandedRepo === item.id && (
              <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                {variants.map((v) => {
                  const progress = downloading[`${item.id}::${v.quantization}`];
                  return (
                    <View key={v.fileName} style={[styles.variantRow, { borderColor: colors.border }]}>
                      <Text style={{ color: colors.textPrimary, flex: 1, fontSize: typography.sizes.sm }}>
                        {v.quantization} {v.sizeBytes ? `(${(v.sizeBytes / 1e9).toFixed(2)} GB)` : ""}
                      </Text>
                      {progress !== undefined ? (
                        <Text style={{ color: colors.accent, fontSize: typography.sizes.xs }}>{Math.round(progress * 100)}%</Text>
                      ) : (
                        <Pressable onPress={() => handleDownload(item.id, v)}>
                          <Text style={{ color: colors.accent, fontWeight: "700", fontSize: typography.sizes.xs }}>Download</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    margin: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, height: 44, fontSize: typography.sizes.base },
  searchButton: { paddingLeft: spacing.sm },
  sectionLabel: { fontSize: typography.sizes.xs, fontWeight: "700", textTransform: "uppercase", marginHorizontal: spacing.md, marginTop: spacing.sm, marginBottom: spacing.xs },
  card: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.sm, gap: spacing.sm },
  variantRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.xs, borderTopWidth: 1 },
});
