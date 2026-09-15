import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Alert, Linking } from "react-native";
import { getSetting, setSetting } from "../../storage/settings-store";
import { searxngSearch } from "../../skills/web-search/searxng-client";
import { useTheme } from "../theme/use-theme";
import { spacing, radius, typography } from "../theme/tokens";

export function WebSearchSettingsScreen() {
  const { colors } = useTheme();
  const [url, setUrl] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void getSetting<string>("web_search.searxng_base_url").then((v) => v && setUrl(v));
  }, []);

  const handleSave = async () => {
    await setSetting("web_search.searxng_base_url", url.trim());
    Alert.alert("Saved", "SearXNG instance URL saved.");
  };

  const handleTest = async () => {
    if (!url.trim()) return;
    setTesting(true);
    try {
      await setSetting("web_search.searxng_base_url", url.trim());
      const result = await searxngSearch("test query");
      Alert.alert("Success", `Got ${result.results.length} results — this instance works.`);
    } catch (err) {
      Alert.alert("Test failed", err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.header, { color: colors.textPrimary }]}>Web Search</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Qusin AI uses SearXNG for web search. Most public SearXNG instances have JSON output disabled by default, so
        you need to point this at a self-hosted instance, or a public instance you've confirmed supports the JSON
        format.
      </Text>
      <Pressable onPress={() => Linking.openURL("https://searx.space/")}>
        <Text style={{ color: colors.accent, marginBottom: spacing.md }}>Browse instances at searx.space →</Text>
      </Pressable>

      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="https://your-searxng-instance.com"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
      />

      <View style={styles.buttonRow}>
        <Pressable onPress={handleTest} disabled={testing} style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
          <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>{testing ? "Testing…" : "Test"}</Text>
        </Pressable>
        <Pressable onPress={handleSave} style={[styles.button, { backgroundColor: colors.accent }]}>
          <Text style={{ color: "#FFF", fontWeight: "700" }}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md },
  header: { fontSize: typography.sizes.xl, fontWeight: "700", marginBottom: spacing.sm },
  body: { fontSize: typography.sizes.sm, marginBottom: spacing.sm, lineHeight: 20 },
  input: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, fontSize: typography.sizes.base, marginBottom: spacing.md },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  button: { flex: 1, padding: spacing.md, borderRadius: radius.md, alignItems: "center" },
});
