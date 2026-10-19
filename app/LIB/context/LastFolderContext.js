"use client";
import { t as uiText } from "../i18n";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const LastFolderContext = createContext(null);

const DEFAULT_LAST_FOLDER = {
  id: "home",
  get title() { return uiText("홈"); },
  path: [],
};

const normalizeLastFolder = (value) => {
  if (!value) return DEFAULT_LAST_FOLDER;
  if (typeof value === "string") {
    return value === "home"
      ? DEFAULT_LAST_FOLDER
      : { id: value, title: value, path: [{ id: value, title: value }] };
  }
  if (typeof value === "object") {
    const id = value.id || "home";
    const title = value.title || (id === "home" ? "홈" : "");
    const path = Array.isArray(value.path)
      ? value.path.filter((item) => item && item.id)
      : id === "home"
        ? []
        : [{ id, title }];
    return { id, title, path };
  }
  return DEFAULT_LAST_FOLDER;
};

export function LastFolderProvider({ children }) {
  const [lastFolder, setLastFolder] = useState(DEFAULT_LAST_FOLDER);
  const [isLastFolderReady, setIsLastFolderReady] = useState(false);

  useEffect(() => {
    const savedLastFolder = localStorage.getItem("DOCKIT_LAST_FOLDER");
    if (savedLastFolder) {
      try {
        const parsed = JSON.parse(savedLastFolder);
        setLastFolder(normalizeLastFolder(parsed));
      } catch (error) {
        setLastFolder(normalizeLastFolder(savedLastFolder));
      }
    } else {
      setLastFolder(DEFAULT_LAST_FOLDER);
    }
    setIsLastFolderReady(true);
  }, []);

  useEffect(() => {
    if (!lastFolder) return;
    localStorage.setItem("DOCKIT_LAST_FOLDER", JSON.stringify(lastFolder));
  }, [lastFolder]);

  const value = useMemo(() => ({ lastFolder, setLastFolder, isLastFolderReady }), [lastFolder, isLastFolderReady]);

  return (
    <LastFolderContext.Provider value={value}>
      {children}
    </LastFolderContext.Provider>
  );
}

export function useLastFolder() {
  const context = useContext(LastFolderContext);
  if (!context) {
    throw new Error("useLastFolder must be used within a LastFolderProvider");
  }
  return context;
}
