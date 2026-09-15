import { useColorScheme } from "react-native";
import { colors, type ColorScheme } from "./tokens";

export function useTheme() {
  const systemScheme = useColorScheme();
  const scheme: ColorScheme = systemScheme === "dark" ? "dark" : "light";
  return { colors: colors[scheme], scheme };
}
