"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Typography, toast, Div } from "sud-ui";
import { HiDocumentSearch } from "react-icons/hi";
import { TbRefresh } from "react-icons/tb";
import WidgetCard from "./WidgetCard";
import { useFolderTree } from "../../context/FolderTreeContext";
import { useDocument } from "../../context/DocumentContext";
import { useDarkMode } from "../../context/DarkModeContext";
import { useSetting } from "../../context/SettingContext";
import ReferenceDocList from "./referenceDoc/ReferenceDocList";
import ReferencePreviewSurface from "./referenceDoc/ReferencePreviewSurface";
import {
  filterReferenceDocuments,
  flattenReferenceDocuments,
  formatReferenceDocumentLabel,
  getReferencePreviewEmptyText,
  normalizeReferencePreviewDocument
} from "./referenceDoc/referenceDocUtils";
import LoadingComponent from "./commonComponent/LoadingComponent";

export default function ReferenceDoc({ dragHandleProps }) {
  const { document: activeDocument } = useDocument();
  const { folderTree, fetchFolderTree, treeLoading } = useFolderTree();
  const { setting } = useSetting();
  const { currentColors } = useDarkMode();
  const themeColors = currentColors[setting.theme];

  const [searchTerm, setSearchTerm] = useState("");
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const previewCacheRef = useRef(new Map());
  const latestRequestRef = useRef(0);

  useEffect(() => {
    if (folderTree.length > 0) {
      return;
    }

    fetchFolderTree();
  }, [fetchFolderTree, folderTree.length]);

  const documents = useMemo(() => {
    return flattenReferenceDocuments(folderTree).filter(
      (item) => item._id !== activeDocument?._id
    );
  }, [activeDocument?._id, folderTree]);

  const filteredDocuments = useMemo(() => {
    return filterReferenceDocuments(documents, searchTerm);
  }, [documents, searchTerm]);

  useEffect(() => {
    if (documents.length === 0) {
      setSelectedDocId(null);
      setPreviewDocument(null);
      return;
    }

    setSelectedDocId((previousId) => {
      if (previousId && documents.some((item) => item._id === previousId)) {
        return previousId;
      }

      setPreviewDocument(null);
      return null;
    });
  }, [documents]);

  const loadPreviewDocument = useCallback(
    async (docId, forceRefresh = false) => {
      if (!docId) {
        setPreviewDocument(null);
        return;
      }

      if (!forceRefresh && previewCacheRef.current.has(docId)) {
        setPreviewDocument(previewCacheRef.current.get(docId));
        return;
      }

      const requestId = latestRequestRef.current + 1;
      latestRequestRef.current = requestId;
      setPreviewLoading(true);

      try {
        const resolvedDocument = await normalizeReferencePreviewDocument(docId);

        if (requestId !== latestRequestRef.current) {
          return;
        }

        previewCacheRef.current.set(docId, resolvedDocument);
        setPreviewDocument(resolvedDocument);
      } catch (error) {
        console.error("참고 문서 로드 실패:", error);
        if (requestId === latestRequestRef.current) {
          setPreviewDocument(null);
          toast.danger("참고 문서를 불러오지 못했습니다.");
        }
      } finally {
        if (requestId === latestRequestRef.current) {
          setPreviewLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    loadPreviewDocument(selectedDocId);
  }, [loadPreviewDocument, selectedDocId]);

  const handleRefresh = useCallback(async () => {
    previewCacheRef.current.clear();
    await fetchFolderTree();

    if (selectedDocId) {
      await loadPreviewDocument(selectedDocId, true);
    }
  }, [fetchFolderTree, loadPreviewDocument, selectedDocId]);

  const handleSelectDocument = useCallback((docId) => {
    setSelectedDocId(docId);
    setIsListCollapsed(true);
  }, []);

  const selectedDocumentMeta = useMemo(() => {
    return documents.find((item) => item._id === selectedDocId) || null;
  }, [documents, selectedDocId]);
  const previewEmptyText = getReferencePreviewEmptyText({
    documentCount: documents.length,
    searchTerm,
    selectedDocId
  });

  return (
    <WidgetCard
      icon={HiDocumentSearch}
      title="내 문서"
      dragHandleProps={dragHandleProps}
      widgetType="referenceDoc"
      titleBtn={
        <Button
          icon={<TbRefresh size={14} />}
          shadow="none"
          border={false}
          onClick={handleRefresh}
          disabled={treeLoading || previewLoading}
        />
      }
    >
      <div className="w-full flex flex-col gap-2">
        <ReferenceDocList
          documents={documents}
          filteredDocuments={filteredDocuments}
          isListCollapsed={isListCollapsed}
          onToggleCollapsed={() => setIsListCollapsed((prev) => !prev)}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          selectedDocId={selectedDocId}
          onSelectDocument={handleSelectDocument}
          setting={setting}
          themeColors={themeColors}
          treeLoading={treeLoading}
        />

        <Div
          className="rounded-xl flex flex-col gap-2"
          background="white-9"
          style={{
            padding: "10px"
          }}
        >
          <div className="flex flex-col gap-0.5">
            <Typography pretendard="SB" size="sm" color="white-1">
              {selectedDocumentMeta
                ? formatReferenceDocumentLabel(selectedDocumentMeta)
                : "문서를 선택하세요"}
            </Typography>
            {selectedDocumentMeta?.pathLabel && (
              <Typography size="xs" color="cool-gray-7">
                {selectedDocumentMeta.pathLabel}
              </Typography>
            )}
          </div>

          {previewLoading ? (
            <div
              className="flex justify-center items-center"
              style={{ minHeight: "220px" }}
            >
              <LoadingComponent />
            </div>
          ) : previewDocument ? (
            <ReferencePreviewSurface previewDocument={previewDocument} />
          ) : (
            <div
              className="flex items-center justify-center"
              style={{ minHeight: "180px" }}
            >
              <Typography size="sm" color="cool-gray-7">
                {previewEmptyText}
              </Typography>
            </div>
          )}
        </Div>
      </div>
    </WidgetCard>
  );
}
