/**
 * Design tokens for a clean, premium AI workspace look (brief section 32:
 * "Avoid generic AI-looking excessive gradients. Prefer clean, premium,
 * responsive, fast, readable, accessible, light/dark mode, compact but
 * spacious, clear model/provider indicators.")
 */

export const colors = {
  light: {
    background: "#FAFAFA",
    surface: "#FFFFFF",
    surfaceRaised: "#FFFFFF",
    border: "#E5E5E8",
    textPrimary: "#16161A",
    textSecondary: "#6B6B72",
    textTertiary: "#9B9BA3",
    accent: "#4F46E5",
    accentSoft: "#EEF0FF",
    success: "#16A34A",
    warning: "#D97706",
    danger: "#DC2626",
    dangerSoft: "#FEF2F2",
    bubbleUser: "#4F46E5",
    bubbleUserText: "#FFFFFF",
    bubbleAssistant: "#F2F2F5",
    bubbleAssistantText: "#16161A",
  },
  dark: {
    background: "#0B0B0F",
    surface: "#151519",
    surfaceRaised: "#1C1C22",
    border: "#2A2A32",
    textPrimary: "#F2F2F5",
    textSecondary: "#A5A5AE",
    textTertiary: "#6E6E78",
    accent: "#818CF8",
    accentSoft: "#1E1E3A",
    success: "#4ADE80",
    warning: "#FBBF24",
    danger: "#F87171",
    dangerSoft: "#2A1518",
    bubbleUser: "#4F46E5",
    bubbleUserText: "#FFFFFF",
    bubbleAssistant: "#1C1C22",
    bubbleAssistantText: "#F2F2F5",
  },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const typography = {
  fontFamily: undefined, // system default per-platform for best native feel
  sizes: { xs: 12, sm: 14, base: 16, lg: 18, xl: 22, xxl: 28 },
  weights: { regular: "400", medium: "500", semibold: "600", bold: "700" },
} as const;

export const providerAccent: Record<string, string> = {
  xkiro: "#8B5CF6",
  kiraai: "#EC4899",
  openrouter: "#3B82F6",
  local: "#10B981",
};

export type ColorScheme = "light" | "dark";
