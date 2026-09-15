import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Switch, Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { keyManager, type ApiKeyRecord } from "../../core/keys/key-manager";
import { getProvider } from "../../providers/registry";
import type { ProviderId } from "../../core/models/types";
import { useTheme } from "../theme/use-theme";
import { spacing, radius, typography, providerAccent } from "../theme/tokens";

const PROVIDERS: ProviderId[] = ["xkiro", "kiraai", "openrouter"]; // local has no key concept

export function KeyManagerScreen() {
  const { colors } = useTheme();
  const [activeProvider, setActiveProvider] = useState<ProviderId>("xkiro");
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeySecret, setNewKeySecret] = useState("");
  const [testing, setTesting] = useState<string | null>(null);

  const load = useCallback(async () => setKeys(await keyManager.listKeys(activeProvider)), [activeProvider]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async () => {
    if (!newKeyName.trim() || !newKeySecret.trim()) return;
    await keyManager.addKey(activeProvider, newKeyName.trim(), newKeySecret.trim());
    setNewKeyName("");
    setNewKeySecret("");
    await load();
  };

  const handleTest = async (key: ApiKeyRecord) => {
    setTesting(key.id);
    try {
      const secret = await keyManager.revealSecret(key.id);
      if (!secret) throw new Error("Could not read stored secret.");
      const result = await getProvider(activeProvider).validateCredentials(secret);
      if (result.valid) {
        await keyManager.markSuccess(key.id);
        Alert.alert("Key is valid", `${key.name} authenticated successfully.`);
      } else {
        await keyManager.markInvalid(key.id);
        Alert.alert("Key test failed", result.error?.message ?? "Unknown error.");
      }
    } catch (err) {
      Alert.alert("Key test failed", err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(null);
      await load();
    }
  };

  const handleDelete = (key: ApiKeyRecord) => {
    Alert.alert("Delete key", `Remove "${key.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await keyManager.deleteKey(key.id);
          await load();
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.tabs}>
        {PROVIDERS.map((p) => (
          <Pressable
            key={p}
            onPress={() => setActiveProvider(p)}
            style={[
              styles.tab,
              { borderColor: p === activeProvider ? providerAccent[p] : colors.border, backgroundColor: p === activeProvider ? colors.accentSoft : "transparent" },
            ]}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: typography.sizes.sm }}>
              {p.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlashList
        data={keys}
        keyExtractor={(item: ApiKeyRecord) => item.id}
        estimatedItemSize={80}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }: { item: ApiKeyRecord }) => (
          <View style={[styles.keyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>{item.name}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>{item.maskedPreview}</Text>
              <Text style={{ color: statusColor(item.status, colors), fontSize: typography.sizes.xs, marginTop: 2 }}>
                {item.status}
                {item.cooldownUntil && item.cooldownUntil > Date.now()
                  ? ` (cooldown until ${new Date(item.cooldownUntil).toLocaleTimeString()})`
                  : ""}
              </Text>
            </View>
            <Switch
              value={item.enabled}
              onValueChange={(v) => keyManager.setEnabled(item.id, v).then(load)}
            />
            <Pressable onPress={() => handleTest(item)} style={styles.smallButton} disabled={testing === item.id}>
              <Text style={{ color: colors.accent, fontSize: typography.sizes.xs, fontWeight: "600" }}>
                {testing === item.id ? "Testing…" : "Test"}
              </Text>
            </Pressable>
            <Pressable onPress={() => handleDelete(item)} style={styles.smallButton}>
              <Text style={{ color: colors.danger, fontSize: typography.sizes.xs, fontWeight: "600" }}>Delete</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl }}>
            No keys added for {activeProvider.toUpperCase()} yet.
          </Text>
        }
      />

      <View style={[styles.addForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          placeholder="Key name (e.g. Primary)"
          placeholderTextColor={colors.textTertiary}
          value={newKeyName}
          onChangeText={setNewKeyName}
          style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
        />
        <TextInput
          placeholder="API key"
          placeholderTextColor={colors.textTertiary}
          value={newKeySecret}
          onChangeText={setNewKeySecret}
          secureTextEntry
          style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
        />
        <Pressable onPress={handleAdd} style={[styles.addButton, { backgroundColor: colors.accent }]}>
          <Text style={{ color: "#FFF", fontWeight: "700" }}>Add Key</Text>
        </Pressable>
      </View>
    </View>
  );
}

function statusColor(status: ApiKeyRecord["status"], colors: ReturnType<typeof useTheme>["colors"]): string {
  switch (status) {
    case "valid":
      return colors.success;
    case "invalid":
      return colors.danger;
    case "rate_limited":
      return colors.warning;
    default:
      return colors.textTertiary;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1 },
  keyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  smallButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  addForm: { padding: spacing.md, borderTopWidth: 1, gap: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, fontSize: typography.sizes.base },
  addButton: { padding: spacing.md, borderRadius: radius.md, alignItems: "center" },
});
