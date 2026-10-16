import { NodeViewWrapper } from "@tiptap/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Textarea } from "sud-ui";
import "../css/diagram.css";
import { useSetting } from "../context/SettingContext";
import { useDarkMode } from "../context/DarkModeContext";
import { renderMermaidSvg } from "../utils/mermaidRenderer";
import {
  CORNER_HANDLE_SIZE, EDGE_HANDLE_LENGTH, HANDLE_SIZE,
  createObjectSelectionChrome, getObjectSelectionVisibility,
} from "./utils/resizeHandleUtils";

const MIN_WIDTH = 260;
const MIN_HEIGHT = 200;
const FULL_WIDTH_SENTINEL = 100;

export default function DiagramBlockView({ node, updateAttributes, editor, getPos, selected }) {
  const { code = "", previewSvg = "", previewCode, fontFamily = "", previewFontFamily = "", width, height, textAlign } = node.attrs;
  const { setting } = useSetting();
  const { isDarkMode, currentColors } = useDarkMode();
  const frameRef = useRef(null);
  const triggerRef = useRef(null);
  const resizeListenersRef = useRef({ onMouseMove: null, onMouseUp: null });
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef({ width: 0, height: 0, mouseX: 0, mouseY: 0, axis: "xy", aspectRatio: 1 });
  const editingRef = useRef(false);
  const openingCode = useRef(code);
  const draftRef = useRef(code);
  const [draft, setDraft] = useState(code);
  const [isEditing, setIsEditing] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [renderError, setRenderError] = useState(null);
  const errorMessage = renderError?.code === code && renderError.fontFamily === fontFamily ? renderError.message : "";
  const cachedPreviewMatches = previewCode === code && previewFontFamily === fontFamily && previewSvg;
  const svg = cachedPreviewMatches ? previewSvg : generated?.code === code && generated.fontFamily === fontFamily ? generated.svg : "";
  const { canInteract, showSelectionChrome } = getObjectSelectionVisibility({ editor, selected, isResizing, isEditing });
  const canEdit = canInteract && Boolean(editor?.isEditable);
  const { selectionFrameStyle, edgeHandleStyle, cornerHandleStyle } = createObjectSelectionChrome({
    accentColor: currentColors[setting.theme][7], showSelectionChrome,
    borderRadius: 0, frameZIndex: 11, handleZIndex: 12,
  });

  useEffect(() => {
    if (!code.trim() || cachedPreviewMatches) return;
    let cancelled = false;
    renderMermaidSvg(code, false, fontFamily).then((nextSvg) => {
      if (cancelled) return;
      setGenerated({ code, fontFamily, svg: nextSvg });
      setRenderError(null);
      if (!editor?.isEditable || editor.isDestroyed) return;
      const position = typeof getPos === "function" ? getPos() : null;
      const current = typeof position === "number" ? editor.state.doc.nodeAt(position) : null;
      if (current?.type.name !== "diagramBlock" || current.attrs.code !== code || current.attrs.fontFamily !== fontFamily) return;
      editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, {
        ...current.attrs, previewCode: code, previewFontFamily: fontFamily, previewSvg: nextSvg,
      }).setMeta("addToHistory", false));
    }).catch(error => {
      if (!cancelled) setRenderError({ code, fontFamily,
        message: error.name === "FontLoadError" ? error.message : "Mermaid 문법을 확인해주세요." });
    });
    return () => { cancelled = true; };
  }, [code, previewCode, previewSvg, fontFamily, previewFontFamily, cachedPreviewMatches, editor, getPos]);

  useLayoutEffect(() => {
    if (!svg) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [svg]);

  const finishEditing = useCallback((discard = false) => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setIsEditing(false);
    if (discard || !editor?.isEditable || editor.isDestroyed) return;
    const position = typeof getPos === "function" ? getPos() : null;
    const current = typeof position === "number" ? editor.state.doc.nodeAt(position) : null;
    if (current?.type.name !== "diagramBlock" || current.attrs.code !== openingCode.current) return;
    if (draftRef.current !== current.attrs.code) {
      updateAttributes({ code: draftRef.current, previewSvg: "", previewCode: "" });
    }
  }, [editor, getPos, updateAttributes]);

  useEffect(() => {
    if (!isEditing) return;
    const outside = (event) => {
      if (!frameRef.current?.contains(event.target)) finishEditing();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [isEditing, finishEditing]);

  useEffect(() => {
    if (isEditing && (!canEdit || code !== openingCode.current)) finishEditing(true);
  }, [isEditing, canEdit, code, finishEditing]);

  const selectDiagram = (event) => {
    event.stopPropagation();
    if (!canInteract || editor.isDestroyed) return;
    const position = typeof getPos === "function" ? getPos() : null;
    if (typeof position === "number") editor.commands.setNodeSelection(position);
  };
  const editDiagram = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canEdit) return;
    selectDiagram(event);
    openingCode.current = code;
    draftRef.current = code;
    setDraft(code);
    editingRef.current = true;
    setIsEditing(true);
  };
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
      if (!canInteract || isEditing) return;
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
    [canInteract, editor, getPos, isEditing, resolvedHeight, updateAttributes]
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
    <NodeViewWrapper className="not-prose diagram-block-wrapper" style={wrapperStyle}>
      <div ref={frameRef} className="not-prose diagram-frame-container" style={frameStyle} contentEditable={false}>
        <div data-diagram-chrome style={selectionFrameStyle} />
        <div className="diagram-preview" data-editing={isEditing || undefined} data-preview-theme={isDarkMode ? "dark" : "light"}>
          {previewUrl ? <img className="diagram-preview-image" src={previewUrl} alt="다이어그램" /> : (
            <div className="diagram-preview-status" role={errorMessage ? "alert" : "status"}>
              {!code.trim() ? (canEdit ? "더블클릭하여 도식 작성" : "빈 다이어그램") : errorMessage || "도식 그리는 중…"}
            </div>
          )}
          {canInteract && <button ref={triggerRef} type="button" className="diagram-edit-trigger" aria-label="다이어그램 선택" onMouseDown={(event) => event.preventDefault()} onClick={selectDiagram} onDoubleClick={editDiagram} onKeyDown={(event) => { if (event.key === "Enter") editDiagram(event); }} />}
        </div>
        {isEditing && (
          <div className="diagram-code-editor h-full w-full" data-mermaid-editor data-workspace-shortcuts="ignore"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") { event.preventDefault(); finishEditing(true); triggerRef.current?.focus({ preventScroll: true }); }
            }}
            onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) finishEditing(); }}
          >
            <Textarea value={draft} onChange={(event) => { draftRef.current = event.target.value; setDraft(event.target.value); }}
              autoFocus ariaLabel="Mermaid 코드" spellCheck={false} resizable={false} autoSize={false}
              background="white-10" color="black-9" border={false} shadow="none"
              className="h-full w-full [&_textarea]:h-full! [&_textarea]:font-mono [&_textarea]:text-sm"
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        )}
        <div data-diagram-handle="x" onMouseDown={(event) => startResize(event, "x")} style={edgeHandleStyle({ right: -HANDLE_SIZE / 2, top: "50%", transform: "translateY(-50%)", width: HANDLE_SIZE, height: EDGE_HANDLE_LENGTH, cursor: "ew-resize", ...(isEditing ? { pointerEvents: "none", opacity: 0 } : {}) })} />
        <div data-diagram-handle="y" onMouseDown={(event) => startResize(event, "y")} style={edgeHandleStyle({ bottom: -HANDLE_SIZE / 2, left: "50%", transform: "translateX(-50%)", width: EDGE_HANDLE_LENGTH, height: HANDLE_SIZE, cursor: "ns-resize", ...(isEditing ? { pointerEvents: "none", opacity: 0 } : {}) })} />
        <div data-diagram-handle="xy" onMouseDown={(event) => startResize(event, "xy")} style={cornerHandleStyle({ right: -CORNER_HANDLE_SIZE / 2, bottom: -CORNER_HANDLE_SIZE / 2, cursor: "nwse-resize", ...(isEditing ? { pointerEvents: "none", opacity: 0 } : {}) })} />
      </div>
    </NodeViewWrapper>
  );
}
