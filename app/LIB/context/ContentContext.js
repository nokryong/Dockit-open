"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { fetchDataList } from "../utils/dataUtils";

const ContentContext = createContext(null);


export function ContentProvider({ children }) {
  // Workspace 콘텐츠 상태
  const [workspaceContent, setWorkspaceContent] = useState([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState(null);

  // Workspace 콘텐츠 가져오기
  const fetchWorkspaceContent = useCallback(
    async (
      folderId = null,
      title = null,
      sortBy = "updated_at",
      sortOrder = -1
    ) => {
      setWorkspaceLoading(true);
      try {
        const docs = await fetchDataList(
          "documents",
          folderId,
          title,
          1,
          10,
          sortBy,
          sortOrder
        );
        const folders = await fetchDataList(
          "folders",
          folderId,
          title,
          1,
          10,
          sortBy,
          sortOrder
        );
        setWorkspaceContent([folders.content, docs.content]);
        setCurrentFolderId(folderId);
      } catch (error) {
        console.error("Workspace 데이터 가져오기 실패:", error);
        setWorkspaceContent([]);
      } finally {
        setWorkspaceLoading(false);
      }
    },
    []
  );

  // Workspace 콘텐츠 초기화
  const clearWorkspaceContent = useCallback(() => {
    setWorkspaceContent([]);
    setCurrentFolderId(null);
  }, []);

  const value = useMemo(() => ({
    workspaceContent, setWorkspaceContent, workspaceLoading,
    currentFolderId, setCurrentFolderId, fetchWorkspaceContent, clearWorkspaceContent
  }), [workspaceContent, workspaceLoading, currentFolderId, fetchWorkspaceContent,
    clearWorkspaceContent]);

  return (
    <ContentContext.Provider value={value}>
      {children}
    </ContentContext.Provider>
  );
}

export function useContent() {
  const context = useContext(ContentContext);
  if (!context) {
    throw new Error("useContent must be used within a ContentProvider");
  }
  return context;
}
