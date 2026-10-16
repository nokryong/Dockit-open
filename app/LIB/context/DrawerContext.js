"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";

const DrawerContext = createContext(null);

export function DrawerProvider({ children }) {
  const [openTreeDrawer, setOpenTreeDrawer] = useState(false);
  const [openWidgetDrawer, setOpenWidgetDrawer] = useState(false);
  const [openSettingsDrawer, setOpenSettingsDrawer] = useState(false);

  // 개별 드로어 토글 함수들
  const toggleTreeDrawer = useCallback(() => {
    setOpenTreeDrawer((prev) => !prev);
  }, []);
  const toggleWidgetDrawer = useCallback(() => {
    setOpenWidgetDrawer((prev) => !prev);
  }, []);
  const toggleSettingsDrawer = useCallback(() => {
    setOpenSettingsDrawer((prev) => !prev);
  }, []);

  // 모든 드로어 닫기
  const closeAllDrawers = useCallback(() => {
    setOpenTreeDrawer(false);
    setOpenWidgetDrawer(false);
    setOpenSettingsDrawer(false);
  }, []);

  // 특정 드로어만 열기 (다른 드로어는 닫기)
  const openOnlyTreeDrawer = useCallback(() => {
    setOpenTreeDrawer(true);
    setOpenWidgetDrawer(false);
    setOpenSettingsDrawer(false);
  }, []);

  const openOnlyWidgetDrawer = useCallback(() => {
    setOpenTreeDrawer(false);
    setOpenWidgetDrawer(true);
    setOpenSettingsDrawer(false);
  }, []);

  const openOnlySettingsDrawer = useCallback(() => {
    setOpenTreeDrawer(false);
    setOpenWidgetDrawer(false);
    setOpenSettingsDrawer(true);
  }, []);

  const value = useMemo(() => ({
    openTreeDrawer, openWidgetDrawer, openSettingsDrawer,
    setOpenTreeDrawer, setOpenWidgetDrawer, setOpenSettingsDrawer,
    toggleTreeDrawer, toggleWidgetDrawer, toggleSettingsDrawer,
    closeAllDrawers, openOnlyTreeDrawer, openOnlyWidgetDrawer, openOnlySettingsDrawer,
  }), [openTreeDrawer, openWidgetDrawer, openSettingsDrawer,
    toggleTreeDrawer, toggleWidgetDrawer, toggleSettingsDrawer, closeAllDrawers,
    openOnlyTreeDrawer, openOnlyWidgetDrawer, openOnlySettingsDrawer]);

  return (
    <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>
  );
}

export function useDrawer() {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error("useDrawer must be used within a DrawerProvider");
  }
  return context;
}
