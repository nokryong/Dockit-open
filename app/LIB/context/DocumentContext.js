"use client";
import { t as uiText } from "../i18n";

import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { fetchData, fetchDocumentContent, updateData } from "../utils/dataUtils";

import html2canvas from "html2canvas";
import { useSaveQueue } from "../hook/useSaveQueue";
import { captureNotePersistenceSnapshot, parseNotePersistenceHtml } from '../utils/notePersistenceGate';
import { commitCodexHistory, documentMetadata } from '../extensions/DocumentHistory';
import { closeHistory } from '@tiptap/pm/history';

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
  const codexLockRef = useRef(null);
  const [codexDocumentLock, setCodexDocumentLock] = useState(null);
  const [externalDocumentVersion, setExternalDocumentVersion] = useState(0);
  const guard = useCallback(setter => value => { if (!codexLockRef.current) setter(value); }, []);
  const guardedSetters = useMemo(() => ({
    setTitle: guard(setTitle), setContent: guard(setContent), setDocSetting: guard(setDocSetting),
    setBulletStyle: guard(setBulletStyle), setViewPage: guard(setViewPage), setPageNumber: guard(setPageNumber), setFocus: guard(setFocus)
  }), [guard]);


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
    currentDocumentIdRef.current = nextDocument?._id || null;
    latestStateRef.current = nextDocument;
    setDocument(nextDocument);
    setError(false);
    setTitle(nextDocument?.title || "");
    setContent(nextDocument?.content || "");
    setDocSetting(previous => JSON.stringify(previous) === JSON.stringify(nextDocument?.docSetting || null) ? previous : nextDocument?.docSetting || null);
    setBulletStyle(previous => JSON.stringify(previous) === JSON.stringify(nextDocument?.bulletStyle || null) ? previous : nextDocument?.bulletStyle || null);
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

  useEffect(() => window.dockitLocal?.onDocumentChanged(({ document: next, fields }) => {
    if (codexLockRef.current || next._id !== currentDocumentIdRef.current) return;
    documentCacheRef.current.set(next._id, next);
    const updates = Object.fromEntries(fields.map(key => [key, next[key]]));
    applyDocumentState({ ...next, ...latestStateRef.current, ...updates, revision: next.revision, parent_id: next.parent_id });
  }), [applyDocumentState]);

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
          throw new Error(uiText("문서 저장 응답에 revision이 없습니다."));
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
    save: queueSaveDocument
  } = useSaveQueue(handleSaveProcess);

  const saveDocument = useCallback((id, ...args) => {
    if (codexLockRef.current) return Promise.resolve(false);
    return queueSaveDocument(id, ...args);
  }, [queueSaveDocument]);

  const applyCodexDocument = useCallback(nextDocument => {
    if (!nextDocument?._id || nextDocument._id !== codexLockRef.current?.id) return;
    codexLockRef.current.lastDocument = nextDocument;
    documentCacheRef.current.set(nextDocument._id, nextDocument);
    if (currentDocumentIdRef.current === nextDocument._id) {
      applyDocumentState(nextDocument);
      lastSaveConflictRef.current = null;
      setLastSaveConflict(null);
      setExternalDocumentVersion(version => version + 1);
    }
  }, [applyDocumentState]);

  const finishCodexDocument = useCallback(() => {
    const lock = codexLockRef.current;
    const activeEditor = lock?.editor;
    if (activeEditor && !activeEditor.isDestroyed && lock.before && lock.lastDocument) {
      const after = parseNotePersistenceHtml(activeEditor, lock.lastDocument.content);
      const before = { ...lock.before, doc: activeEditor.schema.nodeFromJSON(lock.before.doc.toJSON()) };
      if (after.ok) commitCodexHistory(activeEditor, before, after.document, documentMetadata(lock.lastDocument), lock.lastDocument.content);
    }
    if (activeEditor?.storage?.codexDocumentLock) activeEditor.storage.codexDocumentLock.locked = false;
    codexLockRef.current = null;
    setCodexDocumentLock(null);
  }, []);

  const attachDocumentEditor = useCallback(editor => {
    const id = currentDocumentIdRef.current;
    if (!editor?.storage?.codexDocumentLock || !id) return;
    if (codexLockRef.current?.id === id) codexLockRef.current.editor = editor;
    editor.storage.codexDocumentLock.restoreMetadata = metadata => {
      if (currentDocumentIdRef.current !== id) return;
      const html = editor.getHTML();
      setTitle(metadata.title); setDocSetting(metadata.docSetting); setBulletStyle(metadata.bulletStyle);
      setViewPage(metadata.viewPage); setPageNumber(metadata.pageNumber); setContent(html);
      latestStateRef.current = { ...latestStateRef.current, ...metadata, content: html };
    };
  }, []);

  const restoreCodexDocumentLock = useCallback(id => {
    if (!id || codexLockRef.current) return;
    codexLockRef.current = { id };
    setCodexDocumentLock({ id });
  }, []);

  const prepareCodexDocument = useCallback(async editor => {
    if (codexLockRef.current) throw new Error(uiText("Codex가 문서를 작업 중입니다."));
    const id = currentDocumentIdRef.current;
    if (!id) return null;
    if (!editor || editor.isDestroyed || !editor.storage.codexDocumentLock) throw new Error(uiText("문서 편집기가 준비된 뒤 다시 보내주세요."));
    editor.view.dispatch(closeHistory(editor.state.tr));
    const lock = { id, editor, before: { doc: editor.state.doc, anchor: editor.state.selection.anchor, metadata: structuredClone(documentMetadata(latestStateRef.current)) } };
    attachDocumentEditor(editor);
    codexLockRef.current = lock;
    setCodexDocumentLock({ id });
    editor.storage.codexDocumentLock.locked = true;
    editor.setEditable(false, false);
    try {
      const snapshot = captureNotePersistenceSnapshot(editor);
      if (!snapshot.ok) throw new Error(uiText("문서를 저장할 수 없습니다. 문서 형식을 확인해주세요."));
      latestStateRef.current = { ...latestStateRef.current, content: snapshot.html };
      setContent(snapshot.html);
      // The final immediate entry drains earlier title/settings/autosave entries.
      const saved = await queueSaveDocument(id, { ...latestStateRef.current, content: snapshot.html, focus: editor.state.selection.anchor }, true);
      if (!saved) throw new Error(uiText("문서를 저장하지 못해 Codex 작업을 시작하지 않았습니다."));
      await window.dockitLocal?.flush();
      return { id, revision: documentCacheRef.current.get(id)?.revision };
    } catch (error) { finishCodexDocument(); throw error; }
  }, [queueSaveDocument, finishCodexDocument, attachDocumentEditor]);

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
      ...guardedSetters,
      codexDocumentLock,
      externalDocumentVersion,
      prepareCodexDocument,
      applyCodexDocument,
      finishCodexDocument,
      restoreCodexDocumentLock,
      attachDocumentEditor,
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
      guardedSetters,
      codexDocumentLock,
      externalDocumentVersion,
      prepareCodexDocument,
      applyCodexDocument,
      finishCodexDocument,
      restoreCodexDocumentLock,
      attachDocumentEditor,
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
