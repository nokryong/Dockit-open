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
import { createExternalLinkPreview } from "../../utils/externalLinkPreviewUtils";
import { migrateMathStrings } from "@tiptap/extension-mathematics";
import Placeholder from "@tiptap/extension-placeholder";
import { Selection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { editorExtensions } from "@/app/LIB/constant/editorExtensions";
import { useThrottle } from "../../hook/useThrottle";
import { PaginationExtension } from "../../extensions/PaginationExtension";
import DeleteBehaviorGuard from "../../extensions/DeleteBehaviorGuard";
import TableRowOverflowGuard from "../../extensions/TableRowOverflowGuard";
import CodexDocumentLock from '../../extensions/CodexDocumentLock';
import { getEditorViewSafely } from "../../utils/editorViewUtils";
import { getListMarkerStyles } from "../../utils/listMarkerStyleUtils";
import { useSetting } from "../../context/SettingContext";
import { useDarkMode } from "../../context/DarkModeContext";
import { buildPaginationPageSegmentModel } from "../../pagination/render/buildPaginationPageSegmentModel";
import { createPaginationMirrorSnapshot } from "../../pagination/render/createPaginationMirrorSnapshot";
import {
  focusCanonicalFootnoteBody,
  focusFootnoteContinuationAtPoint,
  mountCanonicalFootnoteBody,
  mountFootnoteProjectionClone
} from "../../pagination/render/mountFootnoteProjectionClone";
import { isTocTitleText } from "../../utils/captionUtils";
import {
  isDoubleClickPanelObjectType,
  isPanelObjectType,
  isTocEntryNode,
  isTextEditBlockingObjectType
} from "../../utils/editorContractUtils";
import {
  getHoveredAnchorWithinEditor,
  isReadOnlyObjectTarget,
  isTextRangeSelection,
  resolveSelectionObjectAction,
  shouldHandleReadOnlyObjectPointer,
  shouldBlockTextEditing,
  shouldHideHoveredLinkPreview,
  shouldCollapseTextSelectionOnMouseDown
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

const withAlpha = (color, alpha) => {
  if (typeof color !== "string") return color;

  const normalized = color.trim();

  if (normalized.startsWith("#")) {
    let hex = normalized.slice(1);

    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((char) => char + char)
        .join("");
    }

    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }

  if (normalized.startsWith("rgb(")) {
    return normalized.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }

  return color;
};

const isTocTitleParagraph = (node) =>
  node?.type?.name === "paragraph" && isTocTitleText(node.textContent);

const resolveActivePageNumber = (paginationSegmentModel, position) => {
  const pages = paginationSegmentModel?.pages || [];

  if (pages.length === 0 || !Number.isFinite(position)) {
    return 1;
  }

  const explicitMatch = pages.find((page) => {
    if (!Number.isFinite(page.startPos) || !Number.isFinite(page.endPos)) {
      return false;
    }

    return position >= page.startPos && position <= Math.max(page.startPos, page.endPos);
  });

  if (explicitMatch) {
    return explicitMatch.pageNumber;
  }

  const closestPreviousPage = [...pages]
    .reverse()
    .find((page) => Number.isFinite(page.startPos) && page.startPos <= position);

  return closestPreviousPage?.pageNumber || 1;
};

const resolveDeleteRangeFromObjectId = (doc, target) => {
  if (!doc || !target?.objectId) {
    return null;
  }

  let resolvedRange = null;

  doc.descendants((node, pos) => {
    if (resolvedRange) {
      return false;
    }

    if (
      node.type.name === target.typeName &&
      node.attrs?.objectId === target.objectId
    ) {
      resolvedRange = {
        from: pos,
        to: pos + node.nodeSize
      };
      return false;
    }

    return true;
  });

  return resolvedRange;
};

const FootnoteProjectionContent = ({ editor, projection }) => {
  useI18n();
  const hostRef = useRef(null);
  useLayoutEffect(
    () => (projection.canonical
      ? mountCanonicalFootnoteBody(hostRef.current, projection, {
          editorRoot: editor?.view?.dom
        })
      : mountFootnoteProjectionClone(hostRef.current, projection)),
    [editor, projection]
  );
  return <div ref={hostRef} className="dockit-footnote-screen-projection__clip" />;
};

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
      // The body editor must never steal focus from the title or another
      // control when it mounts or is recreated.
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
        // A previous view can unmount after its replacement has already mounted.
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
    // Tiptap forwards lifecycle callbacks through its latest options ref. Keep
    // this recreation boundary limited to structural editor configuration.
    // Callback identities can change when EditorContext publishes the mounted
    // editor; including them here creates a destroy -> context update -> destroy
    // loop.
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

  // Successful-operation rollback is a separate private editor host. It can
  // mutate only through validated local snapshot and append-only journal proof.
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

  // 이전 선택 상태를 저장하여 불필요한 업데이트 방지
  const lastSelectionRef = useRef(null);

  // selectedObject를 ref로 추적하여 콜백 의존성 순환 방지
  const selectedObjectRef = useRef(selectedObject);
  useEffect(() => {
    selectedObjectRef.current = selectedObject;
  }, [selectedObject]);

  // #1. 선택 위치의 객체 정보를 추출하는 부분 (텍스트 입력 중에도 도형을 감지할 수 있게 함)
  const getObjectInfoFromSelection = useCallback(() => {
    if (!editor) return null;
    const { selection } = editor.state;

    // A. 노드 자체가 선택된 경우 (NodeSelection)
    if (selection.node) {
      const typeName = selection.node.type.name;
      if (isPanelObjectType(typeName)) {
        return {
          node: selection.node,
          from: selection.from,
          to: selection.to,
          type: typeName
        };
      }
    }
    // B. 텍스트 커서 상태일 때 (부모 확인: 테이블 OR 도형)
    else {
      let targetInfo = null;
      for (let depth = selection.$from.depth; depth > 0; depth--) {
        const node = selection.$from.node(depth);
        const name = node.type.name;

        // 테이블과 shapeBlock을 부모로 감지할 수 있게 함
        if (
          name === "table" ||
          name === "tableRow" ||
          name === "tableCell" ||
          name === "tableHeader" ||
          name === "table_row" ||
          name === "table_cell" ||
          name === "table_header" ||
          name === "shapeBlock"
        ) {
          const pos = selection.$from.before(depth);
          targetInfo = {
            node: node,
            from: pos,
            to: pos + node.nodeSize,
            type: name
          };
          break;
        }
      }
      return targetInfo;
    }
  }, [editor]);

  // #2. 선택 변경을 처리하는 부분 (원클릭 동작)
  const handleSelectionUpdate = useCallback(() => {
    if (!editor) return;

    if (!isEditable) {
      if (selectedObjectRef.current) {
        selectedObjectRef.current = null;
        setSelectedObject(null);
      }
      return;
    }

    const { selection } = editor.state;
    const isCellSelection = selection instanceof CellSelection;
    const hasTextRangeSelection = isTextRangeSelection({
      isEmpty: selection.empty,
      hasNodeSelection: Boolean(selection.node),
      isCellSelection
    });

    if (!selection.node) {
      rememberTextSelection(selection);
    }

    const selectionKey = `${selection.$from.pos}-${selection.$to.pos}`;

    if (lastSelectionRef.current === selectionKey) return;
    lastSelectionRef.current = selectionKey;

    const targetInfo = getObjectInfoFromSelection();

    const selectionAction = resolveSelectionObjectAction({
      isEditable,
      targetInfo,
      hasTextRangeSelection,
      activeElementTagName: document.activeElement?.tagName,
      previousSelectedObject: selectedObjectRef.current
    });

    if (selectionAction.action === "keep") {
      return;
    }

    if (selectionAction.action === "clear") {
      setSelectedObject(null);
      return;
    }

    setSelectedObject(selectionAction.value);
  }, [
    editor,
    getObjectInfoFromSelection,
    isEditable,
    rememberTextSelection,
    setSelectedObject
  ]);

  // #3. 더블 클릭을 처리하는 부분 (도형 선택)
  const handleDoubleClick = useCallback(
    (event) => {
      if (!isEditable) {
        return;
      }

      let targetInfo = getObjectInfoFromSelection();

      // DOM 기반 폴백: selection으로 감지 안 될 때도 실제 더블클릭한 객체를 우선 잡습니다.
      if (!targetInfo || !isDoubleClickPanelObjectType(targetInfo.type)) {
        const target = event.target;
        const editorView = getEditorViewSafely(editor);
        const resolveNodeTargetInfoFromWrapper = (wrapperEl, typeName) => {
          if (!wrapperEl || !editorView) {
            return null;
          }

          try {
            const pos = editorView.posAtDOM(wrapperEl, 0);
            const $pos = editor.state.doc.resolve(pos);

            for (let depth = $pos.depth; depth >= 0; depth -= 1) {
              const node = $pos.node(depth);

              if (node.type.name !== typeName) {
                continue;
              }

              const from = depth > 0 ? $pos.before(depth) : pos;

              return {
                node,
                from,
                to: from + node.nodeSize,
                type: typeName
              };
            }

            const nodeAtPos = editor.state.doc.nodeAt(pos);

            if (nodeAtPos && nodeAtPos.type.name === typeName) {
              return {
                node: nodeAtPos,
                from: pos,
                to: pos + nodeAtPos.nodeSize,
                type: typeName
              };
            }
          } catch (e) {
            // posAtDOM 에러 무시
          }

          return null;
        };

        if (target instanceof Element && editorView) {
          const imageEl =
            target.closest(".lazy-image-container") || target.closest("img");

          if (imageEl) {
            targetInfo = resolveNodeTargetInfoFromWrapper(
              imageEl.closest("[data-node-view-wrapper]"),
              "image"
            );
          }

          if (!targetInfo || targetInfo.type !== "image") {
            const shapeEl =
              target.closest(".shape-block-container") ||
              target.closest('[data-type="shape-block"]');

            if (shapeEl) {
              targetInfo = resolveNodeTargetInfoFromWrapper(
                shapeEl.closest("[data-node-view-wrapper]"),
                "shapeBlock"
              );
            }
          }
        }
      }

      // 이미지 또는 도형일 때만 더블클릭으로 선택(툴바 토글)
      if (targetInfo && isDoubleClickPanelObjectType(targetInfo.type)) {
        // selectedObjectRef를 사용하여 의존성 순환 방지
        const isSameObject =
          selectedObjectRef.current &&
          selectedObjectRef.current.from === targetInfo.from;

        if (isSameObject) {
          selectedObjectRef.current = null;
          setSelectedObject(null);
        } else {
          // ref를 먼저 동기 업데이트하여 setNodeSelection이 트리거하는
          // selectionUpdate에서 선택이 초기화되는 race condition 방지
          selectedObjectRef.current = targetInfo;
          setSelectedObject(targetInfo);
          // NodeSelection을 설정하여 outline이 표시되도록 함
          try {
            editor.commands.setNodeSelection(targetInfo.from);
          } catch (e) {
            // NodeSelection 설정 실패 시 무시
          }
        }
      }
    },
    [editor, getObjectInfoFromSelection, isEditable, setSelectedObject]
  );

  const handleReadOnlyObjectPointerEvent = useCallback(
    (event) => {
      const editorView = getEditorViewSafely(editor);
      const editorDom = editorView?.dom;

      if (isEditable || !editorDom) {
        return;
      }

      const isTargetingReadOnlyObject = isReadOnlyObjectTarget(
        event.target,
        editorDom
      );

      if (
        !shouldHandleReadOnlyObjectPointer({
          isEditable,
          hasEditorDom: Boolean(editorDom),
          isTargetingReadOnlyObject
        })
      ) {
        return;
      }

      event.stopPropagation();

      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      if (selectedObjectRef.current) {
        selectedObjectRef.current = null;
        setSelectedObject(null);
      }
    },
    [editor, isEditable, setSelectedObject]
  );

  const handleTextSelectionMouseDown = useCallback(
    (event) => {
      const editorView = getEditorViewSafely(editor);
      const editorDom = editorView?.dom;

      if (!editor || editor.isDestroyed || !editorView || !editorDom) {
        return;
      }

      const clickResult = editorView.posAtCoords({
        left: event.clientX,
        top: event.clientY
      });
      const { selection } = editor.state;
      const shouldCollapseSelection = shouldCollapseTextSelectionOnMouseDown({
        isEditable,
        hasEditorDom: Boolean(editorDom),
        isPrimaryButton: event.button === 0,
        hasModifierKey:
          event.shiftKey || event.metaKey || event.ctrlKey || event.altKey,
        selectionEmpty: selection.empty,
        hasNodeSelection: Boolean(selection.node),
        isCellSelection: selection instanceof CellSelection,
        clickPos: clickResult?.pos,
        selectionFrom: selection.from,
        selectionTo: selection.to,
        targetTagName: event.target?.tagName
      });

      if (!shouldCollapseSelection) {
        return;
      }

      const docSize = editor.state.doc.content.size;
      const clickPos = Math.max(0, Math.min(clickResult.pos, docSize));
      const tr = editor.state.tr.setSelection(
        Selection.near(editor.state.doc.resolve(clickPos))
      );

      editorView.dispatch(tr.scrollIntoView());
      editorView.focus();
      event.preventDefault();
    },
    [editor, isEditable]
  );

  const syncHeadingStyles = useCallback(() => {
    const editorView = getEditorViewSafely(editor);

    if (!editor || editor.isDestroyed || !editorView) {
      return;
    }

    const editorElement = editorView.dom;

    let styleElement = document.getElementById("dynamic-heading-styles");
    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = "dynamic-heading-styles";
      document.head.appendChild(styleElement);
    }

    let allStyles = getListMarkerStyles(editorElement);

    // 1. 헤딩 개별 처리
    ["h1", "h2", "h3", "h4", "h5", "h6"].forEach((tagName) => {
      const tagHeadings = editorElement.querySelectorAll(tagName);

      tagHeadings.forEach((heading, index) => {
        const span = heading.querySelector("span");
        if (span) {
          const computedStyle = window.getComputedStyle(span);

          allStyles += `
            .tiptap-container ${tagName}:nth-of-type(${index + 1})::before {
              font-family: ${computedStyle.fontFamily} !important;
              font-size: ${computedStyle.fontSize} !important;
              font-weight: ${computedStyle.fontWeight} !important;
              color: ${computedStyle.color} !important;
            }
          `;
        }
      });
    });

    styleElement.textContent = allStyles;
  }, [editor]);

  // throttle된 syncHeadingStyles
  const throttledSyncHeadingStyles = useThrottle(syncHeadingStyles, 200);

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

  useEffect(() => {
    if (typeof window === "undefined" || !viewPage) {
      return undefined;
    }

    const restorePrintFixups = () => {
      printInlineFixupsRef.current.forEach(({ element, style }) => {
        if (!element?.isConnected) {
          return;
        }

        if (style === null) {
          element.removeAttribute("style");
          return;
        }

        element.setAttribute("style", style);
      });

      printInlineFixupsRef.current = [];
    };

    const applyPrintFixups = () => {
      restorePrintFixups();

      const nextFixups = [];
      const seen = new Set();
      const rememberElement = (element) => {
        if (!element || seen.has(element)) {
          return;
        }

        seen.add(element);
        nextFixups.push({
          element,
          style: element.getAttribute("style")
        });
      };

      const setImportant = (element, property, value) => {
        element.style.setProperty(property, value, "important");
      };

      const containerElement = editorContainerRef.current;
      if (containerElement) {
        let ancestorElement = containerElement.parentElement;

        while (
          ancestorElement &&
          ancestorElement !== document.body &&
          ancestorElement !== document.documentElement
        ) {
          rememberElement(ancestorElement);
          setImportant(ancestorElement, "overflow", "visible");
          setImportant(ancestorElement, "height", "auto");
          setImportant(ancestorElement, "min-height", "0");
          setImportant(ancestorElement, "max-height", "none");
          ancestorElement = ancestorElement.parentElement;
        }

        containerElement
          .querySelectorAll(".tiptap-page-shell-layer")
          .forEach((element) => {
            rememberElement(element);
            setImportant(element, "display", "none");
            setImportant(element, "visibility", "hidden");
            setImportant(element, "height", "0");
            setImportant(element, "min-height", "0");
            setImportant(element, "max-height", "0");
            setImportant(element, "overflow", "hidden");
          });

        containerElement.querySelectorAll(".page-gap").forEach((element) => {
          rememberElement(element);
          setImportant(element, "display", "none");
          setImportant(element, "height", "0");
          setImportant(element, "min-height", "0");
          setImportant(element, "max-height", "0");
          setImportant(element, "margin", "0");
          setImportant(element, "padding", "0");
          setImportant(element, "overflow", "hidden");
        });

        containerElement
          .querySelectorAll(
            ".tiptap-final-page-filler .page-footer-spacer, .tiptap-page-break-structure--final .page-footer-spacer"
          )
          .forEach((element) => {
            rememberElement(element);
            setImportant(element, "display", "block");
            setImportant(element, "height", "var(--print-footer-height, 0px)");
            setImportant(
              element,
              "min-height",
              "var(--print-footer-height, 0px)"
            );
            setImportant(
              element,
              "max-height",
              "var(--print-footer-height, 0px)"
            );
            setImportant(
              element,
              "margin-top",
              "calc(var(--print-footer-height, 0px) * -1)"
            );
            setImportant(element, "margin-right", "0");
            setImportant(element, "margin-bottom", "0");
            setImportant(element, "margin-left", "0");
            setImportant(element, "padding", "0");
            setImportant(element, "overflow", "visible");
          });
      }

      document.querySelectorAll("#header, .app-layout-footer").forEach((element) => {
        rememberElement(element);
        setImportant(element, "display", "none");
        setImportant(element, "visibility", "hidden");
        setImportant(element, "height", "0");
        setImportant(element, "min-height", "0");
        setImportant(element, "max-height", "0");
        setImportant(element, "overflow", "hidden");
      });

      printInlineFixupsRef.current = nextFixups;
    };

    const handleBeforePrint = () => {
      applyPrintFixups();
    };
    const handleAfterPrint = () => {
      restorePrintFixups();
    };
    const mediaQueryList = window.matchMedia("print");
    const handleMediaChange = (event) => {
      if (event.matches) {
        applyPrintFixups();
        return;
      }

      restorePrintFixups();
    };

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);

    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", handleMediaChange);
    } else if (typeof mediaQueryList.addListener === "function") {
      mediaQueryList.addListener(handleMediaChange);
    }

    return () => {
      restorePrintFixups();
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);

      if (typeof mediaQueryList.removeEventListener === "function") {
        mediaQueryList.removeEventListener("change", handleMediaChange);
      } else if (typeof mediaQueryList.removeListener === "function") {
        mediaQueryList.removeListener(handleMediaChange);
      }
    };
  }, [viewPage]);

  // #에디터 생명주기를 관리하는 부분
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
        // External document restores can suppress the editor's update event.
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

    // Cleanup Function
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

  // #외부 value가 바뀌면 동기화하는 부분
  // setContent가 React 노드 뷰를 flushSync로 그리므로 커밋 중에 실행하지 않고 마이크로태스크로 미룬다.
  // 새 value가 오거나 언마운트되면 대기 중인 동기화를 취소한다.
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
        lastContentRef.current = restored.html; // normalized persisted baseline
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
