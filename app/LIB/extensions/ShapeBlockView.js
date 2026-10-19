"use client";

import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { mm2px, pt2px, px2mm } from "../utils/unitUtils";
import { useSetting } from "../context/SettingContext";
import { useDarkMode } from "../context/DarkModeContext";
import {
  CORNER_HANDLE_SIZE,
  EDGE_HANDLE_LENGTH,
  HANDLE_SIZE,
  createObjectSelectionChrome,
  getObjectSelectionVisibility
} from "./utils/resizeHandleUtils";

/**
 * ShapeBlockView 컴포넌트
 *
 * 사각형 도형을 렌더링하는 React 컴포넌트
 * - 배경색, 테두리, 그림자, 패딩, 회전 등 스타일 지원
 * - 마우스로 크기 조절 가능 (우하단 핸들)
 * - 내부에 텍스트 편집 가능 (Tiptap NodeViewContent)
 * - 설정 버튼으로 편집기에서 스타일 조절 가능
 */
function ShapeBlockView({ node, updateAttributes, editor, getPos, selected }) {
  const { setting } = useSetting();
  const { currentColors } = useDarkMode();
  const {
    width,
    height,
    textAlign,
    backgroundColor,
    borderColor,
    borderWidth,
    borderStyle,
    borderRadius,
    shadowEnabled,
    shadowOffsetX,
    shadowOffsetY,
    shadowBlur,
    shadowSpread,
    shadowColor,
    shadowInset,
    justifyContent,
    flexDirection = "column",
    paddingTop,
    paddingBottom,
    paddingLeft,
    paddingRight,
    backgroundImage,
    backgroundSize,
    backgroundPosition,
    backgroundRepeat
  } = node.attrs;

  // 리사이징 상태
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef({
    width: 0,
    height: 0,
    mouseX: 0,
    mouseY: 0,
    aspectRatio: 1,
    axis: "xy"
  });
  const shapeRef = useRef(null);
  const isResizingRef = useRef(false);

  /**
   * 리사이징 중
   */
  const handleMouseMove = useCallback((e) => {
    if (!isResizingRef.current) return;
    const {
      width: sw,
      height: sh,
      mouseX,
      mouseY,
      aspectRatio,
      axis
    } = resizeStartRef.current;

    const dx = e.clientX - mouseX;
    const dy = e.clientY - mouseY;

    if (shapeRef.current) {
      let newW = sw;
      let newH = sh;

      if (axis === "x" || axis === "xy") newW = Math.max(50, sw + dx);
      if (axis === "y" || axis === "xy") newH = Math.max(50, sh + dy);

      // xy(모서리) 리사이즈 시 Shift 비율 고정
      if (axis === "xy" && e.shiftKey) {
        newH = Math.round(newW / aspectRatio);
      }

      shapeRef.current.style.width = `${newW}px`;
      shapeRef.current.style.minHeight = `${newH}px`;
    }
  }, []);

  /**
   * 리사이징 종료
   */
  const handleMouseUp = useCallback(() => {
    if (!isResizingRef.current) return;

    const newWidth = shapeRef.current.offsetWidth;
    const newHeight = shapeRef.current.offsetHeight;
    const nodePos = typeof getPos === "function" ? getPos() : null;

    updateAttributes({
      width: px2mm(newWidth),
      height: px2mm(newHeight)
    });

    if (editor && nodePos != null) {
      queueMicrotask(() => {
        if (!editor.isDestroyed) {
          editor.commands.setNodeSelection(nodePos);
        }
      });
    }

    isResizingRef.current = false;
    setIsResizing(false);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }, [editor, getPos, updateAttributes, handleMouseMove]);

  useEffect(() => {
    return () => {
      isResizingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  /**
   * 리사이징 시작
   */
  const startResize = useCallback(
    (e, axis) => {
      e.preventDefault();
      e.stopPropagation();

      const currentW = shapeRef.current?.offsetWidth || mm2px(width);
      const currentH = shapeRef.current?.offsetHeight || mm2px(height);

      isResizingRef.current = true;
      setIsResizing(true);
      resizeStartRef.current = {
        width: currentW,
        height: currentH,
        mouseX: e.clientX,
        mouseY: e.clientY,
        aspectRatio: currentW / currentH,
        axis
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [width, height, handleMouseMove, handleMouseUp]
  );
  const { showSelectionChrome } = getObjectSelectionVisibility({
    editor,
    selected,
    isResizing
  });
  const accentColor = currentColors[setting.theme][7];

  const { selectionFrameStyle, edgeHandleStyle, cornerHandleStyle } =
    createObjectSelectionChrome({
      accentColor,
      showSelectionChrome,
      borderRadius: 0,
      frameZIndex: 19,
      handleZIndex: 20
    });
  /**
   * textAlign에 따른 wrapper 스타일
   */
  const getWrapperStyle = () => {
    const alignments = {
      left: "flex-start",
      center: "center",
      right: "flex-end"
    };

    return {
      display: "flex",
      justifyContent: alignments[textAlign] || "flex-start",
      margin: "0",
      position: "relative"
    };
  };

  /**
   * 배경색 처리 (8자리 hex alpha 지원)
   */
  const getBgColor = () => {
    if (!backgroundColor || backgroundColor === "transparent")
      return "transparent";
    if (backgroundColor.length === 9) {
      const alphaHex = backgroundColor.slice(7, 9);
      const alpha = parseInt(alphaHex, 16) / 255;
      if (alpha === 0) return "transparent";
      const r = parseInt(backgroundColor.slice(1, 3), 16);
      const g = parseInt(backgroundColor.slice(3, 5), 16);
      const b = parseInt(backgroundColor.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return backgroundColor;
  };

  /**
   * 테두리 스타일
   */
  const getBorderStyle = () => {
    const bw = borderWidth || 0;
    if (bw === 0) return "none";
    const bwPx = pt2px(bw);
    const bc = borderColor || "#000000";
    const bs = borderStyle || "solid";
    if (bc.length === 9) {
      const alphaHex = bc.slice(7, 9);
      const alpha = parseInt(alphaHex, 16) / 255;
      const r = parseInt(bc.slice(1, 3), 16);
      const g = parseInt(bc.slice(3, 5), 16);
      const b = parseInt(bc.slice(5, 7), 16);
      return `${bwPx}px ${bs} rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `${bwPx}px ${bs} ${bc}`;
  };

  /**
   * 그림자 스타일
   */
  const getBoxShadow = () => {
    if (!shadowEnabled) return "none";
    const inset = shadowInset ? "inset " : "";
    const ox = pt2px(shadowOffsetX ?? 0);
    const oy = pt2px(shadowOffsetY ?? 0);
    const blur = pt2px(shadowBlur ?? 0);
    const spread = pt2px(shadowSpread ?? 0);
    const color = shadowColor || "#000000";
    return `${inset}${ox}px ${oy}px ${blur}px ${spread}px ${color}`;
  };

  /**
   * 도형 스타일
   */
  const getShapeStyle = () => {
    const bgColor = getBgColor();
    const border = getBorderStyle();
    const br = borderRadius ? `${mm2px(borderRadius)}px` : "0";
    const shadow = getBoxShadow();
    const pd = `${mm2px(paddingTop ?? 2.6)}px ${mm2px(paddingRight ?? 2.6)}px ${mm2px(paddingBottom ?? 2.6)}px ${mm2px(paddingLeft ?? 2.6)}px`;
    const wPx = `${mm2px(width)}px`;
    const hPx = `${mm2px(height)}px`;

    return {
      width: wPx,
      minHeight: hPx,
      backgroundColor: bgColor,
      ...(backgroundImage
        ? {
            backgroundImage: `url("${backgroundImage}")`,
            backgroundSize: backgroundSize || "cover",
            backgroundPosition: backgroundPosition || "center",
            backgroundRepeat: backgroundRepeat || "no-repeat"
          }
        : {}),
      border: border,
      borderRadius: br,
      boxShadow: shadow,
      display: "flex",
      flexDirection: flexDirection,
      justifyContent: justifyContent || "start",
      padding: pd,
      boxSizing: "border-box",
      maxWidth: "100%",
      position: "relative",
      overflowWrap: "break-word",
      wordBreak: "break-word",
      cursor: "default",
      // 인쇄용 CSS 변수 (print-mode.css에서 참조)
      "--shape-bg": bgColor,
      "--shape-bg-image": backgroundImage
        ? `url("${backgroundImage}")`
        : "none",
      "--shape-bg-size": backgroundSize || "cover",
      "--shape-bg-position": backgroundPosition || "center",
      "--shape-bg-repeat": backgroundRepeat || "no-repeat",
      "--shape-border": border,
      "--shape-border-radius": br,
      "--shape-shadow": shadow,
      "--shape-padding": pd,
      "--shape-min-height": hPx
    };
  };

  return (
    <NodeViewWrapper style={getWrapperStyle()}>
      <div
        ref={shapeRef}
        className="shape-block-container"
        style={getShapeStyle()}
        onMouseDown={(e) => {
          // e.target === shapeRef.current 이면 정확히 이 컨테이너의
          // 패딩/배경 영역을 클릭한 것 (자식 요소 클릭은 e.target이 달라짐)
          if (e.target !== shapeRef.current) return;
          const pos = getPos();
          if (pos == null) return;
          const { from } = editor.state.selection;
          const isInsideThis = from > pos && from < pos + node.nodeSize;
          if (isInsideThis) {
            e.preventDefault();
            editor.commands.setNodeSelection(pos);
          }
        }}
      >
        <div style={selectionFrameStyle} />

        {/* 도형 내부 컨텐츠 (편집 가능) */}
        <NodeViewContent className="shape-block-content" />

        {/* 오른쪽 핸들 (너비 조절) */}
        <div
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

        {/* 아래쪽 핸들 (높이 조절) */}
        <div
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
          onMouseDown={(e) => startResize(e, "xy")}
          style={cornerHandleStyle({
            right: -CORNER_HANDLE_SIZE / 2,
            bottom: -CORNER_HANDLE_SIZE / 2,
            cursor: "nwse-resize"
          })}
        />
      </div>
    </NodeViewWrapper>
  );
}

export default memo(ShapeBlockView);
