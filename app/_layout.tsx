import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { View, ActivityIndicator, Text, useColorScheme } from "react-native";
import { runMigrations } from "../src/storage/schema";
import { colors } from "../src/ui/theme/tokens";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const theme = colors[scheme];

  useEffect(() => {
    (async () => {
      try {
        await runMigrations();
        // Registers every skill into skillRegistry as a side effect.
        await import("../src/skills");
        setReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: theme.background }}>
        <Text style={{ color: theme.danger, fontWeight: "700", marginBottom: 8 }}>Failed to start Qusin AI</Text>
        <Text style={{ color: theme.textSecondary, textAlign: "center" }}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: theme.surface }, headerTintColor: theme.textPrimary }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings/index" options={{ title: "Settings" }} />
      <Stack.Screen name="settings/keys" options={{ title: "Keys" }} />
      <Stack.Screen name="settings/local-models" options={{ title: "Local Models" }} />
      <Stack.Screen name="settings/web-search" options={{ title: "Web Search" }} />
      <Stack.Screen name="chat/[id]" options={{ title: "Chat" }} />
    </Stack>
  );
}
