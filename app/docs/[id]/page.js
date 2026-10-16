"use client";

import { useDocument } from "@/app/LIB/context/DocumentContext";
import { useUser } from "@/app/LIB/context/UserContext";
import { useSetting } from "@/app/LIB/context/SettingContext";
import { useCodex } from '@/app/LIB/context/CodexContext';
import { useCallback, useEffect, useLayoutEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Div, Button, Typography, toast } from "sud-ui";
import ContentEditor from "@/app/LIB/components/write/ContentEditor";
import { ToolbarSurface } from "@/app/LIB/components/common/toolbar/ToolbarPrimitives";
import HwpxWarningDetailModal, {
  HwpxWarningDetailTrigger
} from "@/app/LIB/components/docs/HwpxWarningDetailModal";
import DocxWarningDetailModal, {
  DocxWarningDetailTrigger
} from "@/app/LIB/components/docs/DocxWarningDetailModal";
import HwpxImportPreviewModal from "@/app/LIB/components/docs/HwpxImportPreviewModal";
import ConversionReadinessCard from "@/app/LIB/components/docs/ConversionReadinessCard";
import PdfOutputPreflightModal from "@/app/LIB/components/docs/PdfOutputPreflightModal";
import { useEditor } from "@/app/LIB/context/EditorContext";

import { useLayout } from "@/app/LIB/context/LayoutContext";
import "katex/dist/katex.min.css";
import { useDebounce } from "@/app/LIB/hook/useDebounce";
import { useRouter } from "@/desktop/navigation";
import DocumentLoadingAnimation from "@/app/LIB/components/docs/DocumentLoadingAnimation";
import { fromEditorStateToIR } from "@/app/LIB/ir/fromProseMirror";
import { DOCX_V0_EXPORT_ERROR_MESSAGE, DOCX_V0_MIME_TYPE, buildDOCXV0ExportNotice, createDOCXV0WarningDetails, createDOCXV0DownloadFileName, finishDOCXV0Export, isDOCXV0PackageBytes, startDOCXV0Export, summarizeDOCXV0Warnings } from "@/app/LIB/utils/docxExportButtonUtils";
import { HWPX_V0_EXPORT_ERROR_MESSAGE, HWPX_V0_MIME_TYPE, buildHWPXV0ExportNotice, createHWPXV0WarningDetails, createHWPXV0DownloadFileName, createHWPXV0PageSettingsFromDocSetting, isHWPXV0PackageBytes } from "@/app/LIB/utils/hwpxExportButtonUtils";
import { DOCX_IMPORT_MAX_BYTES, DOCX_IMPORT_ERROR_MESSAGE, applyDOCXImportPreviewToEditor, finishDOCXImportDryRun, runDOCXImportDryRun, startDOCXImportDryRun, validateDOCXImportFile } from "@/app/LIB/utils/docxImportButtonUtils";
import { HWPX_IMPORT_MAX_BYTES, HWPX_IMPORT_ERROR_MESSAGE, applyHWPXImportPreviewToEditor, finishHWPXImportDryRun, runHWPXImportDryRun, startHWPXImportDryRun, validateHWPXImportFile } from "@/app/LIB/utils/hwpxImportButtonUtils";
import { classifyImportDryRunFailure, getBlockedWarningEntry } from "@/app/LIB/utils/classifyConversionError.js";
import { appendDocumentOperationAttempt, appendDocumentOperationResult, createDocumentOperationContentCheckpoint, enqueueDocumentOperationResultRetry, flushDocumentOperationResultRetries, getDocumentOperationJournalCursor, readDocumentOperationJournal, resolveDocumentOperationContentCheckpoint, resolveDocumentOperationSaveOutcome, transitionDocumentOperationsThrough } from "@/app/LIB/utils/documentOperationJournal";
import { createDocumentOperationNonce, getDocumentSemanticFingerprint } from "@/app/LIB/utils/documentOperationUtils";
import { captureDocumentOperationRollbackSnapshot, removeDocumentOperationRollbackSnapshot } from "@/app/LIB/utils/documentOperationRollbackSnapshot";
import { captureNotePersistenceSnapshot, NOTE_PERSISTENCE_ERROR_CODES } from "@/app/LIB/utils/notePersistenceGate";
import { getEditorViewSafely } from "@/app/LIB/utils/editorViewUtils";
import { registerLocalFlusher } from "@/app/LIB/utils/localBridge";
import { auditPdfOutputPreflight, createPdfOutputPreflightReport, getPdfOutputPreflightIssueSignature } from "@/app/LIB/utils/pdfOutputPreflightAudit";
const SAVE_FAILURE_MESSAGE =
  "저장하지 못했습니다. 파일 변경 여부와 폴더 쓰기 권한을 확인해 주세요.";
const IMPORT_SOURCE_FILENAME_SAVE_WARNING =
  "원본 파일명은 저장하지 못했지만 문서 내용은 적용했습니다.";
const ROLLBACK_SNAPSHOT_PRECONDITION_FAILED = "RollbackSnapshotUnavailable";

const downloadHWPXV0Package = (packageBytes, filename) => {
  const blob = new Blob([packageBytes], { type: HWPX_V0_MIME_TYPE });
  const url = window.URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
};

const downloadDOCXV0Package = (packageBytes, filename) => {
  const blob = new Blob([packageBytes], { type: DOCX_V0_MIME_TYPE });
  const url = window.URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
};

const toReadinessSeverity = (severity) =>
  severity === "error" || severity === "blocked" ? "blocked" : "warning";

const buildConversionFailureToastMessage = (classification) => {
  const title = `${classification?.title ?? ""}`.trim();
  const message = `${classification?.message ?? ""}`.trim();

  if (!title) {
    return message;
  }

  if (!message || message.startsWith(title)) {
    return message || title;
  }

  return `${title} ${message}`;
};

const createImportReadinessWarnings = (preview) => {
  const warnings = Array.isArray(preview?.importResult?.warnings)
    ? preview.importResult.warnings.map((warning) => ({
        code: warning?.code,
        severity: toReadinessSeverity(warning?.severity)
      }))
    : [];

  if (preview?.summary?.canApply !== false || warnings.some((warning) => warning.severity === "blocked")) {
    return warnings;
  }

  return [...warnings, getBlockedWarningEntry()];
};

