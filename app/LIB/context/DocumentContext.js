"use client";

import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { fetchData, fetchDocumentContent, updateData } from "../utils/dataUtils";

import html2canvas from "html2canvas";
import { useSaveQueue } from "../hook/useSaveQueue";

const DocumentContext = createContext(null);
const PX_PER_MM = 96 / 25.4;
const THUMBNAIL_CAPTURE_CLASS = "dockit-thumbnail-capture-mode";
const DEFAULT_DOCUMENT_SETTINGS = {
  pageWidth: 210,
  pageHeight: 297,
  paddingTop: 25,
  paddingBottom: 25,
  paddingLeft: 25,
  paddingRight: 25,
  lineHeight: 1.5
};

export function DocumentProvider({ children }) {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [lastSaveConflict, setLastSaveConflict] = useState(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [docSetting, setDocSetting] = useState(null);
  const [bulletStyle, setBulletStyle] = useState(null);
  const [thumbnail, setThumbnail] = useState("");
  const [focus, setFocus] = useState(null);
  const [viewPage, setViewPage] = useState(false);
  const [pageNumber, setPageNumber] = useState("none");
  const latestStateRef = useRef();
  const documentCacheRef = useRef(new Map());
  const latestLoadRequestRef = useRef(0);
  const currentDocumentIdRef = useRef(null);
  const lastSaveConflictRef = useRef(null);


  useEffect(() => {
    latestStateRef.current = {
      title,
      content,
      docSetting,
      bulletStyle,
      revision: document?.revision ?? null,
      thumbnail,
      sourceFileName: document?.sourceFileName,
      focus,
      viewPage,
      pageNumber,
    };
  }, [
    title,
    content,
    docSetting,
    bulletStyle,
    document?.revision,
    thumbnail,
    document?.sourceFileName,
    viewPage,
    pageNumber,
    focus,
  ]);

  useEffect(() => {
    currentDocumentIdRef.current = document?._id || null;
  }, [document?._id]);

  const generateThumbnail = useCallback(async () => {
    window.document.body.classList.add(THUMBNAIL_CAPTURE_CLASS);

    try {
      const pagesElement = window.document.getElementById("pages");
      const targetElement =
        pagesElement?.querySelector(".tiptap-main-canvas") || pagesElement;

      if (!targetElement) {
        console.warn("문서 캔버스 요소를 찾을 수 없습니다");
        return null;
      }

      const snapshotSetting =
        latestStateRef.current?.docSetting || DEFAULT_DOCUMENT_SETTINGS;
      const pageHeight = Math.round(
        (Number(snapshotSetting.pageHeight) ||
          DEFAULT_DOCUMENT_SETTINGS.pageHeight) * PX_PER_MM
      );
      const fallbackPageWidth = Math.round(
        (Number(snapshotSetting.pageWidth) ||
          DEFAULT_DOCUMENT_SETTINGS.pageWidth) * PX_PER_MM
      );
      const targetRect = targetElement.getBoundingClientRect();
      const captureWidth = Math.max(
        1,
        Math.round(
          targetElement.scrollWidth || targetRect.width || fallbackPageWidth
        )
      );
      const captureHeight = Math.max(1, pageHeight);

      const canvas = await html2canvas(targetElement, {
        width: captureWidth,
        height: captureHeight,
        windowWidth: Math.max(captureWidth, window.innerWidth),
        windowHeight: captureHeight,
        scrollX: 0,
        scrollY: -window.scrollY,
        useCORS: true,
        scale: 1,
        backgroundColor: "#ffffff",
        ignoreElements: (element) =>
          element.classList?.contains("dockit-ruler-horizontal-layer") ||
          element.classList?.contains("dockit-ruler-vertical-layer") ||
          element.classList?.contains("tiptap-page-shell-layer") ||
          element.classList?.contains("ProseMirror-separator")
      });

      const base64Image = canvas.toDataURL("image/png");
      const data = {
        thumbnail: base64Image // "data:image/png;base64,..." 형태
      };

      return data.thumbnail;
    } catch (error) {
      console.error("썸네일 생성 오류:", error);
      return null;
    } finally {
      window.document.body.classList.remove(THUMBNAIL_CAPTURE_CLASS);
    }
  }, []);

  const resetDocumentState = useCallback((nextError = false) => {
    lastSaveConflictRef.current = null;
    setLastSaveConflict(null);
    setDocument(null);
    setLoading(false);
    setError(nextError);
    setTitle("");
    setContent("");
    setDocSetting(null);
    setBulletStyle(null);
    setThumbnail(null);
    setFocus(null);

    setViewPage(false);
    setPageNumber("none");


  }, []);

  const applyDocumentState = useCallback((nextDocument) => {
    setDocument(nextDocument);
    setError(false);
    setTitle(nextDocument?.title || "");
    setContent(nextDocument?.content || "");
    setDocSetting(nextDocument?.docSetting || null);
    setBulletStyle(nextDocument?.bulletStyle || null);
    setThumbnail(nextDocument?.thumbnail || null);

    setViewPage(nextDocument?.viewPage ?? true);
    setPageNumber(nextDocument?.pageNumber || "none");
    setFocus(nextDocument?.focus || null);


  }, []);

  const resolveLocalDocument = useCallback(async (id) => {
    const data = await fetchData("documents", id);
    if (data.content === undefined || data.content === null) {
      return null;
    }

    const {
      content: _inlineContent,
      contentURL: _legacyContentURL,
      contentStoragePath: _contentStoragePath,
      ...documentMetadata
    } = data.content;
    void _inlineContent;
    void _legacyContentURL;
    void _contentStoragePath;
    let fetchedDoc = documentMetadata;

    if (!fetchedDoc?.docSetting) {
      fetchedDoc = { ...fetchedDoc, docSetting: DEFAULT_DOCUMENT_SETTINGS };
    }

    fetchedDoc = {
      ...fetchedDoc,
      content: await fetchDocumentContent(id)
    };

    return fetchedDoc;
  }, []);

  const loadDocument = useCallback(async (id) => {
    if (!id) return;

    const requestId = latestLoadRequestRef.current + 1;
    latestLoadRequestRef.current = requestId;

    setLoading(true);

    try {
      const resolvedDocument = await resolveLocalDocument(id);

      if (requestId !== latestLoadRequestRef.current) {
        return;
      }

      if (!resolvedDocument) {
        resetDocumentState(true);
        return;
      }

      documentCacheRef.current.set(id, resolvedDocument);
      applyDocumentState(resolvedDocument);
    } catch (error) {
      console.error("문서 로드 실패:", error);
      if (requestId === latestLoadRequestRef.current) {
        resetDocumentState(true);
      }
    } finally {
      if (requestId === latestLoadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [applyDocumentState, resetDocumentState, resolveLocalDocument]);

  // 저장 큐 처리 콜백
  const handleSaveProcess = useCallback(
    async (id, mergedPayload) => {
      const latestState = latestStateRef.current || {};
      const cachedDocument = documentCacheRef.current.get(id) || {};
      const dataToSave = {
        ...latestState,
        ...mergedPayload
      };
      const shouldPersistContent = Object.prototype.hasOwnProperty.call(
        mergedPayload,
        "content"
      );
      const shouldRefreshThumbnail =
        shouldPersistContent && mergedPayload.refreshThumbnail === true;
      const dataForDB = {
        title: dataToSave.title,
        docSetting: dataToSave.docSetting,
        bulletStyle: dataToSave.bulletStyle,
        viewPage: dataToSave.viewPage,
        pageNumber: dataToSave.pageNumber,
        sourceFileName: dataToSave.sourceFileName,
        focus: dataToSave.focus,
        expectedRevision:
          cachedDocument.revision ?? latestState.revision ?? null
      };

      if (shouldPersistContent) {
        dataForDB.content = dataToSave.content ?? "";

        // Manual and autosaves are both immediate queue entries. Keep the
        // expensive screenshot capture explicit so manual saves refresh the
        // preview without running html2canvas on every debounced autosave.
        if (shouldRefreshThumbnail) {
          const thumbnailBase64 = await generateThumbnail();
          if (thumbnailBase64) {
            dataForDB.thumbnail = thumbnailBase64;
          }
        }
      }

      if (Object.keys(dataForDB).length > 0) {
        let response;
        try {
          response = await updateData("documents", id, dataForDB);
        } catch (saveError) {
          if (
            saveError?.code === "RevisionConflict" &&
            typeof saveError?.detail?.currentRevision === "string"
          ) {
            const conflict = {
              documentId: id,
              expectedRevision: dataForDB.expectedRevision ?? null,
              currentRevision: saveError.detail.currentRevision,
              occurredAt: Date.now()
            };
            lastSaveConflictRef.current = conflict;
            setLastSaveConflict(conflict);
            if (typeof dataToSave.onRevisionConflict === "function") {
              try {
                dataToSave.onRevisionConflict(conflict, {
                  content:
                    shouldPersistContent && typeof dataForDB.content === "string"
                      ? dataForDB.content
                      : null
                });
              } catch (callbackError) {
                console.error("Revision conflict callback failed:", callbackError);
              }
            }
          }
          throw saveError;
        }
        if (lastSaveConflictRef.current?.documentId === id) {
          lastSaveConflictRef.current = null;
        }
        setLastSaveConflict((previous) =>
          previous?.documentId === id ? null : previous
        );
        const savedDocument = response?.content;
        if (
          !savedDocument ||
          typeof savedDocument.revision !== "string" ||
          !savedDocument.revision
        ) {
          throw new Error("문서 저장 응답에 revision이 없습니다.");
        }

        const nextDocument = {
          ...cachedDocument,
          ...savedDocument,
          title: dataToSave.title,
          content: shouldPersistContent
            ? (dataToSave.content ?? "")
            : (cachedDocument.content ?? ""),
          docSetting: dataToSave.docSetting,
          bulletStyle: dataToSave.bulletStyle,
          focus: dataToSave.focus,
          viewPage: dataToSave.viewPage,
          pageNumber: dataToSave.pageNumber,
          sourceFileName:
            dataToSave.sourceFileName ?? cachedDocument.sourceFileName,
          _id: cachedDocument._id || id
        };

        documentCacheRef.current.set(id, nextDocument);
        latestStateRef.current = {
          ...latestStateRef.current,
          revision: savedDocument.revision
        };

        if (currentDocumentIdRef.current === id) {
          setDocument((prev) => {
            if (!prev || prev._id !== id) return prev;
            return { ...prev, ...nextDocument };
          });

          if (Object.prototype.hasOwnProperty.call(dataForDB, "thumbnail")) {
            setThumbnail(dataForDB.thumbnail || null);
          }
        }
      }
      return true;
    },
    [generateThumbnail]
  );

  const {
    isSaving,
    hasQueuedSave,
    lastSaveResult,
    save: saveDocument
  } = useSaveQueue(handleSaveProcess);

  const getLastSaveConflict = useCallback((documentId) => {
    const conflict = lastSaveConflictRef.current;
    return conflict?.documentId === documentId ? conflict : null;
  }, []);

  const getDocumentRevision = useCallback((documentId) => {
    if (!documentId) return null;
    if (currentDocumentIdRef.current === documentId) {
      return latestStateRef.current?.revision ?? null;
    }
    return documentCacheRef.current.get(documentId)?.revision ?? null;
  }, []);

  const clearDocument = useCallback(() => {
    latestLoadRequestRef.current += 1;
    resetDocumentState(false);
  }, [resetDocumentState]);

  useEffect(() => {
    if (!document?._id) return;

    documentCacheRef.current.set(document._id, {
      ...(documentCacheRef.current.get(document._id) || {}),
      ...document,
      title,
      content,
      docSetting,
      bulletStyle,
      thumbnail,
      focus,
      viewPage,
      pageNumber,
    });
  }, [
    document,
    title,
    content,
    docSetting,
    bulletStyle,
    thumbnail,
    focus,
    viewPage,
    pageNumber,
  ]);

  const value = useMemo(
    () => ({
      document,
      setDocument,
      loading,
      error,
      setError,
      isSaving,
      hasQueuedSave,
      lastSaveResult,
      lastSaveConflict,
      getLastSaveConflict,
      getDocumentRevision,
      title,
      setTitle,
      content,
      setContent,
      docSetting,
      setDocSetting,
      bulletStyle,
      setBulletStyle,
      thumbnail,
      setThumbnail,
      loadDocument,
      clearDocument,
      saveDocument,
      viewPage,
      setViewPage,
      pageNumber,
      setPageNumber,
      focus,
      setFocus,
    }),
    [
      document,
      loading,
      error,
      isSaving,
      hasQueuedSave,
      lastSaveResult,
      lastSaveConflict,
      getLastSaveConflict,
      getDocumentRevision,
      title,
      content,
      docSetting,
      bulletStyle,
      thumbnail,
      loadDocument,
      clearDocument,
      saveDocument,
      viewPage,
      pageNumber,
      focus,
    ]
  );
  // 주석
  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
}

export function useDocument() {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error("useDocument must be used within a DocumentProvider");
  }
  return context;
}
