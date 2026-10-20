"use client";
import { t as uiText, useI18n } from "../../i18n";

import { EditorContent, useEditor as useTiptapEditor } from "@tiptap/react";
import { useEditor } from "../../context/EditorContext";
import { generateCssVariables } from "../../utils/tiptapUtils";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useRef
} from "react";
import dynamic from "@/desktop/dynamic";

import ExternalLinkPreviewPopover from "./ExternalLinkPreviewPopover";
import FootnoteProjectionContent from "./FootnoteProjectionContent";
import useContentEditorObjectSelection from "../../hook/useContentEditorObjectSelection";
import useContentEditorHeadingStyles from "../../hook/useContentEditorHeadingStyles";
import useContentEditorPrintFixups from "../../hook/useContentEditorPrintFixups";
import { createExternalLinkPreview } from "../../utils/externalLinkPreviewUtils";
import { migrateMathStrings } from "@tiptap/extension-mathematics";
import Placeholder from "@tiptap/extension-placeholder";
import { Selection } from "@tiptap/pm/state";
import { editorExtensions } from "@/app/LIB/constant/editorExtensions";
import { PaginationExtension } from "../../extensions/PaginationExtension";
import DeleteBehaviorGuard from "../../extensions/DeleteBehaviorGuard";
import TableRowOverflowGuard from "../../extensions/TableRowOverflowGuard";
import CodexDocumentLock from '../../extensions/CodexDocumentLock';
import { getEditorViewSafely } from "../../utils/editorViewUtils";
import { useSetting } from "../../context/SettingContext";
import { useDarkMode } from "../../context/DarkModeContext";
import { buildPaginationPageSegmentModel } from "../../pagination/render/buildPaginationPageSegmentModel";
import { createPaginationMirrorSnapshot } from "../../pagination/render/createPaginationMirrorSnapshot";
import {
  focusCanonicalFootnoteBody,
  focusFootnoteContinuationAtPoint
} from "../../pagination/render/mountFootnoteProjectionClone";
import {
  isTocEntryNode,
  isTextEditBlockingObjectType
} from "../../utils/editorContractUtils";
import {
  getHoveredAnchorWithinEditor,
  shouldBlockTextEditing,
  shouldHideHoveredLinkPreview,
  withAlpha,
  isTocTitleParagraph,
  resolveActivePageNumber,
  resolveDeleteRangeFromObjectId
} from "../../utils/contentEditorUtils";
import { getPageNumberBottomOffset } from "../../extensions/utils/paginationUtils";
import {
  captureNotePersistenceSnapshot,
  restoreValidatedNotePersistenceHtml
} from "../../utils/notePersistenceGate";
import { deferEditorWrite } from "../../utils/deferEditorWrite";

const TypeBubble = dynamic(() => import("./TypeBubble"), { ssr: false });
const EditorBlockDeleteModal = dynamic(
  () => import("./EditorBlockDeleteModal"),
  { ssr: false }
);
const PageRulers = dynamic(() => import("./PageRulers"), { ssr: false });

const documentPlaceholderExtension = Placeholder.configure({
  placeholder: () => uiText("첫 문장을 입력해 문서를 시작하세요."),
  emptyEditorClass: "is-editor-empty"
});

