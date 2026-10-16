"use client";

import { createContext, useContext, useMemo } from "react";
import { useDataManagement } from "../hook/useDataManagement";

const MemoContext = createContext(null);

const DEFAULT_MEMO = {
  memo: "",
};

export function MemoProvider({ children }) {
  const {
    data: memo,
    setData: setMemo,
    saveData: saveMemo,
    loading: memoLoading,
    isSaving,
    error,
  } = useDataManagement("memo", DEFAULT_MEMO, "dockit.memo.v1", 2000);

  const value = useMemo(
    () => ({
      memo: memo || DEFAULT_MEMO, // null이면 기본값 사용
      setMemo,
      saveMemo,
      memoLoading,
      isSaving,
      error,
    }),
    [memo, setMemo, saveMemo, memoLoading, isSaving, error]
  );

  return <MemoContext.Provider value={value}>{children}</MemoContext.Provider>;
}

export function useDocMemo() {
  const context = useContext(MemoContext);
  if (!context) {
    throw new Error("useDocMemo must be used within a MemoProvider");
  }
  return context;
}
