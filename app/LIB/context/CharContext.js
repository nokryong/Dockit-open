"use client";

import { createContext, useContext, useMemo } from "react";
import { useDataManagement } from "../hook/useDataManagement";

const CharContext = createContext(null);

const DEFAULT_CHAR = {
  char: [
    { key: "·", char: "·" },
    { key: "「", char: "「" },
    { key: "」", char: "」" },
    { key: "『", char: "『" },
    { key: "』", char: "』" },
    { key: "《", char: "《" },
    { key: "》", char: "》" },
    { key: "〈", char: "〈" },
    { key: "〉", char: "〉" },
    { key: "【", char: "【" },
    { key: "】", char: "】" },
    { key: "±", char: "±" },
    { key: "×", char: "×" },
    { key: "÷", char: "÷" },
    { key: "≠", char: "≠" },
    { key: "≤", char: "≤" },
    { key: "≥", char: "≥" },
    { key: "→", char: "→" },
    { key: "←", char: "←" },
    { key: "↑", char: "↑" },
    { key: "↓", char: "↓" },
  ],
};

export function CharProvider({ children }) {
  const {
    data: char,
    setData: setChar,
    saveData: saveChar,
    loading: charLoading,
    isSaving,
    error,
  } = useDataManagement("char", DEFAULT_CHAR, "dockit.char.v1", 2000);

  const value = useMemo(() => {
    // char가 없거나 char.char 배열이 없거나 비어있으면 DEFAULT_CHAR 사용
    const validChar =
      char && char.char && Array.isArray(char.char)
        ? char
        : DEFAULT_CHAR;

    return {
      char: validChar,
      setChar,
      saveChar,
      charLoading,
      isSaving,
      error,
    };
  }, [char, setChar, saveChar, charLoading, isSaving, error]);

  return <CharContext.Provider value={value}>{children}</CharContext.Provider>;
}

export function useChar() {
  const context = useContext(CharContext);
  if (!context) {
    throw new Error("useChar must be used within a CharProvider");
  }
  return context;
}
