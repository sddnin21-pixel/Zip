import React from "react";
import { Tabs } from "expo-router";
import { Text, useColorScheme } from "react-native";
import { colors } from "../../src/ui/theme/tokens";

export default function TabsLayout() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const theme = colors[scheme];

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.textPrimary,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textTertiary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Chat", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>💬</Text> }}
      />
      <Tabs.Screen
        name="conversations"
        options={{ title: "History", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🗂️</Text> }}
      />
      <Tabs.Screen
        name="settings-tab"
        options={{ title: "Settings", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⚙️</Text> }}
      />
    </Tabs>
  );
}
