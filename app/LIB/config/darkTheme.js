import { darkTheme as defaultDarkTheme } from "sud-ui";

export const darkTheme = {
  ...defaultDarkTheme,
  colors: {
    ...defaultDarkTheme.colors,
    white: {
      ...defaultDarkTheme.colors.white,
      2: "#ffffff",
      3: "#f5f5f5",
      4: "#e0e0e0",
      5: "#c2c2c2",
      6: "#a3a3a3",
      7: "#858585",
      8: "#666666",
      9: "#4d4d4d",
      10: "#2e2e2e"
    },
    black: {
      ...defaultDarkTheme.colors.black,
      2: "#000000",
      3: "#1a1a1a",
      4: "#333333",
      5: "#4d4d4d",
      6: "#666666",
      7: "#858585",
      8: "#a3a3a3",
      9: "#c2c2c2",
      10: "#e0e0e0"
    },
    neutral: {
      ...defaultDarkTheme.colors.neutral,
      2: "#000000",
      3: "#222222",
      4: "#444444",
      5: "#555555",
      6: "#666666",
      7: "#777777",
      8: "#888888",
      9: "#999999",
      10: "#aaaaaa"
    }
  }
};
