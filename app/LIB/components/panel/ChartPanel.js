import { t as uiText, useI18n } from "../../i18n";
import WidgetCard from "./WidgetCard";
import { useEditor } from "../../context/EditorContext";
import {
  Button,
  Card,
  ColorPicker,
  Divider,
  Segmented,
  Typography
} from "sud-ui";
import Chart from "./ChartComponent/Chart";
import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  TbChartArea,
  TbChartBar,
  TbChartDotsFilled,
  TbChartLine,
  TbChartPie,
  TbChartRadar
} from "react-icons/tb";
import { newShadowDarkSm, newShadowLightSm } from "../../constant/uiProps";
import { useDarkMode } from "../../context/DarkModeContext";
import { useSetting } from "../../context/SettingContext";

const TABLE_PART_TYPES = new Set([
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "table_row",
  "table_cell",
  "table_header"
]);

// 커서가 표 칸 안에 있으면 선택 개체가 칸이라서, 감싸는 표를 찾아 쓸 수 있게 함
function findSelectedTable(editor, selectedObject) {
  const node = selectedObject?.node;
  if (!node || !TABLE_PART_TYPES.has(node.type?.name)) return null;
  if (node.type.name === "table") return selectedObject;
  try {
    const $pos = editor.state.doc.resolve(selectedObject.from);
    for (let depth = $pos.depth; depth > 0; depth--) {
      const parent = $pos.node(depth);
      if (parent.type.name === "table") {
        const from = $pos.before(depth);
        return { node: parent, from, to: from + parent.nodeSize };
      }
    }
  } catch {
    return null;
  }
  return null;
}

const DEFAULT_COLORS = [
  "#13c2c2",
  "#1677ff",
  "#52c41a",
  "#eb4d28",
  "#a0d911",
  "#346aa3"
];

