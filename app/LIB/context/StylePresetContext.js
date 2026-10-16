"use client";

import { createContext, useContext, useMemo } from "react";
import { useDataManagement } from "../hook/useDataManagement";

const StylePresetContext = createContext(null);

const DEFAULT_STYLE_PRESET = {
  stylePreset: []
};

export function StylePresetProvider({ children }) {
  const {
    data: stylePresetData,
    setData: setStylePresetData,
    saveData: saveStylePreset,
    loading: stylePresetLoading,
    isSaving,
    error
  } = useDataManagement(
    "stylePreset",
    DEFAULT_STYLE_PRESET,
    "dockit.stylePreset.v1",
    1000
  );

  const value = useMemo(() => {
    const safeStylePresetData =
      stylePresetData && Array.isArray(stylePresetData.stylePreset)
        ? stylePresetData
        : DEFAULT_STYLE_PRESET;

    return {
      data: safeStylePresetData,
      setStylePresetData,
      saveStylePreset,
      stylePresetLoading,
      isSaving,
      error
    };
  }, [
    error,
    isSaving,
    saveStylePreset,
    setStylePresetData,
    stylePresetData,
    stylePresetLoading
  ]);

  return (
    <StylePresetContext.Provider value={value}>
      {children}
    </StylePresetContext.Provider>
  );
}

export function useStylePreset() {
  const context = useContext(StylePresetContext);

  if (!context) {
    throw new Error(
      "useStylePreset must be used within a StylePresetProvider"
    );
  }

  return context;
}