export default function ContentEditor({
  value,
  onChange,
  onNotePersistenceRejected,
  onNotePersistenceStatus,
  onDocumentOperationSettled,
  onDocumentOperationWillApply,
  onEditorReady,
  documentId,
  documentOwnerUid,
  noteActor,
  bulletStyle,
  pageMetrics,
  viewPage,
  pageNumber,
  editable = true,
  codexLocked = false,
  showRulers = false,
  pagesId = "pages"
}) {
  const uiLanguage = useI18n();
  const editorContainerRef = useRef(null);
  const [isEditable, setIsEditable] = useState(editable);
  const {
    selectedObject,
    setSelectedObject,
    setEditor,
    editorMounted,
    rememberTextSelection,
    mapRememberedTextSelection,
    registerTrackedNoteExecutor,
    registerDocumentOperationRollbackAdapter,
    insertNoteAtRememberedSelection
  } = useEditor();
  const { setting } = useSetting();
  const { currentColors } = useDarkMode();
  // editor 인스턴스를 ref로 저장하여 저장 시점에만 getHTML() 호출
  const editorRef = useRef(null);
  const codexLockedRef = useRef(codexLocked);
  codexLockedRef.current = codexLocked;
  // onChange debounce를 위한 ref
  const onChangeTimeoutRef = useRef(null);
  const lastContentRef = useRef("");
  const historyRef = useRef({ documentId });
  if (historyRef.current.documentId !== documentId) historyRef.current = { documentId };
  const hoverPreviewHideTimeoutRef = useRef(null);
  const activeHoveredLinkRef = useRef(null);
  const printInlineFixupsRef = useRef([]);
  const [hoveredLinkPreview, setHoveredLinkPreview] = useState(null);
  const [pendingDeleteTarget, setPendingDeleteTarget] = useState(null);
  const [paginationViewModel, setPaginationViewModel] = useState(null);
  const [paginationMirrorSnapshot, setPaginationMirrorSnapshot] =
    useState(null);
  const [isPaginationMirrorEnabled, setIsPaginationMirrorEnabled] =
    useState(false);
  const [activeRulerPageNumber, setActiveRulerPageNumber] = useState(1);
  const [trackedNoteExecutor, setTrackedNoteExecutor] = useState(null);

  useEffect(() => {
    setIsEditable(editable);
  }, [editable]);

  const clearHoverPreviewHideTimeout = useCallback(() => {
    if (hoverPreviewHideTimeoutRef.current) {
      clearTimeout(hoverPreviewHideTimeoutRef.current);
      hoverPreviewHideTimeoutRef.current = null;
    }
  }, []);

  const hideHoveredLinkPreview = useCallback(() => {
    clearHoverPreviewHideTimeout();
    activeHoveredLinkRef.current = null;
    setHoveredLinkPreview(null);
  }, [clearHoverPreviewHideTimeout]);

  const scheduleHideHoveredLinkPreview = useCallback(() => {
    clearHoverPreviewHideTimeout();
    hoverPreviewHideTimeoutRef.current = setTimeout(() => {
      activeHoveredLinkRef.current = null;
      setHoveredLinkPreview(null);
    }, 120);
  }, [clearHoverPreviewHideTimeout]);

  const showHoveredLinkPreview = useCallback(
    (anchorElement) => {
      const nextPreview = createExternalLinkPreview(anchorElement);

      if (!nextPreview) {
        hideHoveredLinkPreview();
        return;
      }

      clearHoverPreviewHideTimeout();
      activeHoveredLinkRef.current = anchorElement;
      setHoveredLinkPreview(nextPreview);
    },
    [clearHoverPreviewHideTimeout, hideHoveredLinkPreview]
  );

  // debounced onChange - 저장 시점에만 getHTML() 호출
  const capturePersistenceSnapshot = useCallback((source = "editor") => {
    const snapshot = captureNotePersistenceSnapshot(editorRef.current);
    if (!snapshot.ok) {
      onNotePersistenceRejected?.(snapshot.error);
      return null;
    }
    onNotePersistenceStatus?.({ source, status: "valid" });
    return snapshot;
  }, [onNotePersistenceRejected, onNotePersistenceStatus]);

  const debouncedOnChange = useCallback(() => {
    if (onChangeTimeoutRef.current) {
      clearTimeout(onChangeTimeoutRef.current);
    }
    onChangeTimeoutRef.current = setTimeout(() => {
      if (codexLockedRef.current || editorRef.current?.storage?.codexDocumentLock?.locked) return;
      if (editorRef.current && !editorRef.current.isDestroyed) {
        try {
          const snapshot = capturePersistenceSnapshot();
          if (snapshot?.html !== lastContentRef.current) {
            lastContentRef.current = snapshot.html;
            onChange(snapshot.html);
          }
        } catch (error) {
          console.error("ContentEditor getHTML error:", error);
        }
      }
    }, 500); // 500ms debounce - 저장 시점에만 호출
  }, [capturePersistenceSnapshot, onChange]);

  const settleRollbackDocumentOperation = useCallback(({ operation, result }) => {
    let journalRecorded = false;
    try {
      journalRecorded = onDocumentOperationSettled?.({ operation, result }) === true;
    } catch {}
    if (result?.ok !== true) return journalRecorded;

    const snapshot = capturePersistenceSnapshot("operation-rollback");
    if (!snapshot) return journalRecorded;
    try {
      onChange(snapshot.html);
      lastContentRef.current = snapshot.html;
      if (onChangeTimeoutRef.current) {
        clearTimeout(onChangeTimeoutRef.current);
        onChangeTimeoutRef.current = null;
      }
    } catch (error) {
      console.error("ContentEditor rollback checkpoint error:", error);
    }
    if (!journalRecorded) {
      try {
        journalRecorded = onDocumentOperationSettled?.({ operation, result }) === true;
      } catch {}
    }
    return journalRecorded;
  }, [capturePersistenceSnapshot, onChange, onDocumentOperationSettled]);

  const executeDeleteTarget = useCallback(
    (target) => {
      const editorInstance = editorRef.current;

      if (!editorInstance || editorInstance.isDestroyed || !target) {
        return;
      }

      if (target.typeName === "tocSection") {
        const tr = editorInstance.state.tr;
        const startPos = Math.max(0, target.from);
        const titleNode = tr.doc.nodeAt(startPos);

        if (!isTocTitleParagraph(titleNode)) {
          const docSize = editorInstance.state.doc.content.size;
          const from = Math.max(0, Math.min(target.from, docSize));
          const to = Math.max(from, Math.min(target.to, docSize));

          if (from !== to) {
            const fallbackTr = editorInstance.state.tr.delete(from, to);
            const nextSelectionPos = Math.max(
              0,
              Math.min(from, fallbackTr.doc.content.size)
            );
            fallbackTr.setSelection(
              Selection.near(fallbackTr.doc.resolve(nextSelectionPos), -1)
            );
            editorInstance.view.dispatch(fallbackTr.scrollIntoView());
            selectedObjectRef.current = null;
            setSelectedObject(null);
          }

          return;
        }

        tr.delete(startPos, startPos + titleNode.nodeSize);

        while (true) {
          const nextNode = tr.doc.nodeAt(startPos);

          if (!isTocEntryNode(nextNode)) {
            break;
          }

          tr.delete(startPos, startPos + nextNode.nodeSize);
        }

        if (tr.docChanged) {
          const nextSelectionPos = Math.max(
            0,
            Math.min(startPos, tr.doc.content.size)
          );
          tr.setSelection(Selection.near(tr.doc.resolve(nextSelectionPos), -1));
          editorInstance.view.dispatch(tr.scrollIntoView());
          selectedObjectRef.current = null;
          setSelectedObject(null);
        }

        return;
      }

      const docSize = editorInstance.state.doc.content.size;
      const resolvedRange = resolveDeleteRangeFromObjectId(
        editorInstance.state.doc,
        target
      );
      const from = Math.max(
        0,
        Math.min(resolvedRange?.from ?? target.from, docSize)
      );
      const to = Math.max(
        from,
        Math.min(resolvedRange?.to ?? target.to, docSize)
      );

      if (from === to) {
        return;
      }

      const tr = editorInstance.state.tr.delete(from, to);
      const nextSelectionPos = Math.max(0, Math.min(from, tr.doc.content.size));
      tr.setSelection(Selection.near(tr.doc.resolve(nextSelectionPos), -1));
      editorInstance.view.dispatch(tr.scrollIntoView());
      selectedObjectRef.current = null;
      setSelectedObject(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSelectedObject]
  );

  const closePendingDeleteModal = useCallback(() => {
    setPendingDeleteTarget(null);

    queueMicrotask(() => {
      if (editorRef.current && !editorRef.current.isDestroyed) {
        editorRef.current.view.focus();
      }
    });
  }, []);

  const handleDeleteBlockRequest = useCallback(
    (target) => {
      if (target?.kind === "delete") {
        executeDeleteTarget(target);
        return;
      }

      setPendingDeleteTarget(target);
    },
    [executeDeleteTarget]
  );

  const handlePaginationUpdate = useCallback((nextViewModel) => {
    setPaginationViewModel(nextViewModel);
  }, []);

  const capturePaginationMirrorSnapshot = useCallback(() => {
    const editorView = getEditorViewSafely(editorRef.current);

    if (!editorView?.dom) {
      setPaginationMirrorSnapshot(null);
      return;
    }

    setPaginationMirrorSnapshot(createPaginationMirrorSnapshot(editorView.dom));
  }, []);

  const confirmPendingDelete = useCallback(() => {
    const editorInstance = editorRef.current;

    if (!editorInstance || editorInstance.isDestroyed || !pendingDeleteTarget) {
      setPendingDeleteTarget(null);
      return;
    }

    executeDeleteTarget(pendingDeleteTarget);
    setPendingDeleteTarget(null);

    queueMicrotask(() => {
      if (editorRef.current && !editorRef.current.isDestroyed) {
        editorRef.current.view.focus();
      }
    });
  }, [executeDeleteTarget, pendingDeleteTarget]);

  const editor = useTiptapEditor(
    {
      extensions: [
        CodexDocumentLock.configure({ locked: codexLocked }),
        DeleteBehaviorGuard.configure({
          onDeleteBlockRequest: handleDeleteBlockRequest
        }),
        TableRowOverflowGuard.configure({
          enabled: Boolean(pageMetrics),
          pageMetrics
        }),
        ...editorExtensions.map(extension => extension.name === 'undoRedo' ? extension.configure({ historyRef }) : extension),
        documentPlaceholderExtension,
        ...(viewPage
          ? [
              PaginationExtension.configure({
                pageMetrics,
                pageNumber: pageNumber || "none",
                gapHeight: 50,
                footnoteMaxAreaRatio: 0.35,
                footnoteChromeHeight: 18,
                onPaginationUpdate: handlePaginationUpdate
              })
            ]
          : [])
      ],
      content: "",
      editable: Boolean(editable),
      // 본문 에디터가 마운트·재생성될 때 제목이나 다른 컨트롤의 포커스를 가져가지 않도록 처리
      autofocus: false,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          spellcheck: "false",
          class:
            "prose prose-sm sm:prose-base focus:outline-none w-full tiptap-main-canvas printable-area",
          style: pageMetrics
            ? `
      width: ${pageMetrics.width}px
      ;
      /* 상하 패딩은 제거하고 좌우 패딩만 유지 */
      padding-top: ${viewPage ? 0 : pageMetrics.padding.top}px;
      padding-bottom: ${viewPage ? 0 : pageMetrics.padding.bottom}px;
      padding-left: ${pageMetrics.padding.left}px;
      padding-right: ${pageMetrics.padding.right}px;
      min-height: ${pageMetrics.pageHeightPx}px;
      background: ${viewPage ? "transparent" : "white"};
      margin: 0 auto;
      line-height: ${pageMetrics?.lineHeight} !important;
    `
            : ""
        }
      },
      onCreate: ({ editor: currentEditor }) => {
        editorRef.current = currentEditor;
        currentEditor.storage.codexDocumentLock.applying = true;
        const restored = restoreValidatedNotePersistenceHtml(currentEditor, value);
        currentEditor.storage.codexDocumentLock.applying = false;
        historyRef.current.restoring = false;
        if (!restored.ok) {
          onNotePersistenceRejected?.(restored.error);
          return;
        }
        migrateMathStrings(currentEditor);
        const finalSnapshot = capturePersistenceSnapshot("initial-restore");
        if (!finalSnapshot) return;
        lastContentRef.current = finalSnapshot.html;
        onEditorReady?.(currentEditor);
        if (historyRef.current.restoreFocus) {
          historyRef.current.restoreFocus = false;
          currentEditor.commands.focus(Math.min(historyRef.current.anchor || 1, currentEditor.state.doc.content.size), { scrollIntoView: false });
        }
      },
      onMount: ({ editor: currentEditor }) => {
        editorRef.current = currentEditor;
        setEditor(currentEditor);
        onEditorReady?.(currentEditor);
      },
      onUnmount: ({ editor: currentEditor }) => {
        if (editorRef.current === currentEditor) editorRef.current = null;
        // 이전 뷰가 새 뷰 마운트 이후에 언마운트될 수 있음
        setEditor(activeEditor => activeEditor === currentEditor ? null : activeEditor);
      },
      onUpdate: () => {
        if (codexLockedRef.current || editorRef.current?.storage.codexDocumentLock?.applying) return;
        debouncedOnChange();
      },
      onTransaction: ({ editor: currentEditor, transaction }) => {
        const source = transaction.getMeta('dockitExternalContent');
        if (source !== undefined) lastContentRef.current = source;
        if (currentEditor.isFocused && transaction.steps.some(step => step.jsonID === 'dockitDocumentMetadata' &&
          ['docSetting', 'viewPage', 'pageNumber'].some(key => JSON.stringify(step.before[key]) !== JSON.stringify(step.after[key])))) {
          historyRef.current.restoreFocus = true;
          historyRef.current.anchor = transaction.selection.anchor;
        }
      }
    },
    // Tiptap은 생명주기 콜백을 최신 options ref로 전달하므로 재생성 기준은 에디터 구조 설정으로만 제한
    // (콜백은 EditorContext가 마운트된 에디터를 알릴 때 바뀔 수 있어서, 여기 넣으면 파괴 → 컨텍스트 갱신 → 파괴 반복)
    [viewPage, pageMetrics, pageNumber]
  );

  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta("uiLanguage", uiLanguage).setMeta("addToHistory", false));
  }, [editor, uiLanguage]);

  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.storage.codexDocumentLock.locked = codexLocked;
    if (codexLocked) {
      clearTimeout(onChangeTimeoutRef.current);
      setPendingDeleteTarget(null);
      setSelectedObject(null);
      editor.setEditable(false, false);
    }
  }, [codexLocked, editor, setSelectedObject]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !isEditable) return undefined;
    let disposed = false;
    let runtime = null;

    import("../../extensions/noteInteractionRuntime")
      .then(({ installNoteInteractionRuntime }) => {
        if (disposed || editor.isDestroyed) return;
        runtime = installNoteInteractionRuntime({
          actor: noteActor,
          editor,
          insertNote: insertNoteAtRememberedSelection,
          onDocumentOperationSettled,
          onDocumentOperationWillApply
        });
        setTrackedNoteExecutor(runtime.trackedNoteExecutor);
      })
      .catch((error) => {
        if (!disposed) {
          console.error("Note interaction runtime load failed:", error);
        }
      });

    return () => {
      disposed = true;
      runtime?.dispose();
      setTrackedNoteExecutor((current) =>
        current === runtime?.trackedNoteExecutor ? null : current
      );
    };
  }, [
    editor,
    insertNoteAtRememberedSelection,
    isEditable,
    noteActor,
    onDocumentOperationSettled,
    onDocumentOperationWillApply
  ]);

  useEffect(() => {
    if (!trackedNoteExecutor) return undefined;
    return registerTrackedNoteExecutor(trackedNoteExecutor.execute);
  }, [registerTrackedNoteExecutor, trackedNoteExecutor]);

  // 성공한 작업의 되돌리기는 별도의 비공개 에디터 호스트에서 처리
  // (검증된 로컬 스냅샷과 추가 전용 저널 증거로만 변경 가능)
  useEffect(() => {
    if (!editor || editor.isDestroyed || !isEditable || !noteActor ||
      !documentOwnerUid || !documentId) return undefined;
    let disposed = false;
    let unregister = null;
    import("../../utils/documentOperationRollbackUtils")
      .then(({ createDocumentOperationRollbackAdapter }) => {
        if (disposed || editor.isDestroyed) return;
        const adapter = createDocumentOperationRollbackAdapter({
          actor: noteActor,
          documentId,
          editor,
          onDocumentOperationSettled: settleRollbackDocumentOperation,
          uid: documentOwnerUid
        });
        if (adapter) {
          unregister = registerDocumentOperationRollbackAdapter(adapter);
        }
      })
      .catch(() => {});
    return () => { disposed = true; unregister?.(); };
  }, [
    documentId,
    documentOwnerUid,
    editor,
    isEditable,
    noteActor,
    registerDocumentOperationRollbackAdapter,
    settleRollbackDocumentOperation
  ]);

  useEffect(() => {
    if (!viewPage) {
      setPaginationViewModel(null);
    }
  }, [viewPage]);

  const editorStyleVariables = useMemo(() => {
    const theme = setting?.theme || "mint";
    const accentColor = currentColors[theme][9];
    const inlineTagColor = currentColors[theme][2];
    const contentBackgroundColor = currentColors.white?.[9] || "#f5f5f5";
    const paginationToneColor = currentColors.white?.[6] || "#a3a3a3";

    return {
      ...generateCssVariables(bulletStyle),
      "--editor-selection-accent": accentColor,
      "--editor-selection-accent-soft": withAlpha(accentColor, 0.2),
      "--editor-selection-contrast": currentColors.white[10],
      "--inline-tag-bg": inlineTagColor,
      "--inline-tag-border": withAlpha(accentColor, 0.55),
      "--inline-tag-shadow": withAlpha(inlineTagColor, 0.28),
      "--editor-page-gap-bg": contentBackgroundColor,
      "--editor-page-break-text": paginationToneColor,
      "--editor-page-break-line": paginationToneColor,
      "--editor-page-segment-fill": withAlpha(accentColor, 0.06),
      "--editor-page-segment-border": withAlpha(accentColor, 0.18),
      "--editor-page-segment-note": withAlpha(accentColor, 0.12)
    };
  }, [bulletStyle, currentColors, setting?.theme]);

  const paginationSegmentModel = useMemo(
    () =>
      buildPaginationPageSegmentModel({
        input: paginationViewModel?.input,
        plan: paginationViewModel?.plan,
        pageMap: paginationViewModel?.pageMap,
        pageMetrics: paginationViewModel?.pageMetrics || pageMetrics,
        gapHeight: paginationViewModel?.gapHeight ?? 50,
        viewPage
      }),
    [pageMetrics, paginationViewModel, viewPage]
  );

  const updateActiveRulerPage = useCallback(() => {
    if (!showRulers || !editor || editor.isDestroyed) {
      return;
    }

    const nextPageNumber = resolveActivePageNumber(
      paginationSegmentModel,
      editor.state.selection.anchor
    );

    setActiveRulerPageNumber((prev) =>
      prev === nextPageNumber ? prev : nextPageNumber
    );
  }, [editor, paginationSegmentModel, showRulers]);

  useEffect(() => {
    if (!showRulers || !editor || editor.isDestroyed) {
      setActiveRulerPageNumber(1);
      return;
    }

    updateActiveRulerPage();
    editor.on("selectionUpdate", updateActiveRulerPage);
    editor.on("transaction", updateActiveRulerPage);

    return () => {
      editor.off("selectionUpdate", updateActiveRulerPage);
      editor.off("transaction", updateActiveRulerPage);
    };
  }, [editor, showRulers, updateActiveRulerPage]);

  const shouldUsePaginationContentMirror = Boolean(
    isPaginationMirrorEnabled &&
    viewPage &&
    paginationSegmentModel &&
    paginationMirrorSnapshot?.outerHtml
  );

  const { selectedObjectRef, handleSelectionUpdate, handleDoubleClick, handleReadOnlyObjectPointerEvent, handleTextSelectionMouseDown } = useContentEditorObjectSelection(editor, isEditable, selectedObject, setSelectedObject, rememberTextSelection);

  const { syncHeadingStyles, throttledSyncHeadingStyles } = useContentEditorHeadingStyles(editor);

  useEffect(() => {
    if (!viewPage || !paginationSegmentModel || !isPaginationMirrorEnabled) {
      setPaginationMirrorSnapshot(null);
      return undefined;
    }

    let rafId = requestAnimationFrame(() => {
      capturePaginationMirrorSnapshot();
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [
    capturePaginationMirrorSnapshot,
    isPaginationMirrorEnabled,
    paginationSegmentModel,
    value,
    viewPage
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setIsPaginationMirrorEnabled(
      window.__dockitEnablePaginationMirror === true
    );
  }, [paginationSegmentModel]);

  useEffect(() => {
    if (typeof window === "undefined" || !editor || editor.isDestroyed) {
      return undefined;
    }

    // Spike 디버그용: 브라우저 콘솔에서 editor command를 직접 호출할 수 있도록 노출
    window.__dockitEditor = editor;

    return () => {
      if (window.__dockitEditor === editor) {
        delete window.__dockitEditor;
      }
    };
  }, [editor]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    if (!paginationSegmentModel) {
      delete window.__dockitPaginationTrueSegment;
      delete window.__dockitPaginationContentSegmentRender;
      return undefined;
    }

    window.__dockitPaginationTrueSegment = paginationSegmentModel;
    window.__dockitPaginationContentSegmentRender = {
      model: paginationSegmentModel,
      pageMap:
        paginationViewModel?.pageMap || paginationViewModel?.plan?.pageMap,
      mirrorSnapshotLength: paginationMirrorSnapshot?.htmlLength || 0,
      renderMode: shouldUsePaginationContentMirror ? "mirror" : "segments",
      mirrorFeatureEnabled: isPaginationMirrorEnabled
    };

    return () => {
      if (window.__dockitPaginationTrueSegment === paginationSegmentModel) {
        delete window.__dockitPaginationTrueSegment;
      }

      delete window.__dockitPaginationContentSegmentRender;
    };
  }, [
    isPaginationMirrorEnabled,
    paginationMirrorSnapshot?.htmlLength,
    paginationViewModel,
    paginationSegmentModel,
    shouldUsePaginationContentMirror
  ]);

  useContentEditorPrintFixups(viewPage, editorContainerRef, printInlineFixupsRef);

  // 에디터 생명주기 관리
  useEffect(() => {
    // editor가 없거나 이미 파괴되었다면 중단, focus가 없을 때는 중단
    const editorView = getEditorViewSafely(editor);

    if (!editor || editor.isDestroyed || !editorMounted || !editorView) return;

    setEditor(editor);

    const editorDom = editorView.dom;
    // A. 기존 이벤트 리스너들
    editor.on("update", throttledSyncHeadingStyles);
    editor.on("selectionUpdate", throttledSyncHeadingStyles);

    // B. 변경된 선택 로직
    editor.on("selectionUpdate", handleSelectionUpdate);

    // transaction 핸들러
    const handleTransaction = ({ transaction }) => {
      if (transaction.docChanged) {
        // 외부 문서 복원 시 에디터 update 이벤트가 생략될 수 있음
        throttledSyncHeadingStyles();
        mapRememberedTextSelection(transaction);
        handleSelectionUpdate();
      }
    };
    editor.on("transaction", handleTransaction);

    // C. 읽기 전용 경로에서는 객체 클릭/선택을 DOM 단계에서 차단
    editorDom.addEventListener(
      "mousedown",
      handleReadOnlyObjectPointerEvent,
      true
    );
    editorDom.addEventListener("mousedown", handleTextSelectionMouseDown, true);
    editorDom.addEventListener("click", handleReadOnlyObjectPointerEvent, true);
    editorDom.addEventListener(
      "dblclick",
      handleReadOnlyObjectPointerEvent,
      true
    );

    // editorDom이 확실히 존재할 때만 리스너 추가
    editorDom.addEventListener("dblclick", handleDoubleClick);

    const handleMouseOver = (event) => {
      const anchorElement = getHoveredAnchorWithinEditor(
        event.target,
        editorDom
      );

      if (!anchorElement) {
        return;
      }

      showHoveredLinkPreview(anchorElement);
    };

    const handleMouseOut = (event) => {
      const anchorElement = getHoveredAnchorWithinEditor(
        event.target,
        editorDom
      );

      if (
        !shouldHideHoveredLinkPreview({
          anchorElement,
          relatedTarget: event.relatedTarget,
          activeHoveredAnchor: activeHoveredLinkRef.current
        })
      ) {
        return;
      }

      scheduleHideHoveredLinkPreview();
    };

    editorDom.addEventListener("mouseover", handleMouseOver);
    editorDom.addEventListener("mouseout", handleMouseOut);

    // D. 초기 상태 동기화
    syncHeadingStyles();
    handleSelectionUpdate();

    // 정리 함수
    return () => {
      // 이벤트 리스너 제거
      editor.off("update", throttledSyncHeadingStyles);
      editor.off("selectionUpdate", throttledSyncHeadingStyles);
      editor.off("selectionUpdate", handleSelectionUpdate);
      editor.off("transaction", handleTransaction);

      // DOM 리스너 제거
      if (editorDom) {
        editorDom.removeEventListener(
          "mousedown",
          handleReadOnlyObjectPointerEvent,
          true
        );
        editorDom.removeEventListener(
          "mousedown",
          handleTextSelectionMouseDown,
          true
        );
        editorDom.removeEventListener(
          "click",
          handleReadOnlyObjectPointerEvent,
          true
        );
        editorDom.removeEventListener(
          "dblclick",
          handleReadOnlyObjectPointerEvent,
          true
        );
        editorDom.removeEventListener("dblclick", handleDoubleClick);
        editorDom.removeEventListener("mouseover", handleMouseOver);
        editorDom.removeEventListener("mouseout", handleMouseOut);
      }

      if (onChangeTimeoutRef.current) {
        clearTimeout(onChangeTimeoutRef.current);
      }

      clearHoverPreviewHideTimeout();
      if (selectedObjectRef.current) {
        selectedObjectRef.current = null;
        setSelectedObject(null);
      }
    };
  }, [
    editor,
    editorMounted,
    setEditor,
    throttledSyncHeadingStyles,
    syncHeadingStyles,
    clearHoverPreviewHideTimeout,
    handleSelectionUpdate,
    handleDoubleClick,
    handleReadOnlyObjectPointerEvent,
    handleTextSelectionMouseDown,
    mapRememberedTextSelection,
    isEditable,
    scheduleHideHoveredLinkPreview,
    setSelectedObject,
    selectedObjectRef,
    showHoveredLinkPreview
  ]);

  useEffect(() => {
    if (!hoveredLinkPreview) {
      return;
    }

    const updateHoveredLinkPreview = () => {
      const anchorElement = activeHoveredLinkRef.current;

      if (!anchorElement || !anchorElement.isConnected) {
        hideHoveredLinkPreview();
        return;
      }

      const nextPreview = createExternalLinkPreview(anchorElement);

      if (!nextPreview) {
        hideHoveredLinkPreview();
        return;
      }

      setHoveredLinkPreview(nextPreview);
    };

    window.addEventListener("resize", updateHoveredLinkPreview);
    window.addEventListener("scroll", updateHoveredLinkPreview, true);

    return () => {
      window.removeEventListener("resize", updateHoveredLinkPreview);
      window.removeEventListener("scroll", updateHoveredLinkPreview, true);
    };
  }, [hideHoveredLinkPreview, hoveredLinkPreview]);

  // 이미지가 선택된 상태일 때 에디터 비활성화
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    const shouldBlockTextEditingForSelection = shouldBlockTextEditing({
      isEditable,
      selectedObjectType: selectedObject?.node?.type?.name
    });

    // 이미지 또는 도형이 선택된 상태일 때는 에디터를 비활성화 (isEditable도 고려)
    // queueMicrotask: setEditable 내부의 flushSync가 React 라이프사이클과 충돌하지 않도록 지연
    const newEditable = !codexLocked && isEditable && !shouldBlockTextEditingForSelection;
    queueMicrotask(() => {
      if (!editor.isDestroyed) {
        editor.setEditable(newEditable);
      }
    });
  }, [editor, selectedObject, isEditable, codexLocked]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || isEditable) return;

    const editorView = getEditorViewSafely(editor);
    const editorDom = editorView?.dom;

    if (!editorDom) return;

    editorDom
      .querySelectorAll(".row-resize-handle, .ProseMirror-selectednode")
      .forEach((element) => {
        if (element.classList.contains("row-resize-handle")) {
          element.remove();
          return;
        }

        element.classList.remove("ProseMirror-selectednode");
      });
  }, [editor, isEditable]);

  // 외부 value 변경 시 동기화
  // (setContent가 React 노드 뷰를 flushSync로 그리므로 커밋 중이 아닌 마이크로태스크로 지연, 새 value가 오거나 언마운트되면 대기 중인 동기화 취소)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    return deferEditorWrite(editor, () => {
      // 1. 현재 에디터의 HTML 가져오기
      const editorHTML = editor.getHTML();

      // 2. 외부에서 들어온 value가 현재 에디터 내용과 다르고,
      //    마지막으로 내가 저장했던 내용(lastContentRef)과도 다를 때만 업데이트
      if (value !== editorHTML && value !== lastContentRef.current) {
        const { from, to } = editor.state.selection; // 현재 커서 위치 저장

        editor.storage.codexDocumentLock.applying = true;
        let restored;
        try { restored = restoreValidatedNotePersistenceHtml(editor, value); }
        finally { editor.storage.codexDocumentLock.applying = false; }
        if (!restored.ok) {
          onNotePersistenceRejected?.(restored.error);
          return;
        }
        lastContentRef.current = restored.html; // 정규화한 저장 기준값
        onNotePersistenceStatus?.({ source: "external-restore", status: "valid" });

        // 선택적으로 커서 위치 복구 (필요한 경우)
        const end = editor.state.doc.content.size;
        editor.commands.setTextSelection({ from: Math.min(from, end), to: Math.min(to, end) });
      } else if (value === editorHTML && value !== lastContentRef.current) {
        lastContentRef.current = value;
      }
    });
  }, [value, editor, onNotePersistenceRejected, onNotePersistenceStatus]);

  return (
    <div
      ref={editorContainerRef}
      id={pagesId}
      className={`relative w-full tiptap-container ${viewPage ? "is-view-page" : ""} ${!isEditable ? "is-readonly" : ""}`}
      style={{ ...editorStyleVariables }}
    >
      {showRulers && (
        <PageRulers
          activePageNumber={activeRulerPageNumber}
          pageMetrics={paginationSegmentModel?.pageMetrics || pageMetrics}
          paginationModel={paginationSegmentModel}
        />
      )}
      {paginationSegmentModel && (
        <div
          aria-hidden="true"
          className="tiptap-page-shell-layer"
          style={{ height: `${paginationSegmentModel.totalHeight}px` }}
        >
          {paginationSegmentModel.pages.map((page) => (
            <div
              key={page.pageNumber}
              className="tiptap-page-shell"
              data-pagination-page={page.pageNumber}
              data-pagination-start-pos={page.startPos ?? ""}
              data-pagination-end-pos={page.endPos ?? ""}
              data-pagination-block-range={page.blockRangeLabel}
              data-pagination-break-reason={page.breakReason ?? ""}
              data-pagination-spanning-block-count={page.spanningBlockCount}
              style={{
                top: `${page.top}px`,
                width: `${paginationSegmentModel.pageMetrics.width}px`,
                height: `${paginationSegmentModel.pageMetrics.pageHeightPx}px`
              }}
            >
              <div className="tiptap-page-shell__paper" />
              <div
                className="tiptap-page-shell__margin-marks"
                style={{
                  "--page-content-top": `${page.contentFrameTop}px`,
                  "--page-content-left": `${page.contentFrameLeft}px`,
                  "--page-content-right": `${
                    page.contentFrameLeft + page.contentFrameWidth
                  }px`,
                  "--page-content-bottom": `${
                    page.contentFrameTop + page.contentFrameHeight
                  }px`
                }}
              >
                <span className="tiptap-page-shell__margin-mark tiptap-page-shell__margin-mark--top-left" />
                <span className="tiptap-page-shell__margin-mark tiptap-page-shell__margin-mark--top-right" />
                <span className="tiptap-page-shell__margin-mark tiptap-page-shell__margin-mark--bottom-left" />
                <span className="tiptap-page-shell__margin-mark tiptap-page-shell__margin-mark--bottom-right" />
              </div>
              <div
                className="tiptap-page-shell__content-frame"
                data-pagination-content-render={
                  shouldUsePaginationContentMirror ? "mirror" : "segments"
                }
                data-pagination-content-segment-count={
                  page.contentSegments.length
                }
                data-pagination-content-offset-top={page.contentOffsetTop}
                data-pagination-content-offset-left={page.contentOffsetLeft}
                style={{
                  top: `${page.contentFrameTop}px`,
                  left: `${page.contentFrameLeft}px`,
                  width: `${page.contentFrameWidth}px`,
                  height: `${page.contentFrameHeight}px`
                }}
              >
                <div
                  className="tiptap-page-shell__segment-fill"
                  style={{
                    height: `${page.filledHeight}px`
                  }}
                />
                {shouldUsePaginationContentMirror &&
                paginationMirrorSnapshot?.outerHtml ? (
                  <div className="tiptap-page-shell__mirror-host">
                    <div
                      className="tiptap-page-shell__mirror-canvas"
                      style={{
                        transform: `translate(${-page.contentOffsetLeft}px, -${page.contentOffsetTop}px)`
                      }}
                      dangerouslySetInnerHTML={{
                        __html: paginationMirrorSnapshot.outerHtml
                      }}
                    />
                  </div>
                ) : (
                  <div className="tiptap-page-shell__segment-content">
                    {page.contentSegments.map((segment) => (
                      <div
                        key={segment.id}
                        className={`tiptap-page-shell__segment-item tiptap-page-shell__segment-item--${segment.renderType}${segment.continuesFromPrevious ? " is-continuation-start" : ""}${segment.continuesToNext ? " is-continuation-end" : ""}${segment.isMergedTableRow ? " is-merged-row" : ""}${segment.showSegmentMarker ? " has-segment-marker" : ""}`}
                        data-segment-pos={segment.pos}
                        data-segment-kind={segment.kind}
                        data-segment-block-pos={segment.blockPos}
                        data-segment-block-type={segment.blockType}
                        data-segment-debug-label={segment.debugLabel}
                        title={segment.debugLabel}
                        style={{
                          top: `${segment.pageLocalTop}px`,
                          left: `${segment.localLeft}px`,
                          width: `${segment.localWidth}px`,
                          height: `${segment.localHeight}px`,
                          "--segment-marker-gutter-width": `${Math.max(
                            18,
                            segment.segmentMarkerGutterWidth || 18
                          )}px`
                        }}
                      >
                        {segment.showSegmentMarker && (
                          <span
                            className={`tiptap-page-shell__segment-marker tiptap-page-shell__segment-marker--${segment.segmentMarkerKind || "bullet"}`}
                            data-marker-kind={
                              segment.segmentMarkerKind || "bullet"
                            }
                            data-list-depth={segment.segmentMarkerDepth ?? 0}
                            data-list-ordinal={
                              segment.segmentMarkerOrdinal ?? ""
                            }
                          >
                            {segment.segmentMarkerText || "•"}
                          </span>
                        )}
                        {segment.showMergedGroupBadge && (
                          <span className="tiptap-page-shell__segment-flag">
                            {uiText("병합 행 묶음")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {page.footnoteReservedHeight > 0 &&
                paginationViewModel?.footnoteProjection?.segments
                  .filter((segment) => segment.pageNumber === page.pageNumber)
                  .map((segment, segmentIndex, pageSegments) => (
                    <div
                      key={`${segment.noteId}:${segment.segmentIndex}`}
                      className={`dockit-footnote-screen-projection${segment.canonical ? "" : " dockit-footnote-screen-projection--continuation"}`}
                      data-footnote-id={segment.noteId}
                      data-footnote-fragment={segment.segmentIndex}
                      data-footnote-canonical={
                        segment.canonical ? "true" : "false"
                      }
                      title={
                        segment.canonical
                          ? undefined
                          : uiText("각주 시작 위치로 이동")
                      }
                      onMouseDown={
                        segment.canonical
                          ? undefined
                          : (event) => {
                              if (event.button !== 0) return;
                              event.preventDefault();
                              focusCanonicalFootnoteBody(
                                editor,
                                segment.noteId
                              );
                            }
                      }
                      style={{
                        left: `${page.contentFrameLeft}px`,
                        width: `${page.contentFrameWidth}px`,
                        bottom: `${
                          page.contentFrameBottom +
                          pageSegments
                            .slice(segmentIndex + 1)
                            .reduce(
                              (total, following) => total + following.height,
                              0
                            )
                        }px`,
                        height: `${segment.height}px`
                      }}
                    >
                      <FootnoteProjectionContent
                        editor={editor}
                        projection={segment}
                      />
                    </div>
                  ))}
              {page.footnoteChromeHeight > 0 &&
                paginationViewModel?.footnoteProjection?.segments?.some(
                  (segment) => segment.pageNumber === page.pageNumber
                ) && (
                  <div
                    aria-hidden="true"
                    className="dockit-footnote-screen-projection__separator"
                    style={{
                      left: `${page.contentFrameLeft}px`,
                      width: `${page.contentFrameWidth}px`,
                      bottom: `${page.contentFrameBottom + page.footnoteBodyHeight}px`,
                      height: `${page.footnoteChromeHeight}px`
                    }}
                  >
                    <span className="dockit-footnote-screen-projection__continuation">
                      {paginationViewModel.footnoteProjection.segments.find(
                        (segment) =>
                          segment.pageNumber === page.pageNumber &&
                          segment.continuationFromPreviousLabel
                      )?.continuationFromPreviousLabel || ""}
                    </span>
                    <span className="dockit-footnote-screen-projection__continuation">
                      {[...paginationViewModel.footnoteProjection.segments]
                        .reverse()
                        .find(
                          (segment) =>
                            segment.pageNumber === page.pageNumber &&
                            segment.continuationToNextLabel
                        )?.continuationToNextLabel || ""}
                    </span>
                  </div>
                )}
              {/* {page.topLabel && (
                <div
                  className="tiptap-page-shell__segment-badge"
                  style={{
                    top: `${Math.max(
                      8,
                      (paginationSegmentModel.pageMetrics.padding.top || 0) / 3
                    )}px`,
                    left: `${paginationSegmentModel.pageMetrics.padding.left}px`
                  }}
                >
                  {page.topLabel}
                </div>
              )}
              {page.bottomLabel && (
                <div
                  className="tiptap-page-shell__segment-note"
                  style={{
                    left: `${paginationSegmentModel.pageMetrics.padding.left}px`,
                    bottom: `${Math.max(
                      8,
                      (paginationSegmentModel.pageMetrics.padding.bottom || 0) /
                        3
                    )}px`
                  }}
                >
                  {page.bottomLabel}ㅁㄴㅇ
                </div>
              )} */}
              {pageNumber && pageNumber !== "none" && (
                <div
                  className="tiptap-page-shell__footer"
                  style={{
                    pointerEvents: "none"
                  }}
                >
                  <span
                    className="tiptap-page-shell__number"
                    style={{
                      left: `${paginationSegmentModel.pageMetrics.padding.left}px`,
                      right: `${paginationSegmentModel.pageMetrics.padding.right}px`,
                      bottom: `${Math.max(
                        0,
                        getPageNumberBottomOffset(
                          paginationSegmentModel.pageMetrics
                        )
                      )}px`,
                      textAlign: pageNumber
                    }}
                  >
                    - {page.pageNumber} -
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {viewPage &&
        pageNumber &&
        pageNumber !== "none" &&
        paginationSegmentModel && (
          <div
            aria-hidden="true"
            className="tiptap-print-fixed-page-number-layer"
          >
            {paginationSegmentModel.pages.map((page) => (
              <div
                key={`print-page-number-${page.pageNumber}`}
                className="tiptap-print-fixed-page-number"
                data-page-number-position={pageNumber}
                data-page-number={page.pageNumber}
                style={{
                  top: `${
                    page.pageNumber *
                      paginationSegmentModel.pageMetrics.pageHeightPx -
                    Math.max(
                      0,
                      getPageNumberBottomOffset(
                        paginationSegmentModel.pageMetrics
                      )
                    )
                  }px`,
                  width: `${paginationSegmentModel.pageMetrics.width}px`,
                  paddingLeft: `${paginationSegmentModel.pageMetrics.padding.left}px`,
                  paddingRight: `${paginationSegmentModel.pageMetrics.padding.right}px`,
                  textAlign: pageNumber
                }}
              >
                <span className="tiptap-print-fixed-page-number__text">
                  - {page.pageNumber} -
                </span>
              </div>
            ))}
          </div>
        )}
      <div
        className={`relative z-10 tiptap-editor-flow-layer${shouldUsePaginationContentMirror ? " is-segment-mirrored" : ""}`}
        onMouseDownCapture={(event) => {
          if (event.button !== 0) return;
          if (
            focusFootnoteContinuationAtPoint({
              editor,
              root: event.currentTarget.parentElement,
              clientX: event.clientX,
              clientY: event.clientY
            })
          ) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {editor && !selectedObject && isEditable && (
          <TypeBubble
            editor={editor}
            onDocumentOperationSettled={onDocumentOperationSettled}
            onDocumentOperationWillApply={onDocumentOperationWillApply}
          />
        )}
        {editor && <EditorContent editor={editor} />}
      </div>
      <ExternalLinkPreviewPopover
        preview={hoveredLinkPreview}
        onMouseEnter={clearHoverPreviewHideTimeout}
        onMouseLeave={scheduleHideHoveredLinkPreview}
      />
      {isEditable && (
        <EditorBlockDeleteModal
          open={Boolean(pendingDeleteTarget)}
          targetLabel={pendingDeleteTarget?.label}
          onConfirm={confirmPendingDelete}
          onClose={closePendingDeleteModal}
        />
      )}
    </div>
  );
}
