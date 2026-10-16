"use client";
import { createContext, useContext, useEffect, useCallback, useMemo } from "react";
import { defaultTheme } from "sud-ui";
import { darkTheme } from "../config/darkTheme";
import { useSetting } from "./SettingContext";
const DarkModeContext = createContext(null);
export function DarkModeProvider({ children }) {
  const { setting, setSetting } = useSetting();
  const isDarkMode = setting.isDarkMode === true;
  const setIsDarkMode = useCallback(value => setSetting({ isDarkMode: Boolean(value) }), [setSetting]);
  useEffect(() => { window.document.documentElement.classList.toggle("dark", isDarkMode); }, [isDarkMode]);
  const currentTheme = isDarkMode ? darkTheme : defaultTheme;
  const value = useMemo(() => ({ isDarkMode, setIsDarkMode, currentTheme, currentColors: currentTheme.colors }), [isDarkMode, setIsDarkMode, currentTheme]);
  return <DarkModeContext.Provider value={value}>{children}</DarkModeContext.Provider>;
}
export const useDarkMode = () => useContext(DarkModeContext);
