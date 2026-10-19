"use client";

import { NodeViewWrapper } from "@tiptap/react";
import Chart from "../components/panel/ChartComponent/Chart";
import { useCallback, useEffect, useRef, useState } from "react";
import { mm2px, px2mm } from "../utils/unitUtils";
import {
  TbAlignCenter,
  TbAlignLeft,
  TbAlignRight,
  TbArrowBarToUp,
  TbArrowDown,
  TbArrowLeft,
  TbArrowRight,
  TbArrowUp,
  TbAxisY,
  TbChartArea,
  TbChartBar,
  TbChartDonut2,
  TbChartLine,
  TbChartPie,
  TbChartRadar,
  TbGrid4X4,
  TbLayoutAlignBottomFilled,
  TbLayoutAlignCenterFilled,
  TbLayoutAlignTopFilled,
  TbList,
  TbListNumbers,
  TbMathXy,
  TbStairs,
  TbX
} from "react-icons/tb";
import { Div } from "sud-ui";
import { useSetting } from "../context/SettingContext";
import { useDarkMode } from "../context/DarkModeContext";
import { LuChartLine, LuChartSpline } from "react-icons/lu";
import {
  ToolbarDivider,
  ToolbarIconButton,
  ToolbarSurface
} from "../components/common/toolbar/ToolbarPrimitives";
import {
  CORNER_HANDLE_SIZE,
  EDGE_HANDLE_LENGTH,
  HANDLE_SIZE,
  createObjectSelectionChrome,
  getObjectSelectionVisibility
} from "./utils/resizeHandleUtils";

