"use client";

import { NodeViewWrapper } from "@tiptap/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "@/desktop/dynamic";
import "../css/diagram.css";
import { useSetting } from "../context/SettingContext";
import { useDarkMode } from "../context/DarkModeContext";
import {
  CORNER_HANDLE_SIZE,
  EDGE_HANDLE_LENGTH,
  HANDLE_SIZE,
  createObjectSelectionChrome,
  getObjectSelectionVisibility
} from "./utils/resizeHandleUtils";
import {
  getDiagramSourceKey,
  getSavedDiagramPreview,
  hasDiagramElements,
  parseDiagramScene,
  withDiagramPreview
} from "./utils/diagramSceneUtils";
import {
  closeDiagramEditor,
  getDiagramEditorSession,
  getServerDiagramEditorSession,
  openDiagramEditor,
  subscribeDiagramEditor
} from "./utils/diagramEditorSession";

const DiagramEditorModal = dynamic(
  () => import("./DiagramEditorModal"),
  { ssr: false, loading: () => <div className="diagram-editor-loading" role="status">편집기 여는 중…</div> }
);

const MIN_WIDTH = 260;
const MIN_HEIGHT = 200;
const FULL_WIDTH_SENTINEL = 100;

export default function DiagramBlockView({
  node,
  updateAttributes,
  editor,
  getPos,
  selected
}) {
  const { sceneData, width, height, textAlign } = node.attrs;
  const { setting } = useSetting();
  const { isDarkMode, currentColors } = useDarkMode();

  const frameRef = useRef(null);
  const triggerRef = useRef(null);
  const ownerRef = useRef(Symbol("diagram"));
  const sceneDataRef = useRef(sceneData);
  sceneDataRef.current = sceneData;
  const resizeListenersRef = useRef({ onMouseMove: null, onMouseUp: null });
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef({
    width: 0,
    height: 0,
    mouseX: 0,
    mouseY: 0,
    axis: "xy",
    aspectRatio: 1
  });

  const [isResizing, setIsResizing] = useState(false);
  const [generatedPreview, setGeneratedPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");
  const session = useSyncExternalStore(
    subscribeDiagramEditor,
    getDiagramEditorSession,
    getServerDiagramEditorSession
  );
  const isEditing = session?.owner === ownerRef.current;
  const scene = useMemo(() => parseDiagramScene(sceneData), [sceneData]);
  const sourceKey = useMemo(() => getDiagramSourceKey(scene), [scene]);
  const savedPreview = useMemo(() => getSavedDiagramPreview(scene), [scene]);
  const previewSvg = savedPreview ||
    (generatedPreview?.sourceKey === sourceKey ? generatedPreview.svg : "");
  const hasElements = hasDiagramElements(scene);

  const accentColor = currentColors[setting.theme][7];
  const { canInteract, showSelectionChrome } = getObjectSelectionVisibility({
    editor,
    selected,
    isResizing,
    isEditing
  });
  const canEdit = canInteract && Boolean(editor?.isEditable);
  const { selectionFrameStyle, edgeHandleStyle, cornerHandleStyle } =
    createObjectSelectionChrome({
      accentColor,
      showSelectionChrome,
      borderRadius: 0,
      frameZIndex: 11,
      handleZIndex: 12
    });
  // Old scenes are exported once without mounting a canvas editor. Read-only
  // viewers keep this derived preview in memory and never modify the document.
  useEffect(() => {
    if (!scene || !hasElements || savedPreview) return;
    let cancelled = false;
    import("./utils/diagramPreviewRuntime")
      .then(({ renderDiagramPreview }) => renderDiagramPreview(scene))
      .then((svg) => {
        if (cancelled || sceneDataRef.current !== sceneData) return;
        setGeneratedPreview({ sourceKey, svg });
        setPreviewError(null);
        if (editor?.isEditable && !editor.isDestroyed && typeof getPos === "function") {
          const position = getPos();
          const currentNode = typeof position === "number" ? editor.state.doc.nodeAt(position) : null;
          if (currentNode?.type.name !== "diagramBlock" || currentNode.attrs.sceneData !== sceneData) return;
          editor.view.dispatch(editor.state.tr
            .setNodeMarkup(position, undefined, {
              ...currentNode.attrs,
              sceneData: JSON.stringify(withDiagramPreview(scene, svg))
            })
            .setMeta("addToHistory", false));
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewError(sourceKey);
      });
    return () => { cancelled = true; };
  }, [editor, getPos, hasElements, previewAttempt, savedPreview, scene, sceneData, sourceKey]);

  useLayoutEffect(() => {
    if (!previewSvg) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(new Blob([previewSvg], { type: "image/svg+xml" }));
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewSvg]);

  const handleOverlayClick = useCallback((event) => {
    event.stopPropagation();
    if (!canEdit || !scene || editor?.isDestroyed) return;
    const position = typeof getPos === "function" ? getPos() : null;
    if (typeof position !== "number") return;
    editor.commands.setNodeSelection(position);
    const openingSourceKey = getDiagramSourceKey(scene);
    const nextSession = {
      owner: ownerRef.current,
      scene,
      onSave: (nextScene) => {
        const currentScene = parseDiagramScene(sceneDataRef.current);
        if (!currentScene || getDiagramEditorSession() !== nextSession || editor.isDestroyed ||
          !editor.isEditable ||
          getDiagramSourceKey(currentScene) !== openingSourceKey) return false;
        updateAttributes({ sceneData: JSON.stringify({
          ...currentScene,
          elements: nextScene.elements,
          appState: nextScene.appState,
          files: nextScene.files,
          dockitPreview: nextScene.dockitPreview
        }) });
        return true;
      }
    };
    openDiagramEditor(nextSession);
  }, [canEdit, editor, getPos, scene, updateAttributes]);

  const handleCloseEditor = useCallback(() => {
    closeDiagramEditor(ownerRef.current);
    queueMicrotask(() => triggerRef.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    if (isEditing && !canEdit) closeDiagramEditor(ownerRef.current);
  }, [canEdit, isEditing]);

  useEffect(() => {
    const owner = ownerRef.current;
    return () => closeDiagramEditor(owner);
  }, []);

  const resolvedHeight = Math.max(
    MIN_HEIGHT,
    typeof height === "number" ? height : parseFloat(height) || MIN_HEIGHT
  );
  const resolvedWidth =
    typeof width === "number"
      ? width
      : parseFloat(width) || FULL_WIDTH_SENTINEL;
  const wrapperStyle = {
    display: "flex",
    width: "100%",
    justifyContent:
      { left: "flex-start", center: "center", right: "flex-end" }[textAlign] ||
      "center",
    position: "relative",
    margin: 0,
    breakInside: "avoid",
    pageBreakInside: "avoid"
  };
  const frameStyle = {
    position: "relative",
    display: "inline-block",
    width:
      resolvedWidth === FULL_WIDTH_SENTINEL
        ? "100%"
        : `${Math.max(MIN_WIDTH, resolvedWidth)}px`,
    height: `${resolvedHeight}px`,
    maxWidth: "100%",
    userSelect: "none",
    overflow: "visible",
    breakInside: "avoid",
    pageBreakInside: "avoid"
  };

  // 가로/세로/대각 리사이즈
  const startResize = useCallback(
    (e, axis) => {
      if (!canInteract) return;
      e.preventDefault();
      e.stopPropagation();

      const currentWidth = frameRef.current?.offsetWidth || MIN_WIDTH;
      const currentHeight = frameRef.current?.offsetHeight || resolvedHeight;

      isResizingRef.current = true;
      setIsResizing(true);
      resizeStartRef.current = {
        width: currentWidth,
        height: currentHeight,
        mouseX: e.clientX,
        mouseY: e.clientY,
        axis,
        aspectRatio: currentWidth / currentHeight
      };

      const onMouseMove = (moveEvent) => {
        if (!isResizingRef.current || !frameRef.current) return;

        const {
          width: startWidth,
          height: startHeight,
          mouseX,
          mouseY,
          axis: resizeAxis,
          aspectRatio
        } = resizeStartRef.current;
        const dx = moveEvent.clientX - mouseX;
        const dy = moveEvent.clientY - mouseY;

        let nextWidth = startWidth;
        let nextHeight = startHeight;

        if (resizeAxis === "x" || resizeAxis === "xy") {
          nextWidth = Math.max(MIN_WIDTH, startWidth + dx);
        }

        if (resizeAxis === "y" || resizeAxis === "xy") {
          nextHeight = Math.max(MIN_HEIGHT, startHeight + dy);
        }

        if (resizeAxis === "xy" && moveEvent.shiftKey) {
          nextHeight = Math.max(MIN_HEIGHT, nextWidth / aspectRatio);
        }

        frameRef.current.style.width = `${nextWidth}px`;
        frameRef.current.style.height = `${nextHeight}px`;
      };

      const onMouseUp = () => {
        isResizingRef.current = false;
        setIsResizing(false);
        const nodePos = typeof getPos === "function" ? getPos() : null;

        if (frameRef.current) {
          updateAttributes({
            width: Math.round(frameRef.current.offsetWidth),
            height: Math.round(frameRef.current.offsetHeight)
          });
        }

        if (editor && nodePos != null) {
          queueMicrotask(() => {
            if (!editor.isDestroyed) {
              editor.commands.setNodeSelection(nodePos);
            }
          });
        }

        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        resizeListenersRef.current = { onMouseMove: null, onMouseUp: null };
      };

      resizeListenersRef.current = { onMouseMove, onMouseUp };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [canInteract, editor, getPos, resolvedHeight, updateAttributes]
  );

  useEffect(() => {
    return () => {
      isResizingRef.current = false;
      if (resizeListenersRef.current.onMouseMove) {
        window.removeEventListener(
          "mousemove",
          resizeListenersRef.current.onMouseMove
        );
      }
      if (resizeListenersRef.current.onMouseUp) {
        window.removeEventListener(
          "mouseup",
          resizeListenersRef.current.onMouseUp
        );
      }
      resizeListenersRef.current = { onMouseMove: null, onMouseUp: null };
    };
  }, []);

  return (
    <NodeViewWrapper
      className="not-prose diagram-block-wrapper"
      style={wrapperStyle}
    >
      <div
        ref={frameRef}
        className="not-prose diagram-frame-container"
        style={frameStyle}
      >
        <div data-diagram-chrome style={selectionFrameStyle} />

        <div
          className="diagram-preview"
          data-preview-theme={isDarkMode ? "dark" : "light"}
          style={{ "--diagram-background": scene?.appState?.viewBackgroundColor || "#fff" }}
        >
          {previewUrl && hasElements ? (
            /* SVG is rendered as an image so document content cannot execute scripts. */
            <img className="diagram-preview-image" src={previewUrl} alt="다이어그램" />
          ) : (
            <div
              className="diagram-preview-status"
              role={!scene || previewError === sourceKey ? "alert" : "status"}
            >
              {!scene ? "다이어그램을 불러오지 못했어요." :
                previewError === sourceKey ? "미리보기를 만들지 못했어요." :
                  hasElements ? "미리보기 준비 중…" :
                    canEdit ? "다이어그램 편집" : "빈 다이어그램"}
              {scene && previewError === sourceKey && (
                <button type="button" onClick={(event) => {
                  event.stopPropagation();
                  setPreviewError(null);
                  setPreviewAttempt((attempt) => attempt + 1);
                }}>다시 시도</button>
              )}
            </div>
          )}
          {canEdit && scene && (
            <button
              ref={triggerRef}
              type="button"
              className="diagram-edit-trigger"
              aria-label="다이어그램 편집"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleOverlayClick}
            />
          )}
        </div>

        <div
          data-diagram-handle
          onMouseDown={(e) => startResize(e, "x")}
          style={edgeHandleStyle({
            right: -HANDLE_SIZE / 2,
            top: "50%",
            transform: "translateY(-50%)",
            width: HANDLE_SIZE,
            height: EDGE_HANDLE_LENGTH,
            cursor: "ew-resize"
          })}
        />

        <div
          data-diagram-handle
          onMouseDown={(e) => startResize(e, "y")}
          style={edgeHandleStyle({
            bottom: -HANDLE_SIZE / 2,
            left: "50%",
            transform: "translateX(-50%)",
            width: EDGE_HANDLE_LENGTH,
            height: HANDLE_SIZE,
            cursor: "ns-resize"
          })}
        />

        {/* 우하단 모서리 핸들 (대각선 조절) */}
        <div
          data-diagram-handle
          onMouseDown={(e) => startResize(e, "xy")}
          style={cornerHandleStyle({
            right: -CORNER_HANDLE_SIZE / 2,
            bottom: -CORNER_HANDLE_SIZE / 2,
            cursor: "nwse-resize"
          })}
        />
      </div>
      {isEditing && (
        <DiagramEditorModal
          session={session}
          isDarkMode={isDarkMode}
          onClose={handleCloseEditor}
        />
      )}
    </NodeViewWrapper>
  );
}
