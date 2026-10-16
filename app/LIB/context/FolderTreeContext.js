"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from "react";
import { fetchDataTree } from "../utils/dataUtils";
import { useSearchParams } from "@/desktop/navigation";

const FolderTreeContext = createContext(null);

const mergeTree = (previous, incoming) => incoming.map(item => {
  const old = previous.find(node => node._id === item._id);
  if (item.content_type !== 'folders' || !old) return item;
  return item.childrenLoaded
    ? { ...item, children: mergeTree(old.children || [], item.children || []) }
    : { ...item, children: old.children || [], childrenLoaded: old.childrenLoaded || false };
});

export function FolderTreeProvider({ children }) {
  const [folderTree, setFolderTree] = useState([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const treeRef = useRef([]);
  const pending = useRef(0);
  const currentFolderId = useSearchParams().get('folder');

  const fetchFolderTree = useCallback(async (parentId = currentFolderId) => {
    pending.current += 1;
    setTreeLoading(true);
    try {
      const result = await fetchDataTree(parentId);
      if (!result) return [];

      const nextTree = mergeTree(treeRef.current, result.tree || []);
      treeRef.current = nextTree;
      setFolderTree(nextTree);
      return nextTree;
    } catch (error) {
      console.error("폴더 트리 가져오기 실패:", error);
      return treeRef.current;
    } finally {
      pending.current -= 1;
      setTreeLoading(pending.current > 0);
    }
  }, [currentFolderId]);

  const clearFolderTree = useCallback(() => {
    treeRef.current = [];
    setFolderTree([]);
  }, []);

  const value = useMemo(
    () => ({
      folderTree,
      setFolderTree,
      fetchFolderTree,
      clearFolderTree,
      treeLoading
    }),
    [folderTree, fetchFolderTree, clearFolderTree, treeLoading]
  );

  return (
    <FolderTreeContext.Provider value={value}>
      {children}
    </FolderTreeContext.Provider>
  );
}

export function useFolderTree() {
  const context = useContext(FolderTreeContext);
  if (!context) {
    throw new Error("useFolderTree must be used within a FolderTreeProvider");
  }
  return context;
}