export default function ChartBlockView({
  node,
  updateAttributes,
  editor,
  getPos,
  selected
}) {
  const {
    tableData,
    chartType,
    chartColors,
    isAxesSwapped,
    viewDataValue,
    viewLegend,
    viewYLabel,
    textAlign,
    width,
    height,
    legendPosition,
    dataLabelPos,
    showGrid,
    lineType,
    barRadius,
    pieDonut
  } = node.attrs;

  const { setting } = useSetting();
  const { currentColors } = useDarkMode();
  const [isResizing, setIsResizing] = useState(false);
  const [openInlineMenu, setOpenInlineMenu] = useState(null);
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef({
    width: 0,
    height: 0,
    mouseX: 0,
    mouseY: 0,
    axis: "xy",
    aspectRatio: 1
  });
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  const widthPx = mm2px(width);
  const heightPx = mm2px(height);

  const parsedTableData = (() => {
    try {
      return JSON.parse(tableData);
    } catch {
      return [];
    }
  })();

  const parsedColors = (() => {
    try {
      return JSON.parse(chartColors);
    } catch {
      return [];
    }
  })();

  const handleMouseMove = useCallback((e) => {
    if (!isResizingRef.current) return;

    const {
      width: startWidth,
      height: startHeight,
      mouseX,
      mouseY,
      axis,
      aspectRatio
    } = resizeStartRef.current;
    const dx = e.clientX - mouseX;
    const dy = e.clientY - mouseY;

    if (!containerRef.current) return;

    let nextWidth = startWidth;
    let nextHeight = startHeight;

    if (axis === "x") {
      nextWidth = Math.max(30, startWidth + dx);
    } else if (axis === "y") {
      nextHeight = Math.max(20, startHeight + dy);
    } else {
      nextWidth = Math.max(30, startWidth + dx);
      nextHeight = Math.max(20, startHeight + dy);

      if (e.shiftKey) {
        nextHeight = nextWidth / aspectRatio;
      }
    }

    containerRef.current.style.width = `${nextWidth}px`;
    containerRef.current.style.height = `${nextHeight}px`;
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isResizingRef.current || !containerRef.current) return;
    const nodePos = typeof getPos === "function" ? getPos() : null;

    updateAttributes({
      width: px2mm(containerRef.current.offsetWidth),
      height: px2mm(containerRef.current.offsetHeight)
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
  }, [editor, getPos, handleMouseMove, updateAttributes]);

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

      const currentWidth = containerRef.current?.offsetWidth || widthPx;
      const currentHeight = containerRef.current?.offsetHeight || heightPx;

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

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [handleMouseMove, handleMouseUp, heightPx, widthPx]
  );

  const { showSelectionChrome } = getObjectSelectionVisibility({
    editor,
    selected,
    isResizing
  });

  useEffect(() => {
    if (!openInlineMenu) return;

    const handleOutsideMouseDown = (e) => {
      if (containerRef.current?.contains(e.target)) return;
      setOpenInlineMenu(null);
    };

    document.addEventListener("mousedown", handleOutsideMouseDown);

    return () => {
      document.removeEventListener("mousedown", handleOutsideMouseDown);
    };
  }, [openInlineMenu]);

  useEffect(() => {
    if (!showSelectionChrome) {
      setOpenInlineMenu(null);
    }
  }, [showSelectionChrome]);

  const tbBtn = (key, label, active, onClick, style = {}, extraClass = "") => (
    <ToolbarIconButton
      key={key}
      label={label}
      onClick={onClick}
      active={active}
      theme={setting.theme}
      background={active ? `${setting.theme}-2` : undefined}
      color={active ? `${setting.theme}-10` : undefined}
      buttonStyle={{
        padding: "4px",
        ...style
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      extraClass={`bubble-font ${extraClass}`.trim()}
      skipEditorCheck
    />
  );

  const tbMenuTrigger = (label, active, menuKey) =>
    tbBtn(menuKey, label, active, () =>
      setOpenInlineMenu((prev) => (prev === menuKey ? null : menuKey))
    );

  const legendPositionIconMap = {
    none: <TbX size={14} />,
    top: <TbArrowUp size={14} />,
    bottom: <TbArrowDown size={14} />,
    left: <TbArrowLeft size={14} />,
    right: <TbArrowRight size={14} />
  };

  const dataLabelIconMap = {
    none: <TbX size={14} />,
    top: <TbArrowBarToUp size={14} />,
    insideTop: <TbLayoutAlignTopFilled size={14} />,
    center: <TbLayoutAlignCenterFilled size={14} />,
    insideBottom: <TbLayoutAlignBottomFilled size={14} />
  };

  const rowStyle = { display: "flex", alignItems: "center", gap: 2 };

  const wrapperStyle = {
    display: "flex",
    width: "100%",
    justifyContent:
      { left: "flex-start", center: "center", right: "flex-end" }[textAlign] ||
      "flex-start",
    margin: 0,
    position: "relative"
  };

  const accentColor = currentColors[setting.theme][7];
  const { selectionFrameStyle, edgeHandleStyle, cornerHandleStyle } =
    createObjectSelectionChrome({
      accentColor,
      showSelectionChrome,
      borderRadius: 0,
      frameZIndex: 11,
      handleZIndex: 12
    });

  const getChartContainerStyle = () => {
    const widthCss = `${mm2px(width)}px`;
    const heightCss = `${mm2px(height)}px`;

    return {
      position: "relative",
      display: "inline-block",
      width: widthCss,
      height: heightCss,
      maxWidth: "100%",
      "--chart-width": widthCss,
      "--chart-height": heightCss,
      breakInside: "avoid"
    };
  };

  const legendPositionOptions = ["none", "top", "bottom", "left", "right"];
  const dataLabelOptions =
    chartType === "pie"
      ? ["none", "top", "insideTop", "center"]
      : ["none", "top", "insideTop", "center", "insideBottom"];

  const inlineMenuStyle = {
    position: "absolute",
    top: 22,
    left: "50%",
    transform: "translateX(-50%)",
    whiteSpace: "nowrap",
    zIndex: 21
  };

  return (
    <NodeViewWrapper className="chart-node-wrapper" style={wrapperStyle}>
      <div
        ref={containerRef}
        contentEditable={false}
        className="not-prose chart-block-container"
        style={getChartContainerStyle()}
      >
        <div style={selectionFrameStyle} />

        <Chart
          ref={chartRef}
          tableData={parsedTableData}
          chartType={chartType}
          isAxesSwapped={isAxesSwapped}
          viewDataValue={viewDataValue}
          viewLegend={viewLegend}
          chartColors={parsedColors}
          viewYLabel={viewYLabel}
          containerHeight={heightPx}
          legendPosition={legendPosition}
          dataLabelPos={dataLabelPos}
          showGrid={showGrid}
          lineType={lineType}
          barRadius={barRadius}
          pieDonut={pieDonut}
        />

        {showSelectionChrome && (
          <ToolbarSurface
            style={{
              position: "absolute",
              top: -20,
              left: "50%",
              transform: "translateX(-50%)",
              whiteSpace: "nowrap",
              zIndex: 20
            }}
          >
            <div style={rowStyle}>
              {tbBtn("bar", <TbChartBar size={14} />, chartType === "bar", () =>
                updateAttributes({ chartType: "bar" })
              )}
              {tbBtn(
                "line",
                <TbChartLine size={14} />,
                chartType === "line",
                () => updateAttributes({ chartType: "line" })
              )}
              {tbBtn(
                "area",
                <TbChartArea size={14} />,
                chartType === "area",
                () => updateAttributes({ chartType: "area" })
              )}
              {tbBtn("pie", <TbChartPie size={14} />, chartType === "pie", () =>
                updateAttributes({ chartType: "pie" })
              )}
              {tbBtn(
                "radar",
                <TbChartRadar size={14} />,
                chartType === "radar",
                () => updateAttributes({ chartType: "radar" })
              )}
              <ToolbarDivider />

              {tbBtn(
                "left",
                <TbAlignLeft size={14} />,
                textAlign === "left",
                () => updateAttributes({ textAlign: "left" })
              )}
              {tbBtn(
                "center",
                <TbAlignCenter size={14} />,
                textAlign === "center",
                () => updateAttributes({ textAlign: "center" })
              )}
              {tbBtn(
                "right",
                <TbAlignRight size={14} />,
                textAlign === "right",
                () => updateAttributes({ textAlign: "right" })
              )}
              <ToolbarDivider />

              {(chartType === "line" || chartType === "area") && (
                <>
                  {tbBtn(
                    "monotone",
                    <LuChartSpline size={14} />,
                    lineType === "monotone",
                    () => updateAttributes({ lineType: "monotone" })
                  )}
                  {tbBtn(
                    "linear",
                    <LuChartLine size={14} />,
                    lineType === "linear",
                    () => updateAttributes({ lineType: "linear" })
                  )}
                  {tbBtn(
                    "step",
                    <TbStairs size={14} />,
                    lineType === "step",
                    () => updateAttributes({ lineType: "step" })
                  )}
                </>
              )}
              {chartType === "pie" &&
                tbBtn("donut", <TbChartDonut2 size={14} />, pieDonut, () =>
                  updateAttributes({ pieDonut: !pieDonut })
                )}
            </div>
            <ToolbarDivider />

            <div style={rowStyle}>
              {tbBtn("swap", <TbMathXy size={14} />, isAxesSwapped, () =>
                updateAttributes({ isAxesSwapped: !isAxesSwapped })
              )}
              {tbBtn("y-axis", <TbAxisY size={14} />, viewYLabel, () =>
                updateAttributes({ viewYLabel: !viewYLabel })
              )}
              {tbBtn("grid", <TbGrid4X4 size={14} />, showGrid, () =>
                updateAttributes({ showGrid: !showGrid })
              )}
              {tbMenuTrigger(
                <TbList size={14} />,
                viewLegend || openInlineMenu === "legend",
                "legend"
              )}
              {tbMenuTrigger(
                <TbListNumbers size={14} />,
                viewDataValue || openInlineMenu === "dataLabel",
                "dataLabel"
              )}
            </div>
          </ToolbarSurface>
        )}

        {showSelectionChrome && openInlineMenu === "legend" && (
          <ToolbarSurface
            style={inlineMenuStyle}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {legendPositionOptions.map((position) =>
              tbBtn(
                "legend",
                legendPositionIconMap[position],
                position === "none"
                  ? !viewLegend
                  : viewLegend && legendPosition === position,
                () => {
                  if (position === "none") {
                    updateAttributes({ viewLegend: false });
                  } else {
                    updateAttributes({
                      viewLegend: true,
                      legendPosition: position
                    });
                  }
                  setOpenInlineMenu(null);
                }
              )
            )}
          </ToolbarSurface>
        )}

        {showSelectionChrome && openInlineMenu === "dataLabel" && (
          <ToolbarSurface
            style={inlineMenuStyle}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {dataLabelOptions.map((position) =>
              tbBtn(
                "data-label-position",
                dataLabelIconMap[position],
                position === "none"
                  ? !viewDataValue
                  : viewDataValue && dataLabelPos === position,
                () => {
                  if (position === "none") {
                    updateAttributes({ viewDataValue: false });
                  } else {
                    updateAttributes({
                      viewDataValue: true,
                      dataLabelPos: position
                    });
                  }
                  setOpenInlineMenu(null);
                }
              )
            )}
          </ToolbarSurface>
        )}

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
