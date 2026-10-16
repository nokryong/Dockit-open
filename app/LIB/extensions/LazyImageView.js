"use client";

import { NodeViewWrapper } from "@tiptap/react";
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
 * LazyImageView Component
 *
 * 일반 문서 모드에서 이미지를 렌더링하는 React 컴포넌트
 * - textAlign 지원 (left, center, right)
 * - 마우스로 크기 조절 가능
 */
function LazyImageView({ node, updateAttributes, editor, getPos, selected }) {
  const { setting } = useSetting();
  const { currentColors } = useDarkMode();
  const {
    src,
    alt,
    title,
    width,
    height,
    textAlign,
    borderWidth,
    borderColor,
    borderStyle,
    borderRadius,
    shadowEnabled,
    shadowOffsetX,
    shadowOffsetY,
    shadowBlur,
    shadowSpread,
    shadowColor,
    shadowInset,
    filter,
    opacity
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
  const imageRef = useRef(null);
  const isResizingRef = useRef(false); // 클로저 문제 해결을 위한 ref

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

    if (imageRef.current) {
      let newW = sw;
      let newH = sh;

      if (axis === "x" || axis === "xy") newW = Math.max(30, sw + dx);
      if (axis === "y" || axis === "xy") newH = Math.max(30, sh + dy);

      // xy(모서리) 리사이즈 시 Shift 비율 고정
      if (axis === "xy" && e.shiftKey) {
        newH = newW / aspectRatio;
      }

      imageRef.current.style.width = `${newW}px`;
      imageRef.current.style.height = `${newH}px`;
    }
  }, []);

  /**
   * 리사이징 종료
   */
  const handleMouseUp = useCallback(
    (e) => {
      if (!isResizingRef.current) return;

      const newWidth = imageRef.current.offsetWidth;
      const newHeight = imageRef.current.offsetHeight;
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
    },
    [editor, getPos, updateAttributes, handleMouseMove]
  );

  useEffect(() => {
    return () => {
      isResizingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const startResize = useCallback(
    (e, axis) => {
      e.preventDefault();
      e.stopPropagation();

      const currentW = imageRef.current?.offsetWidth || mm2px(node.attrs.width);
      const currentH =
        imageRef.current?.offsetHeight || mm2px(node.attrs.height);

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
    [node.attrs.width, node.attrs.height, handleMouseMove, handleMouseUp]
  );
  const { showSelectionChrome } = getObjectSelectionVisibility({
    editor,
    selected,
    isResizing
  });
  const accentColor = currentColors[setting.theme][7];

  const {
    selectionFrameStyle,
    edgeHandleStyle,
    cornerHandleStyle,
    cornerHandleSvgStyle
  } = createObjectSelectionChrome({
    accentColor,
    showSelectionChrome,
    borderRadius: 0,
    frameZIndex: 11,
    handleZIndex: 12
  });
  /**
   * 리사이징 시작
   */
  const handleMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 실제 렌더링된 크기를 우선적으로 사용 (offsetWidth/offsetHeight)
      // 이렇게 하면 초기 리사이즈 시 높이가 튀는 문제를 방지할 수 있습니다
      let currentWidth, currentHeight;

      if (imageRef.current) {
        // 실제 렌더링된 크기 사용
        currentWidth =
          imageRef.current.offsetWidth || imageRef.current.clientWidth;
        currentHeight =
          imageRef.current.offsetHeight || imageRef.current.clientHeight;

        // 렌더링된 크기가 없으면 속성값 사용
        if (!currentWidth || !currentHeight) {
          const parseSize = (size) => {
            if (!size) return null;
            if (typeof size === "number") return size;
            if (typeof size === "string") {
              const num = parseFloat(size);
              return isNaN(num) ? null : num;
            }
            return null;
          };

          // width/height는 mm 단위로 저장 → px로 변환
          const wMm = parseSize(width);
          const hMm = parseSize(height);
          currentWidth =
            (wMm ? mm2px(wMm) : null) || imageRef.current.naturalWidth || 300;
          currentHeight =
            (hMm ? mm2px(hMm) : null) || imageRef.current.naturalHeight || 200;
        }
      } else {
        // 이미지가 아직 로드되지 않은 경우
        const parseSize = (size) => {
          if (!size) return null;
          if (typeof size === "number") return size;
          if (typeof size === "string") {
            const num = parseFloat(size);
            return isNaN(num) ? null : num;
          }
          return null;
        };

        // width/height는 mm 단위로 저장 → px로 변환
        const wMm = parseSize(width);
        const hMm = parseSize(height);
        currentWidth = wMm ? mm2px(wMm) : 300;
        currentHeight = hMm ? mm2px(hMm) : 200;
      }

      const aspectRatio = currentWidth / currentHeight;

      isResizingRef.current = true;
      setIsResizing(true);
      resizeStartRef.current = {
        width: currentWidth,
        height: currentHeight,
        mouseX: e.clientX,
        mouseY: e.clientY,
        aspectRatio
      };

      // 글로벌 이벤트 리스너 추가
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [width, height, handleMouseMove, handleMouseUp]
  );

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
   * 이미지 컨테이너 스타일
   */
  const getContainerStyle = () => {
    return {
      position: "relative",
      display: "inline-block",
      maxWidth: "100%",
      overflow: "visible"
    };
  };

  /**
   * 이미지 스타일
   */
  const getImageStyle = () => {
    // width/height는 mm 단위로 저장 → px로 변환
    const getWidthValue = () => {
      if (!width) return "auto";
      const numWidth = typeof width === "number" ? width : parseFloat(width);
      return isNaN(numWidth) ? "auto" : `${mm2px(numWidth)}px`;
    };

    const getHeightValue = () => {
      if (!height) return "auto";
      const numHeight =
        typeof height === "number" ? height : parseFloat(height);
      return isNaN(numHeight) ? "auto" : `${mm2px(numHeight)}px`;
    };

    // 선 스타일 (borderWidth는 pt 단위)
    const getBorderStyle = () => {
      const bw = borderWidth || 0;
      if (bw === 0) return "none";
      const bc = borderColor || "#000000";
      const bs = borderStyle || "solid";
      return `${pt2px(bw)}px ${bs} ${bc}`;
    };

    // 그림자 스타일 (shadow 값은 pt 단위)
    const getBoxShadow = () => {
      if (!shadowEnabled) return "none";
      const inset = shadowInset ? "inset " : "";
      const offsetX = pt2px(shadowOffsetX ?? 0);
      const offsetY = pt2px(shadowOffsetY ?? 0);
      const blur = pt2px(shadowBlur ?? 0);
      const spread = pt2px(shadowSpread ?? 0);
      const color = shadowColor || "#000000";
      return `${inset}${offsetX}px ${offsetY}px ${blur}px ${spread}px ${color}`;
    };

    const getOpacity = () => {
      if (!opacity) return "1";
      const numOpacity =
        typeof opacity === "number" ? opacity : parseFloat(opacity);
      return isNaN(numOpacity) ? "1" : numOpacity;
    };

    return {
      width: getWidthValue(),
      height: getHeightValue(),
      maxWidth: "100%",
      display: "block",
      loading: "lazy",
      decoding: "async",
      border: getBorderStyle(),
      borderRadius: borderRadius ? `${mm2px(borderRadius)}px` : "0",
      boxShadow: getBoxShadow(),
      opacity: getOpacity(),
      filter: filter || "none"
    };
  };

  return (
    <NodeViewWrapper style={getWrapperStyle()}>
      <div
        className="lazy-image-container"
        style={getContainerStyle()}
        contentEditable={false}
      >
        <div style={selectionFrameStyle} />

        {/* 이미지 */}
        <img
          ref={imageRef}
          src={src}
          alt={alt || ""}
          title={title || ""}
          style={getImageStyle()}
        />

        {/* 오른쪽 핸들 */}
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

        {/* 아래쪽 핸들 */}
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

export default memo(LazyImageView);