function CodexDocumentWorkNotice({ theme }) {
  const { cancelResponse } = useCodex();
  const anchorRef = useRef(null);
  const overlayRef = useRef(null);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    let scrollport = anchorRef.current?.parentElement;
    while (scrollport && !/(auto|scroll|overlay)/.test(getComputedStyle(scrollport).overflowY)) {
      scrollport = scrollport.parentElement;
    }
    if (!overlay || !scrollport) return;

    const position = () => {
      const rect = scrollport.getBoundingClientRect();
      const left = Math.max(0, rect.left + scrollport.clientLeft);
      const right = Math.min(window.innerWidth, rect.left + scrollport.clientLeft + scrollport.clientWidth);
      overlay.style.left = `${(left + right) / 2}px`;
      overlay.style.top = `${Math.max(0, rect.top + scrollport.clientTop) + 48}px`;
      overlay.style.width = `${Math.max(0, right - left)}px`;
      overlay.style.visibility = right > left ? 'visible' : 'hidden';
    };
    const observer = new ResizeObserver(position);
    observer.observe(scrollport);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, { capture: true, passive: true });
    position();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
    };
  }, []);

  return <>
    <span ref={anchorRef} hidden aria-hidden="true" />
    {createPortal(
    <div ref={overlayRef} className="pointer-events-none fixed z-90 flex -translate-x-1/2 justify-center px-3 print:hidden" style={{ visibility: 'hidden' }}>
      <ToolbarSurface background="white-10" className="pointer-events-auto flex max-w-full items-center gap-3 rounded-4xl py-2 pr-2 pl-4" role="status">
        <Typography size="sm" color={`${theme}-9`} className="min-w-0 break-keep">Codex 작업 중 · 문서 편집이 잠겨 있어요</Typography>
        <Button size="sm" background="transparent" border={false} className="shrink-0" onClick={() => cancelResponse()}><Typography size="xs" className="underline">중단</Typography></Button>
      </ToolbarSurface>
    </div>,
    document.body
    )}
  </>;
}