export default function ChartPanel({ dragHandleProps }) {
  useI18n();
  const { selectedObject, editor } = useEditor();
  const { isDarkMode, currentColors } = useDarkMode();
  const { setting } = useSetting();

  const selectedType = selectedObject?.node?.type?.name;
  const selectedTable = useMemo(
    () => (editor ? findSelectedTable(editor, selectedObject) : null),
    [editor, selectedObject]
  );
  const isTableSelected = Boolean(selectedTable);
  const isChartSelected = selectedType === "chartBlock";
  const isActive = isTableSelected || isChartSelected;

  const shadow = isDarkMode ? newShadowDarkSm : newShadowLightSm;

  // Chart state
  const [tableData, setTableData] = useState([
    [uiText("구분"), uiText("항목1")],
    [uiText("데이터1"), "10"]
  ]);
  const [chartType, setChartType] = useState("bar");
  const [isAxesSwapped, setIsAxesSwapped] = useState(false);
  const [viewDataValue, setViewDataValue] = useState(false);
  const [viewLegend, setViewLegend] = useState(false);
  const [viewYLabel, setViewYLabel] = useState(true);
  const [chartColors, setChartColors] = useState([]);
  const [openPickerIndex, setOpenPickerIndex] = useState(null);

  const chartRef = useRef(null);
  const prevFromRef = useRef(null);

  // ── 테이블 선택 시: 문서 테이블 데이터 추출 ──
  useEffect(() => {
    if (!selectedTable) return;
    const tableNode = selectedTable.node;
    const extracted = [];
    for (let i = 0; i < tableNode.childCount; i++) {
      const row = tableNode.child(i);
      const rowData = [];
      for (let j = 0; j < row.childCount; j++) {
        rowData.push(row.child(j).textContent || "");
      }
      extracted.push(rowData);
    }
    const newStr = JSON.stringify(extracted);
    if (newStr !== JSON.stringify(tableData)) setTableData(extracted);
  }, [selectedTable, tableData]);

  // ── 차트 선택 시: 차트 속성 로드 ──
  useEffect(() => {
    if (!isChartSelected) return;
    const from = selectedObject?.from;
    if (from === prevFromRef.current) return;
    prevFromRef.current = from;

    const a = selectedObject.node.attrs;
    try {
      setTableData(JSON.parse(a.tableData || "[]") || [["", ""]]);
    } catch {
      setTableData([["", ""]]);
    }
    try {
      setChartColors(JSON.parse(a.chartColors || "[]") || []);
    } catch {
      setChartColors([]);
    }
    setChartType(a.chartType || "bar");
    setIsAxesSwapped(!!a.isAxesSwapped);
  }, [isChartSelected, selectedObject?.from, selectedObject?.node?.attrs]);

  // ── 색상 개수 동기화 ──
  const chartColorIndex = useMemo(() => {
    if (!tableData || tableData.length === 0) return 0;
    if (isAxesSwapped) {
      return chartType === "pie"
        ? tableData[0].length - 1
        : tableData.length - 1;
    }
    return chartType === "pie" ? tableData.length - 1 : tableData[0].length - 1;
  }, [tableData, isAxesSwapped, chartType]);

  useEffect(() => {
    if (chartColorIndex <= 0) return;
    setChartColors((prev) => {
      if (prev.length === chartColorIndex) return prev;
      const next = [...prev];
      if (next.length < chartColorIndex) {
        for (let i = next.length; i < chartColorIndex; i++) {
          next[i] = DEFAULT_COLORS[i % DEFAULT_COLORS.length];
        }
      }
      return next.slice(0, chartColorIndex);
    });
  }, [chartColorIndex]);

  // ── 현재 차트 속성 수집 (신규 삽입용) ──
  const getAttrs = () => ({
    tableData: JSON.stringify(tableData),
    chartType,
    chartColors: JSON.stringify(chartColors),
    isAxesSwapped
  });

  // ── 문서에 삽입 (테이블 아래) ──
  const insertChartToDoc = () => {
    if (!tableData || !editor || !selectedTable) return;
    editor
      .chain()
      .focus()
      .insertContentAt(selectedTable.to, {
        type: "chartBlock",
        attrs: getAttrs()
      })
      .run();
  };

  // ── 차트 업데이트 (데이터·색상만) ──
  const updateChart = () => {
    if (!isChartSelected || !editor) return;
    editor.commands.updateChartBlock(selectedObject.from, {
      tableData: JSON.stringify(tableData),
      chartColors: JSON.stringify(chartColors)
    });
  };

  // ── 편집 가능 테이블 핸들러 ──
  const updateCell = (ri, ci, value) => {
    setTableData((prev) =>
      prev.map((row, r) =>
        r === ri ? row.map((c, i) => (i === ci ? value : c)) : row
      )
    );
  };
  const addRow = () =>
    setTableData((prev) => [...prev, new Array(prev[0]?.length || 2).fill("")]);
  const removeRow = (ri) =>
    setTableData((prev) => prev.filter((_, i) => i !== ri));
  const addCol = () => setTableData((prev) => prev.map((row) => [...row, ""]));
  const removeCol = (ci) =>
    setTableData((prev) =>
      prev[0]?.length > 1
        ? prev.map((row) => row.filter((_, i) => i !== ci))
        : prev
    );

  if (!isActive) {
    return (
      <WidgetCard
        icon={TbChartDotsFilled}
        title={uiText("차트")}
        dragHandleProps={dragHandleProps}
        widgetType="madeChart"
      >
        <Typography color="cool-gray-7" size="sm">
          {uiText("테이블 또는 차트를 선택하세요")}</Typography>
      </WidgetCard>
    );
  }

  const numCols = tableData[0]?.length || 0;

  return (
    <WidgetCard
      icon={TbChartDotsFilled}
      title={uiText("차트")}
      dragHandleProps={dragHandleProps}
      widgetType="madeChart"
    >
      <div className="flex flex-col gap-2 w-full">
        {/* ── 데이터 편집 테이블 ── */}

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              fontSize: 11
            }}
          >
            <tbody>
              {tableData.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        border: `1px solid ${currentColors.white[4]}`,
                        padding: 0,
                        minWidth: 36
                      }}
                    >
                      <input
                        value={cell}
                        onChange={(e) => updateCell(ri, ci, e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          width: "100%",
                          border: "none",
                          padding: "2px 4px",
                          fontSize: 11,
                          background:
                            ri === 0 ? currentColors.white[9] : "transparent",
                          outline: "none",
                          minWidth: 36
                        }}
                      />
                    </td>
                  ))}
                  <td style={{ border: "none", paddingLeft: 2 }}>
                    <button
                      onClick={() => removeRow(ri)}
                      style={{
                        cursor: "pointer",
                        fontSize: 10,
                        color: currentColors.white[7],
                        background: "none",
                        border: "none",
                        padding: "0 2px"
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                {tableData[0]?.map((_, ci) => (
                  <td
                    key={ci}
                    style={{
                      border: "none",
                      textAlign: "center",
                      paddingTop: 2
                    }}
                  >
                    <button
                      onClick={() => removeCol(ci)}
                      style={{
                        cursor: "pointer",
                        fontSize: 10,
                        color: "#999",
                        background: "none",
                        border: "none",
                        padding: "0 2px"
                      }}
                    >
                      ✕
                    </button>
                  </td>
                ))}
                <td style={{ border: "none" }} />
              </tr>
            </tbody>
          </table>
        </div>
        {tableData && isTableSelected && (
          <div className="flex flex-col gap-2 items-center w-full">
            <Segmented
              options={[
                { value: "bar", label: <TbChartBar /> },
                { value: "line", label: <TbChartLine /> },
                { value: "area", label: <TbChartArea /> },
                { value: "pie", label: <TbChartPie /> },
                { value: "radar", label: <TbChartRadar /> }
              ]}
              value={chartType}
              onChange={setChartType}
              block
              background={setting.theme}
              color={`${setting.theme}-1`}
              {...shadow}
            />

            <div className="grid grid-cols-4 w-full gap-2">
              <Button
                size="sm"
                onClick={() => setIsAxesSwapped(!isAxesSwapped)}
                border={false}
                {...shadow}
                color="white-1"
                background="white-10"
              >
                <Typography size="sm">{uiText("X/Y 축 전환")}</Typography>
              </Button>
              <Button
                size="sm"
                onClick={() => setViewDataValue(!viewDataValue)}
                background={!viewDataValue && "neutral-2"}
                color={viewDataValue ? "blue" : "neutral"}
                border={false}
                {...shadow}
              >
                <Typography size="sm">{uiText("데이터 값")}</Typography>
              </Button>
              <Button
                size="sm"
                onClick={() => setViewYLabel(!viewYLabel)}
                background={!viewYLabel && "neutral-2"}
                color={viewYLabel ? "blue" : "neutral"}
                border={false}
                {...shadow}
              >
                <Typography size="sm">{uiText("Y축 라벨")}</Typography>
              </Button>
              <Button
                size="sm"
                onClick={() => setViewLegend(!viewLegend)}
                background={!viewLegend && "neutral-2"}
                color={viewLegend ? "blue" : "neutral"}
                border={false}
                {...shadow}
              >
                <Typography size="sm">{uiText("범례")}</Typography>
              </Button>
            </div>
          </div>
        )}

        {/* ── 색상 ── */}
        {chartColors.length > 0 && (
          <>
            <Divider style={{ margin: "0" }} />
            <div
              className="grid w-full gap-2"
              style={{
                gridTemplateColumns: `repeat(${Math.min(
                  chartColors.length,
                  7
                )}, minmax(0, 1fr))`
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {chartColors.map((color, index) => {
                return (
                  <div
                    key={index}
                    className="flex flex-col w-full"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <ColorPicker
                      className="w-full"
                      open={openPickerIndex === index}
                      setOpen={(isOpen) =>
                        setOpenPickerIndex(isOpen ? index : null)
                      }
                      color={color}
                      onChange={(c) => {
                        // 색상 선택기는 화면에 그려질 때도 현재 색으로 onChange를 부름
                        // 같은 색이면 상태를 바꾸지 않아 무한 갱신이 생기지 않게 함
                        if (c.hex.toLowerCase() === String(color).toLowerCase()) return;
                        setChartColors((prev) => {
                          const next = [...prev];
                          next[index] = c.hex;
                          return next;
                        });
                        setOpenPickerIndex(null);
                      }}
                      mode="preset"
                    >
                      <Button
                        className="w-full"
                        background={color}
                        border={false}
                        {...shadow}
                      />
                    </ColorPicker>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── 미리보기 ── */}
        {isTableSelected && (
          <Card shadow="none" width="100%" border={false} {...shadow}>
            <Chart
              ref={chartRef}
              tableData={tableData}
              chartType={chartType}
              isAxesSwapped={isAxesSwapped}
              chartColors={chartColors}
            />
          </Card>
        )}

        {/* ── 버튼 ── */}
        {isTableSelected && (
          <Button
            onClick={insertChartToDoc}
            size="sm"
            border={false}
            {...shadow}
            style={{ width: "100%" }}
          >
            <Typography size="xs">{uiText("문서에 삽입")}</Typography>
          </Button>
        )}
        {isChartSelected && (
          <Button
            onClick={updateChart}
            size="sm"
            border={false}
            {...shadow}
            style={{ width: "100%" }}
          >
            <Typography size="xs">{uiText("차트 업데이트")}</Typography>
          </Button>
        )}
      </div>
    </WidgetCard>
  );
}
