import React from "react";
import { useRouter } from "expo-router";
import { SettingsScreen } from "../../src/ui/screens/SettingsScreen";

const ROUTES: Record<string, string> = {
  keys: "/settings/keys",
  "local-models": "/settings/local-models",
  "web-search": "/settings/web-search",
};

export default function SettingsTab() {
  const router = useRouter();
  return (
    <SettingsScreen
      onSelectSection={(id) => {
        const route = ROUTES[id];
        if (route) router.push(route as never);
        // Sections without a dedicated screen yet fall through silently —
        // brief section 79 distinguishes IMPLEMENTED from PARTIALLY
        // IMPLEMENTED; those are documented in docs/ARCHITECTURE.md rather
        // than faking a screen for them here.
      }}
    />
  );
}