export default function WritePage() {
  const {
    document: currentDocument,
    saveDocument,
    title,
    docSetting,
    loading,
    content,
    bulletStyle,
    setContent,
    setFocus,
    viewPage,
    pageNumber,
    error,
    codexDocumentLock,
    externalDocumentVersion
  } = useDocument();
  const {
    setSaveAction,
    editor,
    setPrintAction,
    setHwpxExportAction,
    setDocxExportAction,
    setHwpxImportAction,
    setDocxImportAction,
    notifyDocumentOperationRollbackChanged
  } = useEditor();
  const { layoutMode } = useLayout();
  const { user } = useUser();
  const { setting } = useSetting();
  const [mounted, setMounted] = useState(false);
  const [hwpxWarningDetails, setHwpxWarningDetails] = useState(null);
  const [hwpxWarningDetailOpen, setHwpxWarningDetailOpen] = useState(false);
  const [docxWarningDetails, setDocxWarningDetails] = useState(null);
  const [docxWarningDetailOpen, setDocxWarningDetailOpen] = useState(false);
  const [hwpxImportPreview, setHwpxImportPreview] = useState(null);
  const [hwpxImportPreviewOpen, setHwpxImportPreviewOpen] = useState(false);
  const [hwpxImportApplying, setHwpxImportApplying] = useState(false);
  const [docxImportPreview, setDocxImportPreview] = useState(null);
  const [docxImportPreviewOpen, setDocxImportPreviewOpen] = useState(false);
  const [docxImportApplying, setDocxImportApplying] = useState(false);
  const [pdfOutputPreflightReport, setPdfOutputPreflightReport] = useState(null);
  const debouncedContent = useDebounce(content, setting.autoSaveDelay);
  const hwpxExportInFlightRef = useRef(false);
  const docxExportInFlightRef = useRef(false);
  const hwpxImportInFlightRef = useRef(false);
  const docxImportInFlightRef = useRef(false);
  const printInFlightRef = useRef(false);
  const router = useRouter();
  const documentId = currentDocument?._id;
  const userId = user?.uid || null;
  const documentSessionKey =
    userId && documentId
      ? `${encodeURIComponent(userId)}:${encodeURIComponent(documentId)}`
      : null;
  const savedBaselineRef = useRef(null);
  const baselineDocumentKeyRef = useRef(null);
  const contentSaveInFlightByKeyRef = useRef(new Map());
  const documentOperationContentCheckpointRef = useRef(null);
  const documentOperationResultRetryRef = useRef(new Map());
  const notePersistenceBlockedRef = useRef(false);
  const [notePersistenceBlocked, setNotePersistenceBlocked] = useState(false);

  const blockNotePersistence = useCallback((error) => {
    notePersistenceBlockedRef.current = true;
    setNotePersistenceBlocked(true);
    // Typed diagnostics intentionally exclude document HTML/content.
    if (error?.code === NOTE_PERSISTENCE_ERROR_CODES.INVALID_EDITOR) {
      console.warn("Note persistence gate rejected a document boundary:", error);
    } else {
      console.error("Note persistence gate rejected a document boundary:", error);
    }
  }, []);

  const handleNotePersistenceStatus = useCallback(({ source, status }) => {
    if (
      status === "valid" &&
      (source === "editor" || source === "initial-restore" || source === "external-restore")
    ) {
      notePersistenceBlockedRef.current = false;
      setNotePersistenceBlocked(false);
    }
  }, []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setPdfOutputPreflightReport(null);
  }, [documentId]);

  useEffect(() => {
    if (!documentId) {
      savedBaselineRef.current = null;
      baselineDocumentKeyRef.current = null;
      documentOperationContentCheckpointRef.current = null;
      documentOperationResultRetryRef.current.clear();
      notePersistenceBlockedRef.current = false;
      setNotePersistenceBlocked(false);
      return;
    }

    const baselineDocumentKey = documentSessionKey;
    const isNewDocumentSession =
      baselineDocumentKeyRef.current !== baselineDocumentKey;
    baselineDocumentKeyRef.current = baselineDocumentKey;

    savedBaselineRef.current = {
      content: currentDocument?.content ?? "",
      revision: currentDocument?.revision ?? null
    };
    if (isNewDocumentSession) {
      documentOperationContentCheckpointRef.current = null;
      documentOperationResultRetryRef.current.clear();
      notePersistenceBlockedRef.current = false;
      setNotePersistenceBlocked(false);
    }
  }, [
    documentId,
    currentDocument?.content,
    currentDocument?.revision,
    documentSessionKey
  ]);

  const handleEditorContentChange = useCallback(
    (nextContent) => {
      if (userId && documentId) {
        flushDocumentOperationResultRetries({
          retryQueue: documentOperationResultRetryRef.current,
          uid: userId,
          documentId
        });
      }
      documentOperationContentCheckpointRef.current =
        userId && documentId && typeof nextContent === "string"
          ? createDocumentOperationContentCheckpoint({
              uid: userId,
              documentId,
              content: nextContent
            })
          : null;
      setContent(nextContent);
    },
    [documentId, setContent, userId]
  );

  const beginContentSave = useCallback(
    (nextContent) => {
      const checkpointCursorBeforeRetry =
        resolveDocumentOperationContentCheckpoint(
          documentOperationContentCheckpointRef.current,
          {
            uid: userId,
            documentId,
            content: nextContent
          }
        );
      const journalCursorBeforeRetry =
        userId && documentId
          ? getDocumentOperationJournalCursor(userId, documentId)
          : 0;
      const retryResult =
        userId && documentId
          ? flushDocumentOperationResultRetries({
              retryQueue: documentOperationResultRetryRef.current,
              uid: userId,
              documentId
            })
          : { flushed: 0, pending: 0 };

      // Advance an exact-content checkpoint only when no newer journal event
      // existed before the retry. This prevents an older debounced save from
      // acknowledging a later editor mutation.
      if (
        retryResult.flushed > 0 &&
        checkpointCursorBeforeRetry > 0 &&
        journalCursorBeforeRetry === checkpointCursorBeforeRetry
      ) {
        documentOperationContentCheckpointRef.current =
          createDocumentOperationContentCheckpoint({
            uid: userId,
            documentId,
            content: nextContent
          });
      }

      const journalCursor = resolveDocumentOperationContentCheckpoint(
        documentOperationContentCheckpointRef.current,
        {
          uid: userId,
          documentId,
          content: nextContent
        }
      );
      const checkpoint = { content: nextContent };
      const acknowledgementNonce = createDocumentOperationNonce();
      if (documentSessionKey) {
        const currentCount =
          contentSaveInFlightByKeyRef.current.get(documentSessionKey) || 0;
        contentSaveInFlightByKeyRef.current.set(
          documentSessionKey,
          currentCount + 1
        );
      }
      return {
        acknowledgementId: `save-${acknowledgementNonce}`,
        checkpoint,
        journalCursor,
        documentId,
        sessionKey: documentSessionKey,
        userId
      };
    },
    [documentId, documentSessionKey, userId]
  );

  const finishContentSave = useCallback(
    ({ saveContext, savedContent, succeeded }) => {
      const {
        checkpoint,
        acknowledgementId,
        documentId: savedDocumentId,
        journalCursor,
        sessionKey,
        userId: savedUserId
      } = saveContext || {};
      const saveOutcome = resolveDocumentOperationSaveOutcome({
        checkpoint,
        savedContent,
        succeeded
      });

      if (savedUserId && savedDocumentId && journalCursor > 0 && acknowledgementId) {
        transitionDocumentOperationsThrough({
          acknowledgementId,
          coveredThroughSequence: journalCursor,
          documentId: savedDocumentId,
          persistenceStatus: saveOutcome.persistenceStatus,
          uid: savedUserId
        });
        notifyDocumentOperationRollbackChanged();
      }

      if (sessionKey) {
        const currentCount =
          contentSaveInFlightByKeyRef.current.get(sessionKey) || 0;
        const nextCount = Math.max(0, currentCount - 1);
        if (nextCount === 0) {
          contentSaveInFlightByKeyRef.current.delete(sessionKey);
        } else {
          contentSaveInFlightByKeyRef.current.set(sessionKey, nextCount);
        }
      }

      if (!sessionKey || baselineDocumentKeyRef.current !== sessionKey) {
        return;
      }

      if (succeeded) {
        savedBaselineRef.current = {
          content: savedContent,
          revision: savedBaselineRef.current?.revision ?? null
        };
      }
    },
    [notifyDocumentOperationRollbackChanged]
  );

  const resetHwpxImportFlow = useCallback(() => {
    setHwpxImportPreviewOpen(false);
    setHwpxImportPreview(null);
  }, []);

  const resetDocxImportFlow = useCallback(() => {
    setDocxImportPreviewOpen(false);
    setDocxImportPreview(null);
  }, []);

  const persistImportedSourceFileName = useCallback(
    (sourceFileName) => {
      const nextSourceFileName = `${sourceFileName ?? ""}`.trim();

      if (!documentId || !nextSourceFileName) {
        return;
      }

      void saveDocument(
        documentId,
        {
          sourceFileName: nextSourceFileName
        },
        true
      )
        .then((saveResult) => {
          if (!saveResult) {
            toast.warning(IMPORT_SOURCE_FILENAME_SAVE_WARNING);
          }
        })
        .catch((error) => {
          console.error("Imported source file name save error:", error);
          toast.warning(IMPORT_SOURCE_FILENAME_SAVE_WARNING);
        });
    },
    [documentId, saveDocument]
  );

  const handleSave = useCallback(async () => {
    if (codexDocumentLock) return true;
    if (currentDocument && content !== null && editor) {
      if (notePersistenceBlockedRef.current || notePersistenceBlocked) return false;
      const snapshot = captureNotePersistenceSnapshot(editor, content);
      if (!snapshot.ok) {
        blockNotePersistence(snapshot.error);
        return false;
      }
      const savedContent = snapshot.html;
      // ✨ 현재 에디터의 커서 위치(숫자)를 가져옵니다.
      const currentPos = editor.state.selection.anchor;
      const saveContext = beginContentSave(savedContent);
      let saveSettled = false;

      try {
        // DB에 저장 (focus: currentPos)
        const saveResult = await saveDocument(
          currentDocument._id,
          {
            content: savedContent,
            focus: currentPos, // ✨ 'end' 대신 실제 숫자 위치 저장
            refreshThumbnail: true
          },
          true
        );

        if (!saveResult) {
          finishContentSave({
            saveContext,
            savedContent,
            succeeded: false
          });
          saveSettled = true;
          toast.danger(SAVE_FAILURE_MESSAGE);
          return false;
        }

        finishContentSave({ saveContext, savedContent, succeeded: true });
        saveSettled = true;
        setFocus(currentPos);
        lastSavedContent.current = savedContent;
        toast.success("저장되었습니다!");
        return true;
      } catch (error) {
        if (!saveSettled) {
          finishContentSave({
            saveContext,
            savedContent,
            succeeded: false
          });
        }
        console.error("문서 저장 실패:", error);
        toast.danger(SAVE_FAILURE_MESSAGE);
        return false;
      }
    }

    toast.info("문서 편집기가 준비되면 다시 시도해 주세요.");
    return false;
  }, [
    beginContentSave,
    content,
    currentDocument,
    editor,
    finishContentSave,
    blockNotePersistence,
    notePersistenceBlocked,
    saveDocument,
    setFocus,
    codexDocumentLock
  ]);

  useEffect(() => registerLocalFlusher(async () => {
    if (!currentDocument?._id) return;
    if (!await handleSave()) throw new Error('문서를 저장하지 못했습니다. 다시 저장한 뒤 시도해 주세요.');
  }), [currentDocument?._id, handleSave]);

  const inspectPdfOutputPreflight = useCallback(() => {
    try {
      return auditPdfOutputPreflight({
        rootElement: getEditorViewSafely(editor)?.dom || null,
        notePersistenceBlocked:
          notePersistenceBlockedRef.current || notePersistenceBlocked
      });
    } catch (error) {
      console.error("PDF output preflight failed:", error);
      return createPdfOutputPreflightReport({ surfaceAvailable: false });
    }
  }, [editor, notePersistenceBlocked]);

  const openNativePrintPreview = useCallback(async () => {
    if (printInFlightRef.current) return false;
    printInFlightRef.current = true;

    try {
      if (window.dockitLocal) {
        if (!window.dockitLocal.print) throw new Error("인쇄 기능을 적용하려면 앱을 다시 실행해주세요.");
        await window.dockitLocal.print({ title: currentDocument?.title || "Dockit Open" });
      } else {
        window.print();
      }
      return true;
    } catch (error) {
      console.error("Print preview failed:", error);
      toast.danger(error.message || "인쇄 미리 보기를 열 수 없습니다.");
      return false;
    } finally {
      printInFlightRef.current = false;
    }
  }, [currentDocument?.title]);

  const handlePrint = useCallback(async () => {
    const report = inspectPdfOutputPreflight();

    if (!report.canPrint || report.requiresConfirmation) {
      setPdfOutputPreflightReport(report);
      return false;
    }

    setPdfOutputPreflightReport(null);
    return openNativePrintPreview();
  }, [inspectPdfOutputPreflight, openNativePrintPreview]);

  const confirmPdfOutputPrint = useCallback(async () => {
    const acknowledgedReport = pdfOutputPreflightReport;
    if (!acknowledgedReport?.requiresConfirmation) return false;

    const latestReport = inspectPdfOutputPreflight();
    const warningsChanged =
      latestReport.requiresConfirmation &&
      getPdfOutputPreflightIssueSignature(latestReport) !==
        getPdfOutputPreflightIssueSignature(acknowledgedReport);

    if (!latestReport.canPrint || warningsChanged) {
      setPdfOutputPreflightReport(latestReport);
      return false;
    }

    setPdfOutputPreflightReport(null);
    return openNativePrintPreview();
  }, [
    inspectPdfOutputPreflight,
    openNativePrintPreview,
    pdfOutputPreflightReport
  ]);

  const handleHwpxExport = useCallback(async () => {
    if (!editor || editor.isDestroyed || !editor.state) {
      toast.info("문서 편집기가 준비되면 다시 시도해 주세요.");
      return;
    }

    if (hwpxExportInFlightRef.current) {
      toast.info("HWPX 내보내기를 진행 중입니다.");
      return;
    }

    hwpxExportInFlightRef.current = true;
    setHwpxWarningDetailOpen(false);
    setHwpxWarningDetails(null);

    try {
      const [hwpxExportModule, remoteImageModule] = await Promise.all([
        import("@/app/LIB/ir/hwpxMinimalExport"),
        import("@/app/LIB/ir/hwpxRemoteImageResolver")
      ]);
      const latestHtml = editor.getHTML();
      setContent(latestHtml);

      const ir = fromEditorStateToIR(editor.state, {
        pageSettings: createHWPXV0PageSettingsFromDocSetting(docSetting),
        extractedAt: new Date().toISOString(),
        extractorVersion: "dockit-hwpx-export-button-v0.1"
      });
      const exportIr =
        await remoteImageModule.resolveHWPXV0RemoteImageSources(ir);
      const input = hwpxExportModule.createHWPXV0ExportInput(exportIr);
      const result = hwpxExportModule.exportIRToHWPXV0(input);
      const summary = hwpxExportModule.summarizeHWPXV0Warnings(result.warnings);
      const notice = buildHWPXV0ExportNotice({
        hwpxWarningSummary: summary,
        irWarningCount: exportIr.metadata?.warnings?.length || 0
      });
      const warningDetails = createHWPXV0WarningDetails({
        hwpxWarnings: result.warnings,
        hwpxWarningSummary: summary,
        irWarnings: exportIr.metadata?.warnings
      });

      if (!isHWPXV0PackageBytes(result.packageBytes)) {
        throw new Error("HWPX v0 export returned an invalid package signature.");
      }

      downloadHWPXV0Package(
        result.packageBytes,
        createHWPXV0DownloadFileName(currentDocument?.title)
      );

      setHwpxWarningDetails(warningDetails.hasWarnings ? warningDetails : null);
      setHwpxWarningDetailOpen(warningDetails.hasWarnings);

      if (notice.toastType === "warning") {
        toast.warning(notice.message);
        return;
      }

      if (notice.toastType === "info") {
        toast.info(notice.message);
        return;
      }

      toast.success(notice.message);
    } catch (error) {
      console.error("HWPX v0 export error:", error);
      setHwpxWarningDetails(null);
      toast.danger(HWPX_V0_EXPORT_ERROR_MESSAGE);
    } finally {
      hwpxExportInFlightRef.current = false;
    }
  }, [docSetting, currentDocument?.title, editor, setContent]);

  const handleDocxExport = useCallback(async () => {
    if (!editor || editor.isDestroyed || !editor.state) {
      toast.info("문서 편집기가 준비되면 다시 시도해 주세요.");
      return;
    }

    if (!startDOCXV0Export(docxExportInFlightRef)) {
      toast.info("DOCX 내보내기를 진행 중입니다.");
      return;
    }

    setDocxWarningDetailOpen(false);
    setDocxWarningDetails(null);

    try {
      const docxExportModule = await import("@/app/LIB/ir/docxMinimalExport");
      const ir = fromEditorStateToIR(editor.state, {
        pageSettings: createHWPXV0PageSettingsFromDocSetting(docSetting),
        extractedAt: new Date().toISOString(),
        extractorVersion: "dockit-docx-export-button-v0"
      });
      const input = docxExportModule.createDOCXMinimalExportInput(ir);
      const result = docxExportModule.exportIRToMinimalDOCX(input);
      const warningSummary = summarizeDOCXV0Warnings(result.warnings);
      const notice = buildDOCXV0ExportNotice({
        warningSummary,
        irWarningCount: ir.metadata?.warnings?.length || 0
      });
      const warningDetails = createDOCXV0WarningDetails({
        docxWarnings: result.warnings,
        docxWarningSummary: warningSummary,
        irWarnings: ir.metadata?.warnings
      });

      if (!isDOCXV0PackageBytes(result.packageBytes)) {
        throw new Error("DOCX v0 export returned an invalid package signature.");
      }

      downloadDOCXV0Package(
        result.packageBytes,
        createDOCXV0DownloadFileName(currentDocument?.title)
      );

      setDocxWarningDetails(warningDetails.hasWarnings ? warningDetails : null);
      setDocxWarningDetailOpen(warningDetails.hasWarnings);

      if (notice.toastType === "warning") {
        toast.warning(notice.message);
        return;
      }

      if (notice.toastType === "info") {
        toast.info(notice.message);
        return;
      }

      toast.success(notice.message);
    } catch (error) {
      console.error("DOCX v0 export error:", error);
      setDocxWarningDetails(null);
      setDocxWarningDetailOpen(false);
      toast.danger(DOCX_V0_EXPORT_ERROR_MESSAGE);
    } finally {
      finishDOCXV0Export(docxExportInFlightRef);
    }
  }, [docSetting, currentDocument?.title, editor]);

  const handleHwpxImportFile = useCallback(async (file) => {
    const fileValidation = validateHWPXImportFile(file);

    if (!fileValidation.valid) {
      toast.danger(fileValidation.message);
      return;
    }

    if (!startHWPXImportDryRun(hwpxImportInFlightRef)) {
      toast.info("HWPX 불러오기 dry-run을 진행 중입니다.");
      return;
    }

    resetDocxImportFlow();
    resetHwpxImportFlow();

    try {
      const [hwpxImportModule, projectionModule, validationModule] =
        await Promise.all([
          import("@/app/LIB/ir/hwpxImport"),
          import("@/app/LIB/ir/toProseMirror"),
          import("@/app/LIB/ir/proseMirrorProjectionValidation")
        ]);
      const dryRun = await runHWPXImportDryRun({
        file,
        importHWPXToIR: hwpxImportModule.importHWPXToIR,
        irToProseMirror: projectionModule.irToProseMirror,
        validateProseMirrorProjection:
          validationModule.validateProseMirrorProjection
      });

      if (!dryRun.ok) {
        const failure = classifyImportDryRunFailure({
          dryRunResult: dryRun,
          fileName: file?.name,
          maxBytes: HWPX_IMPORT_MAX_BYTES
        });

        if (failure.category === "parse-failure") {
          console.error("HWPX import dry-run parse failure:", {
            correlationId: failure.correlationId,
            error: dryRun.error || new Error(dryRun.message || HWPX_IMPORT_ERROR_MESSAGE)
          });
        }

        const classifiedError = new Error(failure.message || dryRun.message || HWPX_IMPORT_ERROR_MESSAGE);
        classifiedError.conversionFailure = failure;
        classifiedError.cause = dryRun.error;
        throw classifiedError;
      }

      setHwpxImportPreview(dryRun.preview);
      setHwpxImportPreviewOpen(false);

      if (!dryRun.preview.summary.canApply) {
        toast.warning("HWPX dry-run 결과 적용할 수 없는 항목이 있습니다.");
        return;
      }

      const warningTotal =
        dryRun.preview.summary.importWarningCount +
        dryRun.preview.summary.lossCount +
        dryRun.preview.summary.projectionWarningCount +
        dryRun.preview.summary.validationWarningCount;

      if (warningTotal > 0) {
        toast.info(`HWPX dry-run 완료: 확인할 항목 ${warningTotal}개`);
        return;
      }

      toast.success("HWPX dry-run이 완료되었습니다.");
    } catch (error) {
      console.error("HWPX import dry-run error:", error);
      resetHwpxImportFlow();
      toast.danger(
        buildConversionFailureToastMessage(error?.conversionFailure) || HWPX_IMPORT_ERROR_MESSAGE
      );
    } finally {
      finishHWPXImportDryRun(hwpxImportInFlightRef);
    }
  }, [resetDocxImportFlow, resetHwpxImportFlow]);

  const handleDocxImportFile = useCallback(async (file) => {
    const fileValidation = validateDOCXImportFile(file);

    if (!fileValidation.valid) {
      toast.danger(fileValidation.message);
      return;
    }

    if (!startDOCXImportDryRun(docxImportInFlightRef)) {
      toast.info("DOCX 불러오기 dry-run을 진행 중입니다.");
      return;
    }

    resetHwpxImportFlow();
    resetDocxImportFlow();

    try {
      const [docxImportModule, projectionModule, validationModule] =
        await Promise.all([
          import("@/app/LIB/ir/docxImport"),
          import("@/app/LIB/ir/toProseMirror"),
          import("@/app/LIB/ir/proseMirrorProjectionValidation")
        ]);
      const dryRun = await runDOCXImportDryRun({
        file,
        importDOCXToIR: docxImportModule.importDOCXToIR,
        irToProseMirror: projectionModule.irToProseMirror,
        validateProseMirrorProjection:
          validationModule.validateProseMirrorProjection
      });

      if (!dryRun.ok) {
        const failure = classifyImportDryRunFailure({
          dryRunResult: dryRun,
          fileName: file?.name,
          maxBytes: DOCX_IMPORT_MAX_BYTES
        });

        if (failure.category === "parse-failure") {
          console.error("DOCX import dry-run parse failure:", {
            correlationId: failure.correlationId,
            error: dryRun.error || new Error(dryRun.message || DOCX_IMPORT_ERROR_MESSAGE)
          });
        }

        const classifiedError = new Error(failure.message || dryRun.message || DOCX_IMPORT_ERROR_MESSAGE);
        classifiedError.conversionFailure = failure;
        classifiedError.cause = dryRun.error;
        throw classifiedError;
      }

      setDocxImportPreview(dryRun.preview);
      setDocxImportPreviewOpen(false);

      if (!dryRun.preview.summary.canApply) {
        toast.warning("DOCX dry-run 결과 적용할 수 없는 항목이 있습니다.");
        return;
      }

      const warningTotal =
        dryRun.preview.summary.importWarningCount +
        dryRun.preview.summary.projectionWarningCount +
        dryRun.preview.summary.validationWarningCount;

      if (warningTotal > 0) {
        toast.info(`DOCX dry-run 완료: 확인할 항목 ${warningTotal}개`);
        return;
      }

      toast.success("DOCX dry-run이 완료되었습니다.");
    } catch (error) {
      console.error("DOCX import dry-run error:", error);
      resetDocxImportFlow();
      toast.danger(
        buildConversionFailureToastMessage(error?.conversionFailure) || DOCX_IMPORT_ERROR_MESSAGE
      );
    } finally {
      finishDOCXImportDryRun(docxImportInFlightRef);
    }
  }, [resetDocxImportFlow, resetHwpxImportFlow]);

  const applyHwpxImportPreview = useCallback(() => {
    if (!hwpxImportPreview?.summary?.canApply) {
      toast.danger("적용할 수 없는 HWPX dry-run 결과입니다.");
      return;
    }

    if (!editor || editor.isDestroyed || !editor.commands) {
      toast.info("문서 편집기가 준비되면 다시 시도해 주세요.");
      return;
    }

    setHwpxImportApplying(true);

    try {
      const applyResult = applyHWPXImportPreviewToEditor(hwpxImportPreview, editor);

      if (!applyResult.applied) {
        throw new Error(`HWPX import apply failed: ${applyResult.reason}`);
      }

      const sourceFileName = hwpxImportPreview.summary.fileName;
      const latestHtml = editor.getHTML();
      setContent(latestHtml);
      resetHwpxImportFlow();
      toast.success("HWPX 내용을 현재 문서에 적용했습니다.");
      persistImportedSourceFileName(sourceFileName);
    } catch (error) {
      console.error("HWPX import apply error:", error);
      toast.danger("HWPX 내용을 적용하지 못했습니다. 현재 문서는 유지됩니다.");
    } finally {
      setHwpxImportApplying(false);
    }
  }, [
    editor,
    hwpxImportPreview,
    persistImportedSourceFileName,
    resetHwpxImportFlow,
    setContent
  ]);

  const applyDocxImportPreview = useCallback(() => {
    if (docxImportApplying) {
      return;
    }

    if (!docxImportPreview?.summary?.canApply) {
      toast.danger("적용할 수 없는 DOCX dry-run 결과입니다.");
      return;
    }

    if (!editor || editor.isDestroyed || !editor.commands) {
      toast.info("문서 편집기가 준비되면 다시 시도해 주세요.");
      return;
    }

    setDocxImportApplying(true);

    try {
      const applyResult = applyDOCXImportPreviewToEditor(docxImportPreview, editor);

      if (!applyResult.applied) {
        throw new Error(`DOCX import apply failed: ${applyResult.reason}`);
      }

      const sourceFileName = docxImportPreview.summary.fileName;
      const latestHtml = editor.getHTML();
      setContent(latestHtml);
      resetDocxImportFlow();
      toast.success("DOCX 내용을 현재 문서에 적용했습니다.");
      persistImportedSourceFileName(sourceFileName);
    } catch (error) {
      console.error("DOCX import apply error:", error);
      toast.danger("DOCX 내용을 적용하지 못했습니다. 현재 문서는 유지됩니다.");
    } finally {
      setDocxImportApplying(false);
    }
  }, [
    docxImportApplying,
    docxImportPreview,
    editor,
    persistImportedSourceFileName,
    resetDocxImportFlow,
    setContent
  ]);

  useEffect(() => {
    setSaveAction(() => handleSave);
    setPrintAction(() => handlePrint);
    setHwpxExportAction(() => handleHwpxExport);
    setDocxExportAction(() => handleDocxExport);
    setHwpxImportAction(() => handleHwpxImportFile);
    setDocxImportAction(() => handleDocxImportFile);
    return () => {
      setSaveAction(null);
      setPrintAction(null);
      setHwpxExportAction(null);
      setDocxExportAction(null);
      setHwpxImportAction(null);
      setDocxImportAction(null);
    };
  }, [
    handleSave,
    setSaveAction,
    setPrintAction,
    handlePrint,
    setHwpxExportAction,
    handleHwpxExport,
    setDocxExportAction,
    handleDocxExport,
    setHwpxImportAction,
    handleHwpxImportFile,
    setDocxImportAction,
    handleDocxImportFile
  ]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const isCtrlOrCmd = event.metaKey || event.ctrlKey;

      if (isCtrlOrCmd && !event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault(); // 브라우저 기본 저장 동작 방지
        handleSave(); // 저장 함수 호출
      }

      // ✨ [수정] 서식 복사/붙여넣기 단축키
      if (isCtrlOrCmd && event.shiftKey) {
        // 서식 복사: Ctrl + Shift + C
        if (event.key.toLowerCase() === "c") {
          event.preventDefault();
          editor?.commands.copyFormat();
          toast.info("서식이 복사되었습니다.");
        }
        // 서식 붙여넣기: Ctrl + Shift + V
        if (event.key.toLowerCase() === "v") {
          event.preventDefault();
          editor?.commands.pasteFormat();
        }
      } // ✨ [추가] Ctrl+P 인쇄 단축키
      if (isCtrlOrCmd && event.key.toLowerCase() === "p") {
        event.preventDefault(); // 브라우저의 기본 인쇄 동작을 막습니다.
        handlePrint();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSave, editor, handlePrint, layoutMode]);
  const lastSavedContent = useRef(null);
  const documentContentRef = useRef(null);

  useEffect(() => {
    documentContentRef.current = currentDocument?.content;
  }, [currentDocument?.content]);

  useEffect(() => {
    lastSavedContent.current = documentContentRef.current ?? null;
  }, [documentId]);

  useEffect(() => {
    if (externalDocumentVersion) lastSavedContent.current = currentDocument?.content ?? null;
  }, [externalDocumentVersion, currentDocument?.content]);

  const doSaveDoc = useCallback(
    async (nextContent, nextFocus) => {
      if (!documentId || codexDocumentLock) return false;
      if (notePersistenceBlockedRef.current || notePersistenceBlocked) return false;
      const snapshot = captureNotePersistenceSnapshot(editor, nextContent);
      if (!snapshot.ok) {
        blockNotePersistence(snapshot.error);
        return false;
      }
      if (snapshot.html !== nextContent) {
        return false;
      }
      const saveContext = beginContentSave(nextContent);
      let saveSettled = false;

      try {
        const res = await saveDocument(
          documentId,
          {
            content: nextContent,
            focus: nextFocus
          },
          true
        );

        finishContentSave({
          saveContext,
          savedContent: nextContent,
          succeeded: Boolean(res)
        });
        saveSettled = true;

        if (!res) {
          toast.danger(SAVE_FAILURE_MESSAGE);
          return false;
        }

        toast.success("저장되었습니다!");
        return true;
      } catch (error) {
        if (!saveSettled) {
          finishContentSave({
            saveContext,
            savedContent: nextContent,
            succeeded: false
          });
        }
        console.error("자동 저장 실패:", error);
        toast.danger(SAVE_FAILURE_MESSAGE);
        return false;
      }
    },
    [
      beginContentSave,
      documentId,
      editor,
      finishContentSave,
      blockNotePersistence,
      notePersistenceBlocked,
      saveDocument,
      codexDocumentLock
    ]
  );

  useEffect(() => {
    if (
      !codexDocumentLock && setting.autoSave && editor &&
      documentId &&
      debouncedContent !== null &&
      debouncedContent === content &&
      debouncedContent !== lastSavedContent.current
    ) {
      let isCurrentSave = true;
      const contentToSave = debouncedContent;
      const currentPos = editor?.state.selection.anchor;

      doSaveDoc(contentToSave, currentPos).then((saved) => {
        if (isCurrentSave && saved) {
          lastSavedContent.current = contentToSave;
        }
      });

      return () => {
        isCurrentSave = false;
      };
    }
  }, [content, debouncedContent, documentId, doSaveDoc, editor, setting.autoSave, codexDocumentLock]);

  useEffect(() => {
    if (error) {
      toast.danger("잘못된 접근입니다.");
      router.push("/docs");
    }
  }, [error, router]);

  useEffect(() => {
    if (!docSetting || typeof window === "undefined") return;

    const pageStyle = `
@media print {
  @page {
    size: ${docSetting.pageWidth}mm ${docSetting.pageHeight}mm;
    margin: 0;
  }
  .printable-area {
    --print-page-width: ${docSetting.pageWidth}mm;
    --print-page-header-height: ${docSetting.paddingTop}mm;
    --print-page-footer-height: ${docSetting.paddingBottom}mm;
    --print-page-padding-left: ${docSetting.paddingLeft}mm;
    --print-page-padding-right: ${docSetting.paddingRight}mm;
    --print-page-number-bottom-offset: calc(${docSetting.paddingBottom}mm / 2 - 6px);
  }
}
    `;

    let styleTag = window.document.getElementById("dynamic-page-style");
    if (!styleTag) {
      styleTag = window.document.createElement("style");
      styleTag.id = "dynamic-page-style";
      window.document.head.appendChild(styleTag);
    }

    styleTag.textContent = pageStyle;

    return () => {
      styleTag.remove();
    };
  }, [docSetting]);

  const pageMetrics = useMemo(() => {
    if (!docSetting || typeof window === "undefined") return null;

    // mm를 px로 변환
    const mmToPx = (mm) => (mm * 96) / 25.4;

    return {
      width: mmToPx(docSetting.pageWidth),
      pageHeightPx: mmToPx(docSetting.pageHeight),
      padding: {
        top: mmToPx(docSetting.paddingTop),
        bottom: mmToPx(docSetting.paddingBottom),
        left: mmToPx(docSetting.paddingLeft),
        right: mmToPx(docSetting.paddingRight)
      },
      lineHeight: docSetting.lineHeight
    };
  }, [docSetting]);

  const docxImportWarningDetails = useMemo(() => {
    if (!docxImportPreview) {
      return null;
    }

    return createDOCXV0WarningDetails({
      docxWarnings: docxImportPreview.importResult?.warnings
    });
  }, [docxImportPreview]);

  const hwpxReadinessWarnings = useMemo(
    () => createImportReadinessWarnings(hwpxImportPreview),
    [hwpxImportPreview]
  );
  const docxReadinessWarnings = useMemo(
    () => createImportReadinessWarnings(docxImportPreview),
    [docxImportPreview]
  );
  const importReadinessActive = Boolean(hwpxImportPreview || docxImportPreview);

  const prepareDocumentOperationJournal = useCallback(
    ({ operation, operationId, rollbackSnapshotCandidate }) => {
      const prepared = Boolean(
        userId &&
          documentId &&
          appendDocumentOperationAttempt({
            uid: userId,
            documentId,
            operation,
            operationId
          })
      );
      if (!prepared) {
        return false;
      }

      if (!rollbackSnapshotCandidate) return true;
      const attemptEvent = readDocumentOperationJournal(userId, documentId).find(
        (event) => event.kind === "attempt" && event.operationId === operationId
      );
      const ownerActor = `user:${userId}`;
      const delegatedApprovalActor = [userId, ownerActor].includes(operation?.actor)
        ? undefined
        : ownerActor;
      const snapshot = captureDocumentOperationRollbackSnapshot({
        uid: userId,
        documentId,
        operation,
        ...(delegatedApprovalActor
          ? { approvalActor: delegatedApprovalActor }
          : {}),
        attemptEvent,
        target: rollbackSnapshotCandidate.target,
        beforeContent: rollbackSnapshotCandidate.beforeContent,
        afterContent: rollbackSnapshotCandidate.afterContent
      });
      if (snapshot) return true;

      const currentFingerprint = getDocumentSemanticFingerprint(
        editor?.view?.state?.doc ?? editor?.state?.doc
      );
      const rejectedResult = {
        afterFingerprint: currentFingerprint,
        beforeFingerprint: currentFingerprint,
        error: ROLLBACK_SNAPSHOT_PRECONDITION_FAILED,
        ok: false,
        operationId
      };
      const rejectionRecorded = appendDocumentOperationResult({
        uid: userId,
        documentId,
        operation,
        result: rejectedResult
      });
      if (!rejectionRecorded) {
        enqueueDocumentOperationResultRetry(
          documentOperationResultRetryRef.current,
          { documentId, operation, result: rejectedResult, uid: userId }
        );
      }
      return false;
    },
    [documentId, editor, userId]
  );

  const recordDocumentOperationResult = useCallback(
    ({ operation, result }) => {
      if (!userId || !documentId) return false;
      if (result?.ok === false && result.operationId) {
        removeDocumentOperationRollbackSnapshot(
          userId,
          documentId,
          result.operationId
        );
      }
      const appended = appendDocumentOperationResult({
        documentId,
        operation,
        result,
        uid: userId
      });
      if (appended) {
        notifyDocumentOperationRollbackChanged();
        return true;
      }

      enqueueDocumentOperationResultRetry(
        documentOperationResultRetryRef.current,
        { documentId, operation, result, uid: userId }
      );
      notifyDocumentOperationRollbackChanged();
      return false;
    },
    [
      documentId,
      notifyDocumentOperationRollbackChanged,
      userId
    ]
  );

  if (!mounted) {
    return null;
  }

  return (
    <Div className="doc-print-page-root flex flex-col items-center justify-center gap-2 py-12">
      {codexDocumentLock && <CodexDocumentWorkNotice theme={setting.theme} />}
      {loading || content === null || pageMetrics === null ? (
        <DocumentLoadingAnimation />
      ) : (
        <div className="flex flex-col items-center">
          <div style={{ position: "relative" }}>
            <ContentEditor
              value={content}
              onChange={handleEditorContentChange}
              onNotePersistenceRejected={blockNotePersistence}
              onNotePersistenceStatus={handleNotePersistenceStatus}
              onDocumentOperationSettled={recordDocumentOperationResult}
              onDocumentOperationWillApply={prepareDocumentOperationJournal}
              noteActor={userId ? `user:${userId}` : ""}
              documentOwnerUid={userId || ""}
              documentId={documentId}
              bulletStyle={bulletStyle}
              pageMetrics={pageMetrics}
              viewPage={viewPage}
              pageNumber={pageNumber}
              editable={!codexDocumentLock}
              codexLocked={Boolean(codexDocumentLock)}
              showRulers={true}
            />
          </div>
        </div>
      )}
      {hwpxImportPreview ? (
        <ConversionReadinessCard
          variant="import"
          warnings={hwpxReadinessWarnings}
          onViewDetails={() => setHwpxImportPreviewOpen(true)}
          onCancel={resetHwpxImportFlow}
          onApply={applyHwpxImportPreview}
        />
      ) : null}
      {docxImportPreview ? (
        <ConversionReadinessCard
          variant="import"
          warnings={docxReadinessWarnings}
          onViewDetails={() => setDocxImportPreviewOpen(true)}
          onCancel={resetDocxImportFlow}
          onApply={applyDocxImportPreview}
        />
      ) : null}
      {!importReadinessActive ? (
        <>
          <HwpxWarningDetailTrigger
            details={hwpxWarningDetailOpen ? null : hwpxWarningDetails}
            onOpen={() => setHwpxWarningDetailOpen(true)}
          />
          <HwpxWarningDetailModal
            open={hwpxWarningDetailOpen}
            details={hwpxWarningDetails}
            onClose={() => setHwpxWarningDetailOpen(false)}
          />
          <DocxWarningDetailTrigger
            details={docxWarningDetailOpen ? null : docxWarningDetails}
            onOpen={() => setDocxWarningDetailOpen(true)}
          />
          <DocxWarningDetailModal
            open={docxWarningDetailOpen}
            details={docxWarningDetails}
            onClose={() => setDocxWarningDetailOpen(false)}
          />
        </>
      ) : null}
      <DocxWarningDetailModal
        open={docxImportPreviewOpen}
        details={docxImportWarningDetails}
        title="DOCX 가져오기 상세"
        description="현재 문서에 적용하기 전, 아래 항목이 어떻게 처리되는지 확인해 주세요."
        onClose={() => setDocxImportPreviewOpen(false)}
      />
      <HwpxImportPreviewModal
        open={hwpxImportPreviewOpen}
        preview={hwpxImportPreview}
        applying={hwpxImportApplying}
        onApply={applyHwpxImportPreview}
        onClose={() => setHwpxImportPreviewOpen(false)}
      />
      <PdfOutputPreflightModal
        open={Boolean(pdfOutputPreflightReport)}
        report={pdfOutputPreflightReport}
        onClose={() => setPdfOutputPreflightReport(null)}
        onRecheck={() => void handlePrint()}
        onConfirm={() => void confirmPdfOutputPrint()}
      />
    </Div>
  );
}
