import { t as uiText, useI18n } from "../../../i18n";
import {
  TbColumnInsertLeft,
  TbColumnInsertRight,
  TbColumnRemove,
  TbColumns3,
  TbFreezeColumn,
  TbFreezeRow,
  TbRowInsertBottom,
  TbRowInsertTop,
  TbRowRemove,
  TbTrash
} from "react-icons/tb";
import { LuTable2, LuTableCellsMerge, LuTableCellsSplit } from "react-icons/lu";
import {
  Button,
  Card,
  ColorPicker,
  Divider,
  Input,
  Select,
  Switch,
  Tabs,
  Tooltip,
  Typography
} from "sud-ui";
import {
  MdOutlineTableRows,
  MdVerticalAlignTop,
  MdVerticalAlignCenter,
  MdVerticalAlignBottom
} from "react-icons/md";
import { PiRectangleDuotone } from "react-icons/pi";
import { RiCustomSize } from "react-icons/ri";
import { CgColorBucket } from "react-icons/cg";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSetting } from "../../../context/SettingContext";
import { CellSelection, TableMap, cellAround } from "@tiptap/pm/tables";
import {
  inputProps,
  newShadowDarkSm,
  newShadowLightSm,
  withOverlayShadow
} from "@/app/LIB/constant/uiProps";

// 1mm = 96/25.4 px
const MM_TO_PX = 96 / 25.4;
const pxToMm = (px) => Math.round((px / MM_TO_PX) * 10) / 10;
const mmToPx = (mm) => Math.round(mm * MM_TO_PX);
const MIN_COLUMN_WIDTH_PX = 25;
const MIN_COLUMN_WIDTH_MM = pxToMm(MIN_COLUMN_WIDTH_PX);
const MIN_ROW_HEIGHT_PX = 12;
const MIN_ROW_HEIGHT_MM = pxToMm(MIN_ROW_HEIGHT_PX);
const CELL_BORDER_SIDES = ["top", "right", "bottom", "left"];
const CELL_BORDER_SIDE_OPTIONS = [
  { get label() { return uiText("전체"); }, value: "all" },
  { get label() { return uiText("위"); }, value: "top" },
  { get label() { return uiText("오른쪽"); }, value: "right" },
  { get label() { return uiText("아래"); }, value: "bottom" },
  { get label() { return uiText("왼쪽"); }, value: "left" }
];
const CELL_BORDER_STYLE_OPTIONS = [
  { get label() { return uiText("실선"); }, value: "solid" },
  { get label() { return uiText("파선"); }, value: "dashed" },
  { get label() { return uiText("점선"); }, value: "dotted" },
  { get label() { return uiText("이중선"); }, value: "double" },
  { get label() { return uiText("없음"); }, value: "none" }
];

const capitalizeCellBorderSide = (side) =>
  side.charAt(0).toUpperCase() + side.slice(1);

const getCellBorderAttrKey = (side, kind) =>
  side === "all"
    ? `border${kind}`
    : `border${capitalizeCellBorderSide(side)}${kind}`;

const firstDefinedCellBorderValue = (...values) =>
  values.find((value) => value !== null && value !== undefined && value !== "") ??
  null;

const readCellBorderValue = (attrs, side, kind) => {
  if (side !== "all") {
    return firstDefinedCellBorderValue(
      attrs[getCellBorderAttrKey(side, kind)],
      attrs[`border${kind}`]
    );
  }

  return firstDefinedCellBorderValue(
    attrs[`border${kind}`],
    ...CELL_BORDER_SIDES.map(
      (cellSide) => attrs[getCellBorderAttrKey(cellSide, kind)]
    )
  );
};

const normalizeCellBorderColor = (color) =>
  typeof color === "string" && color.trim() ? color.trim() : null;

const normalizeCellBorderWidth = (width) => {
  if (width === null || width === undefined || width === "") {
    return null;
  }

  const numericWidth = Number(width);

  return Number.isFinite(numericWidth) && numericWidth >= 0
    ? numericWidth
    : null;
};

const buildCellBorderAttrs = (side, { color, style, width }) => {
  const nextColor = normalizeCellBorderColor(color);
  const nextStyle =
    typeof style === "string" && style.trim() ? style.trim() : null;
  const nextWidth = normalizeCellBorderWidth(width);
  const attrs = {};

  if (side === "all") {
    attrs.borderColor = nextColor;
    attrs.borderStyle = nextStyle;
    attrs.borderWidth = nextWidth;
    CELL_BORDER_SIDES.forEach((cellSide) => {
      attrs[getCellBorderAttrKey(cellSide, "Color")] = null;
      attrs[getCellBorderAttrKey(cellSide, "Style")] = null;
      attrs[getCellBorderAttrKey(cellSide, "Width")] = null;
    });

    return attrs;
  }

  attrs[getCellBorderAttrKey(side, "Color")] = nextColor;
  attrs[getCellBorderAttrKey(side, "Style")] = nextStyle;
  attrs[getCellBorderAttrKey(side, "Width")] = nextWidth;

  return attrs;
};

// 에디터 state에서 커서가 속한 table 노드의 위치를 찾는 헬퍼
function findTablePosFromEditor(editor) {
  if (!editor) return null;
  const { selection } = editor.state;
  if (selection.node?.type.name === "table") return selection.from;
  const $from = selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "table") return $from.before(d);
  }
  return null;
}

function getTableContextFromEditor(editor) {
  const tablePos = findTablePosFromEditor(editor);

  if (tablePos == null) {
    return null;
  }

  const tableNode = editor.state.doc.nodeAt(tablePos);

  if (!tableNode) {
    return null;
  }

  return {
    tablePos,
    tableNode,
    map: TableMap.get(tableNode)
  };
}

function getSelectedColumnIndexes(editor, tablePos, map) {
  const { selection } = editor.state;
  const columns = new Set();

  if (selection instanceof CellSelection) {
    selection.forEachCell((_, pos) => {
      const rect = map.findCell(pos - tablePos - 1);

      for (let col = rect.left; col < rect.right; col += 1) {
        columns.add(col);
      }
    });
  } else {
    const $cell = cellAround(selection.$head) || cellAround(selection.$from);

    if (!$cell) {
      return [];
    }

    const rect = map.findCell($cell.pos - tablePos - 1);
    columns.add(rect.left);
  }

  return [...columns].sort((a, b) => a - b);
}

function getSelectedRowIndexes(editor, tablePos, tableNode) {
  const { selection } = editor.state;
  const rowPositions = new Set();

  if (selection instanceof CellSelection) {
    selection.forEachCell((_, pos) => {
      const $pos = editor.state.doc.resolve(pos);

      for (let depth = $pos.depth; depth > 0; depth -= 1) {
        if ($pos.node(depth).type.name !== "tableRow") {
          continue;
        }

        rowPositions.add($pos.before(depth));
        break;
      }
    });
  } else {
    for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
      if (selection.$from.node(depth).type.name !== "tableRow") {
        continue;
      }

      rowPositions.add(selection.$from.before(depth));
      break;
    }
  }

  const rowIndexes = [];
  let rowPos = tablePos + 1;

  for (let index = 0; index < tableNode.childCount; index += 1) {
    const rowNode = tableNode.child(index);

    if (rowPositions.has(rowPos)) {
      rowIndexes.push(index);
    }

    rowPos += rowNode.nodeSize;
  }

  return rowIndexes;
}

export default function TableEditor({
  editor,
  selectedObject,
  isDarkMode,
  setting
}) {
  useI18n();
  // ■■■■■■■■■■■ 버튼 헬퍼 ■■■■■■■■■■■■■
  const renderBtn = (icon, onClick, key, tooltip) => {
    const Icon = icon;
    return (
      <Button
        key={key || icon?.displayName || icon?.name}
        onClick={onClick}
        size="sm"
        border={false}
        {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
        color={`white-1`}
        background={"white-10"}
        icon={
          <Tooltip
            content={
              <Typography size="xs" pretendard="M">
                {tooltip}
              </Typography>
            }
            placement="bottom"
            background={`${setting.theme}-7`}
            color={`${setting.theme}-1`}
            border={false}
            style={withOverlayShadow({}, isDarkMode)}
          >
            <Icon size={20} />
          </Tooltip>
        }
      />
    );
  };

  // ■■■■■■■■■■■ 상태 ■■■■■■■■■■■■■■■■■■
  const [headerColorPickerOpen, setHeaderColorPickerOpen] = useState(false);
  const [borderColorPickerOpen, setBorderColorPickerOpen] = useState(false);
  const [headerColor, setHeaderColor] = useState("");
  const [borderColor, setBorderColor] = useState("");
  const [borderStyle, setBorderStyle] = useState("solid");
  const [borderWidth, setBorderWidth] = useState(1);

  // 셀 커스텀 상태
  const [cellBackgroundColorPickerOpen, setCellBackgroundColorPickerOpen] =
    useState(false);
  const [cellBackgroundColor, setCellBackgroundColor] = useState("");
  const [cellBorderColorPickerOpen, setCellBorderColorPickerOpen] =
    useState(false);
  const [cellBorderSide, setCellBorderSide] = useState("all");
  const [cellBorderColor, setCellBorderColor] = useState("");
  const [cellBorderStyle, setCellBorderStyle] = useState("solid");
  const [cellBorderWidth, setCellBorderWidth] = useState(1);
  const [verticalAlign, setVerticalAlign] = useState(null); // null | 'top' | 'middle' | 'bottom'
  const [columnWidth, setColumnWidth] = useState(""); // mm 단위 표시
  const [rowHeight, setRowHeight] = useState(""); // mm 단위

  // 입력 포커스 여부 추적 (포커스 중엔 에디터 상태로 덮어쓰지 않음)
  const colWidthFocusedRef = useRef(false);
  const rowHeightFocusedRef = useRef(false);
  // 사용자가 직접 입력한 mm 값 추적 (px 왕복 손실 방지)
  const colWidthMmRef = useRef("");

  // ■■■■■■■■■■■ 에디터 상태에서 읽기 ■■■■■■■■■■■
  const readFromState = useCallback(() => {
    if (!editor) return;
    const { state } = editor;
    const { selection } = state;

    // 테이블 레벨 속성 읽기
    const tablePos = findTablePosFromEditor(editor);
    if (tablePos !== null) {
      const tableNode = state.doc.nodeAt(tablePos);
      if (tableNode) {
        setHeaderColor(tableNode.attrs.headerColor || "");
        setBorderColor(tableNode.attrs.borderColor || "");
        setBorderStyle(tableNode.attrs.borderStyle || "solid");
        setBorderWidth(tableNode.attrs.borderWidth ?? 1);
      }
    }

    // 셀 레벨 속성 읽기
    for (let d = selection.$from.depth; d > 0; d--) {
      const node = selection.$from.node(d);
      if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
        const attrs = node.attrs || {};
        const nextCellBorderWidth = readCellBorderValue(
          attrs,
          cellBorderSide,
          "Width"
        );

        setCellBackgroundColor(node.attrs.backgroundColor || "");
        setCellBorderColor(
          readCellBorderValue(attrs, cellBorderSide, "Color") || ""
        );
        setCellBorderStyle(
          readCellBorderValue(attrs, cellBorderSide, "Style") || "solid"
        );
        setCellBorderWidth(
          nextCellBorderWidth !== null && nextCellBorderWidth !== undefined
            ? nextCellBorderWidth
            : 1
        );
        setVerticalAlign(node.attrs.verticalAlign || null);
        if (!colWidthFocusedRef.current) {
          const cw = node.attrs.colwidth?.[0];
          if (cw) {
            // 현재 입력값을 px로 환산했을 때 동일한 값이면 덮어쓰지 않음 (1mm→4px→1.1mm 손실 방지)
            const currentPx = colWidthMmRef.current
              ? mmToPx(parseFloat(colWidthMmRef.current))
              : -1;
            if (currentPx !== cw) {
              const newMm = String(pxToMm(cw));
              colWidthMmRef.current = newMm;
              setColumnWidth(newMm);
            }
          } else {
            colWidthMmRef.current = "";
            setColumnWidth("");
          }
        }
        break;
      }
    }

    // 행 레벨 속성 읽기
    for (let d = selection.$from.depth; d > 0; d--) {
      const node = selection.$from.node(d);
      if (node.type.name === "tableRow") {
        if (!rowHeightFocusedRef.current) {
          setRowHeight(
            node.attrs.height != null ? String(node.attrs.height) : ""
          );
        }
        break;
      }
    }
  }, [editor, cellBorderSide]);

  // 에디터 이벤트 구독
  useEffect(() => {
    if (!editor) return;
    editor.on("transaction", readFromState);
    editor.on("selectionUpdate", readFromState);
    return () => {
      editor.off("transaction", readFromState);
      editor.off("selectionUpdate", readFromState);
    };
  }, [editor, readFromState]);

  // selectedObject(선택 셀)가 바뀔 때마다 최신 값으로 동기화
  useEffect(() => {
    readFromState();
  }, [selectedObject, readFromState]);

  // ■■■■■■■■■■■ 헬퍼 ■■■■■■■■■■■■■■■■■■
  const updateTableAttr = (key, rawValue) => {
    if (!editor) return;
    const tablePos = findTablePosFromEditor(editor);
    if (tablePos === null) return;
    const val = rawValue === "" || rawValue == null ? null : Number(rawValue);
    const node = editor.state.doc.nodeAt(tablePos);
    if (!node) return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(tablePos, undefined, {
        ...node.attrs,
        [key]: val
      })
    );
  };

  const equalizeSelectedColumnWidths = useCallback(() => {
    if (!editor) {
      return;
    }

    const tableContext = getTableContextFromEditor(editor);

    if (!tableContext) {
      return;
    }

    const selectedColumns = getSelectedColumnIndexes(
      editor,
      tableContext.tablePos,
      tableContext.map
    );

    if (selectedColumns.length === 0) {
      return;
    }

    const tableDom = editor.view.nodeDOM(tableContext.tablePos);
    const colElements =
      tableDom instanceof HTMLElement
        ? Array.from(tableDom.querySelectorAll("colgroup > col"))
        : [];

    if (colElements.length === 0) {
      return;
    }

    const totalWidth = selectedColumns.reduce((sum, colIndex) => {
      const width =
        colElements[colIndex]?.getBoundingClientRect().width ||
        parseFloat(colElements[colIndex]?.style.width) ||
        MIN_COLUMN_WIDTH_PX;

      return sum + width;
    }, 0);
    const nextWidthPx = Math.max(
      MIN_COLUMN_WIDTH_PX,
      Math.round((totalWidth / selectedColumns.length) * 10) / 10
    );
    const nextWidthMm = String(pxToMm(nextWidthPx));

    colWidthMmRef.current = nextWidthMm;
    setColumnWidth(nextWidthMm);
    editor.chain().setColumnWidth(nextWidthPx).run();
  }, [editor]);

  const equalizeSelectedRowHeights = useCallback(() => {
    if (!editor) {
      return;
    }

    const tableContext = getTableContextFromEditor(editor);

    if (!tableContext) {
      return;
    }

    const selectedRows = getSelectedRowIndexes(
      editor,
      tableContext.tablePos,
      tableContext.tableNode
    );

    if (selectedRows.length === 0) {
      return;
    }

    const tableDom = editor.view.nodeDOM(tableContext.tablePos);
    const rowElements =
      tableDom instanceof HTMLElement
        ? Array.from(
            tableDom.querySelectorAll(
              "tbody > tr:not(.tiptap-table-page-break-row)"
            )
          )
        : [];

    if (rowElements.length === 0) {
      return;
    }

    const totalHeight = selectedRows.reduce((sum, rowIndex) => {
      const height =
        rowElements[rowIndex]?.getBoundingClientRect().height ||
        parseFloat(rowElements[rowIndex]?.style.height) ||
        MIN_ROW_HEIGHT_PX;

      return sum + height;
    }, 0);
    const nextHeightMm = Math.max(
      MIN_ROW_HEIGHT_MM,
      pxToMm(totalHeight / selectedRows.length)
    );

    setRowHeight(String(nextHeightMm));
    editor.chain().setRowHeight(nextHeightMm).run();
  }, [editor]);

  const applyCellBackgroundColor = useCallback(
    (color) => {
      if (!editor) {
        return;
      }

      const nextColor =
        typeof color === "string" && color.trim() ? color.trim() : null;

      setCellBackgroundColor(nextColor || "");
      editor
        .chain()
        .focus()
        .setCellAttribute("backgroundColor", nextColor)
        .run();
    },
    [editor]
  );

  const applySelectedCellAttrs = useCallback(
    (attrs, { focusEditor = true } = {}) => {
      if (!editor) {
        return;
      }

      // Number inputs must retain their DOM focus while a transaction updates
      // the selected cell. Controls whose pointer handling intentionally keeps
      // the editor active can still opt into the previous focus behavior.
      const chain = focusEditor ? editor.chain().focus() : editor.chain();

      Object.entries(attrs).forEach(([key, value]) => {
        chain.setCellAttribute(key, value);
      });

      chain.run();
    },
    [editor]
  );

  const applyCellBorder = useCallback(
    (nextValues = {}) => {
      const nextColor =
        nextValues.color !== undefined ? nextValues.color : cellBorderColor;
      const nextStyle =
        nextValues.style !== undefined ? nextValues.style : cellBorderStyle;
      const nextWidth =
        nextValues.width !== undefined ? nextValues.width : cellBorderWidth;
      const normalizedWidth = normalizeCellBorderWidth(nextWidth);

      setCellBorderColor(normalizeCellBorderColor(nextColor) || "");
      setCellBorderStyle(nextStyle || "solid");
      setCellBorderWidth(normalizedWidth !== null ? normalizedWidth : "");
      applySelectedCellAttrs(
        buildCellBorderAttrs(cellBorderSide, {
          color: nextColor,
          style: nextStyle,
          width: nextWidth
        }),
        { focusEditor: false }
      );
    },
    [
      applySelectedCellAttrs,
      cellBorderColor,
      cellBorderSide,
      cellBorderStyle,
      cellBorderWidth
    ]
  );

  const clearCellBorder = useCallback(() => {
    setCellBorderColor("");
    setCellBorderStyle("solid");
    setCellBorderWidth(1);
    applySelectedCellAttrs(
      buildCellBorderAttrs(cellBorderSide, {
        color: null,
        style: null,
        width: null
      }),
      { focusEditor: false }
    );
  }, [applySelectedCellAttrs, cellBorderSide]);

  const renderColorPicker = (color, pickerOpen, setPickerOpen, onChange) => {
    return (
      <ColorPicker
        open={pickerOpen}
        setOpen={setPickerOpen}
        color={color}
        onChange={(color) => {
          if (editor) {
            onChange(color.hex);
          }
        }}
        mode="preset"
      >
        <Button
          size="sm"
          border={false}
          {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
          icon={<CgColorBucket size={20} />}
          color={`white-1`}
          background={"white-10"}
        />
      </ColorPicker>
    );
  };

  // ■■■■■■■■■■■ 버튼 목록 ■■■■■■■■■■■■■
  const columnBtnList = [
    {
      icon: TbColumnInsertLeft,
      tooltip: uiText("왼쪽에 열 추가"),
      onClick: () => editor.chain().focus().addColumnBefore().run()
    },
    {
      icon: TbColumnInsertRight,
      tooltip: uiText("오른쪽에 열 추가"),
      onClick: () => editor.chain().focus().addColumnAfter().run()
    },
    {
      icon: TbColumnRemove,
      tooltip: uiText("열 삭제"),
      onClick: () => editor.chain().focus().deleteColumn().run()
    },
    {
      icon: TbFreezeColumn,
      tooltip: uiText("열 제목 토글"),
      onClick: () => editor.chain().focus().toggleHeaderColumn().run()
    }
  ];

  const rowBtnList = [
    {
      icon: TbRowInsertBottom,
      tooltip: uiText("아래에 행 추가"),
      onClick: () => editor.chain().focus().addRowAfter().run()
    },
    {
      icon: TbRowInsertTop,
      tooltip: uiText("위에 행 추가"),
      onClick: () => editor.chain().focus().addRowBefore().run()
    },
    {
      icon: TbRowRemove,
      tooltip: uiText("행 삭제"),
      onClick: () => editor.chain().focus().deleteRow().run()
    },
    {
      icon: TbFreezeRow,
      tooltip: uiText("행 제목 토글"),
      onClick: () => editor.chain().focus().toggleHeaderRow().run()
    }
  ];

  const cellBtnList = [
    {
      icon: LuTableCellsMerge,
      tooltip: uiText("셀 병합"),
      onClick: () => editor.chain().focus().mergeCells().run()
    },
    {
      icon: LuTableCellsSplit,
      tooltip: uiText("셀 나누기"),
      onClick: () => editor.chain().focus().splitCell().run()
    },
    {
      icon: LuTable2,
      tooltip: uiText("셀 헤더 토글"),
      onClick: () => editor.chain().focus().toggleHeaderCell().run()
    }
  ];

  // ■■■■■■■■■■■ 세로 정렬 버튼 ■■■■■■■■■■■
  const alignBtnList = [
    { icon: MdVerticalAlignTop, value: "top", tooltip: uiText("위 정렬") },
    { icon: MdVerticalAlignCenter, value: "middle", tooltip: uiText("가운데 정렬") },
    { icon: MdVerticalAlignBottom, value: "bottom", tooltip: uiText("아래 정렬") }
  ];

  // ■■■■■■■■■■■ 탭 구성 ■■■■■■■■■■■■■
  const tabOptions = [
    {
      key: "structure",
      label: <LuTable2 />,
      children: (
        <div className="flex flex-col gap-2 w-full">
          {/* 열 */}
          <div className="flex flex-col gap-2">
            <Typography
              as="div"
              className="flex gap-1 items-center"
              size="sm"
              pretendard="B"
              color={"white-1"}
            >
              <TbColumns3 /> {uiText(" 열(Column)")}</Typography>
            <Card
              shadow="none"
              width="100%"
              border={false}
              background={`${setting.theme}-1`}
            >
              <div className="grid grid-cols-4 gap-2">
                {columnBtnList.map(({ icon, onClick, tooltip }) =>
                  renderBtn(icon, onClick, `column-${tooltip}`, tooltip)
                )}
              </div>
            </Card>
          </div>
          {/* 행 */}
          <div className="flex flex-col gap-2">
            <Typography
              as="div"
              className="flex gap-1 items-center"
              size="sm"
              pretendard="B"
              color={"white-1"}
            >
              <MdOutlineTableRows /> {uiText(" 행(Row)")}</Typography>
            <Card
              shadow="none"
              width="100%"
              border={false}
              background={`${setting.theme}-1`}
            >
              <div className="grid grid-cols-4 gap-2">
                {rowBtnList.map(({ icon, onClick, tooltip }) =>
                  renderBtn(icon, onClick, `row-${tooltip}`, tooltip)
                )}
              </div>
            </Card>
          </div>
          {/* 셀 */}
          <div className="flex flex-col gap-2">
            <Typography
              as="div"
              className="flex gap-1 items-center"
              size="sm"
              pretendard="B"
              color={"white-1"}
            >
              <PiRectangleDuotone /> {uiText(" 셀(Cell)")}</Typography>
            <Card
              shadow="none"
              width="100%"
              border={false}
              background={`${setting.theme}-1`}
            >
              <div className="grid grid-cols-4 gap-2">
                {cellBtnList.map(({ icon, onClick, tooltip }) =>
                  renderBtn(icon, onClick, `cell-${tooltip}`, tooltip)
                )}
              </div>
            </Card>
          </div>
          <Button
            onClick={() => editor.chain().focus().deleteTable().run()}
            size="sm"
            icon={<TbTrash />}
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
            color={"white-1"}
            background={"white-10"}
          >
            {uiText("테이블 삭제")}</Button>
        </div>
      )
    },
    {
      key: "style",
      label: <CgColorBucket />,
      children: (
        <div className="flex flex-col gap-2 w-full">
          {/* 헤더 */}
          <div className="flex flex-col gap-2">
            <Typography pretendard="SB" color={"white-1"}>
              {uiText("헤더")}</Typography>
            <div className="flex items-center justify-between">
              <Typography size="sm" color={"white-1"}>
                {uiText("배경색")}</Typography>
              <div onMouseDown={(e) => e.preventDefault()}>
                {renderColorPicker(
                  headerColor,
                  headerColorPickerOpen,
                  setHeaderColorPickerOpen,
                  (color) => {
                    setHeaderColor(color);
                    editor.chain().focus().setHeaderColor(color).run();
                  }
                )}
              </div>
            </div>
          </div>
          <Divider />
          {/* 테두리 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Typography pretendard="SB" color={"white-1"}>
                {uiText("테두리")}</Typography>
              <Switch
                size="sm"
                checked={borderWidth > 0}
                onChange={(checked) => {
                  const newWidth = checked ? 1 : 0;
                  setBorderWidth(newWidth);
                  editor.chain().setBorderWidth(newWidth).run();
                }}
                onColor={`${setting.theme}-7`}
              />
            </div>
            {borderWidth > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Typography size="sm" color={"white-1"}>
                    {uiText("선색")}</Typography>
                  <div onMouseDown={(e) => e.preventDefault()}>
                    {renderColorPicker(
                      borderColor,
                      borderColorPickerOpen,
                      setBorderColorPickerOpen,
                      (color) => {
                        setBorderColor(color);
                        editor.chain().focus().setBorderColor(color).run();
                      }
                    )}
                  </div>
                </div>
                <div
                  className="flex items-center gap-8"
                  onMouseDown={(e) => {
                    if (e.target.tagName !== "INPUT") e.preventDefault();
                  }}
                >
                  <Typography size="sm" className="shrink-0" color={"white-1"}>
                    {uiText("선 두께")}</Typography>
                  <Input
                    {...inputProps}
                    type="number"
                    value={borderWidth}
                    onChange={(e) => {
                      const num = parseFloat(e.target.value);
                      if (!isNaN(num) && num > 0) {
                        setBorderWidth(num);
                        editor.chain().setBorderWidth(num).run();
                      }
                    }}
                    suffix="pt"
                    min={1}
                    max={10}
                    background={`${setting.theme}-1`}
                  />
                </div>
                <div onMouseDown={(e) => e.preventDefault()}>
                  <div className="flex items-center gap-8">
                    <Typography
                      size="sm"
                      className="shrink-0"
                      color={"white-1"}
                    >
                      {uiText("선 타입")}</Typography>
                    <Select
                      value={borderStyle}
                      onChange={(value) => {
                        setBorderStyle(value);
                        editor.chain().setBorderStyle(value).run();
                      }}
                      {...inputProps}
                      options={[
                        { label: uiText("실선"), value: "solid" },
                        { label: uiText("대시선"), value: "dashed" },
                        { label: uiText("점선"), value: "dotted" },
                        { label: uiText("이중선"), value: "double" }
                      ]}
                      dropdownStyle={withOverlayShadow({}, isDarkMode)}
                      background={`${setting.theme}-1`}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      key: "cell",
      label: <RiCustomSize />,
      children: (
        <div className="flex flex-col gap-2 w-full">
          {/* 셀 배경색 */}
          <div className="flex flex-col gap-2">
            <Typography pretendard="SB" size="sm" color={"white-1"}>
              {uiText("셀 배경색")}</Typography>
            <div
              className="flex items-center justify-between gap-2"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="flex items-center gap-2">
                <span
                  style={{
                    display: "inline-block",
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    border: "1px solid rgba(255,255,255,0.35)",
                    backgroundColor: cellBackgroundColor || "transparent"
                  }}
                />
                <Typography size="xs" color={"white-3"}>
                  {cellBackgroundColor || uiText("없음")}
                </Typography>
              </div>
              <div className="flex items-center gap-2">
                {renderColorPicker(
                  cellBackgroundColor,
                  cellBackgroundColorPickerOpen,
                  setCellBackgroundColorPickerOpen,
                  applyCellBackgroundColor
                )}
                <Button
                  size="sm"
                  border={false}
                  {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
                  color={"white-1"}
                  background={"white-10"}
                  onClick={() => applyCellBackgroundColor(null)}
                >
                  {uiText("해제")}</Button>
              </div>
            </div>
          </div>

          <Divider />

          <div className="flex flex-col gap-2">
            <Typography pretendard="SB" size="sm" color={"white-1"}>
              {uiText("셀 테두리")}</Typography>
            <div onMouseDown={(e) => e.preventDefault()}>
              <div className="flex items-center gap-2">
                <Typography size="sm" className="shrink-0" color={"white-1"}>
                  {uiText("방향")}</Typography>
                <Select
                  value={cellBorderSide}
                  onChange={setCellBorderSide}
                  {...inputProps}
                  options={CELL_BORDER_SIDE_OPTIONS}
                  dropdownStyle={withOverlayShadow({}, isDarkMode)}
                  background={`${setting.theme}-1`}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Typography size="sm" color={"white-1"}>
                {uiText("색상")}</Typography>
              <div
                className="flex items-center gap-2"
                onMouseDown={(e) => e.preventDefault()}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    border: "1px solid rgba(255,255,255,0.35)",
                    backgroundColor: cellBorderColor || "transparent"
                  }}
                />
                {renderColorPicker(
                  cellBorderColor,
                  cellBorderColorPickerOpen,
                  setCellBorderColorPickerOpen,
                  (color) => applyCellBorder({ color })
                )}
              </div>
            </div>
            <div
              className="flex items-center gap-8"
              onMouseDown={(e) => {
                if (e.target.tagName !== "INPUT") e.preventDefault();
              }}
            >
              <Typography size="sm" className="shrink-0" color={"white-1"}>
                {uiText("두께")}</Typography>
              <Input
                {...inputProps}
                aria-label={uiText("셀 테두리 두께")}
                type="number"
                value={cellBorderWidth}
                onChange={(e) => {
                  const value = e.target.value;
                  setCellBorderWidth(value);
                  applyCellBorder({ width: value });
                }}
                suffix="pt"
                min={0}
                max={10}
                background={`${setting.theme}-1`}
              />
            </div>
            <div onMouseDown={(e) => e.preventDefault()}>
              <div className="flex items-center gap-8">
                <Typography size="sm" className="shrink-0" color={"white-1"}>
                  {uiText("선 스타일")}</Typography>
                <Select
                  value={cellBorderStyle}
                  onChange={(value) => applyCellBorder({ style: value })}
                  {...inputProps}
                  options={CELL_BORDER_STYLE_OPTIONS}
                  dropdownStyle={withOverlayShadow({}, isDarkMode)}
                  background={`${setting.theme}-1`}
                />
              </div>
            </div>
            <Button
              size="sm"
              border={false}
              {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
              color={"white-1"}
              background={"white-10"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearCellBorder}
            >
              {uiText("테두리 지우기")}</Button>
          </div>

          <Divider />

          {/* 세로 정렬 */}
          <div className="flex flex-col gap-2">
            <Typography pretendard="SB" size="sm" color={"white-1"}>
              {uiText("세로 정렬")}</Typography>
            <div className="flex gap-2">
              {alignBtnList.map(({ icon: Icon, value, tooltip }) => (
                <Tooltip
                  key={value}
                  content={
                    <Typography size="xs" pretendard="M">
                      {tooltip}
                    </Typography>
                  }
                  placement="bottom"
                  background={`${setting.theme}-7`}
                  color={`${setting.theme}-1`}
                  border={false}
                  style={withOverlayShadow({}, isDarkMode)}
                >
                  <Button
                    size="sm"
                    colorType={verticalAlign === value ? "fill" : "text"}
                    color={
                      verticalAlign === value
                        ? `${setting.theme}`
                        : `${setting.theme}-9`
                    }
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const next = verticalAlign === value ? null : value;
                      setVerticalAlign(next);
                      editor
                        .chain()
                        .focus()
                        .setCellAttribute("verticalAlign", next)
                        .run();
                    }}
                    icon={<Icon size={18} />}
                  />
                </Tooltip>
              ))}
            </div>
          </div>

          {/* 열 너비 */}
          <div
            className="flex items-center gap-8"
            onMouseDown={(e) => {
              if (e.target.tagName !== "INPUT") e.preventDefault();
            }}
          >
            <Typography size="sm" className="flex-shrink-0" color={"white-1"}>
              {uiText("열 너비")}</Typography>
            <Input
              {...inputProps}
              type="number"
              value={columnWidth}
              onFocus={() => {
                colWidthFocusedRef.current = true;
              }}
              onBlur={() => {
                colWidthFocusedRef.current = false;
                const num = parseFloat(colWidthMmRef.current);

                if (!isNaN(num) && num > 0 && num < MIN_COLUMN_WIDTH_MM) {
                  const minWidthText = String(MIN_COLUMN_WIDTH_MM);
                  colWidthMmRef.current = minWidthText;
                  setColumnWidth(minWidthText);
                }
              }}
              onChange={(e) => {
                const v = e.target.value;
                colWidthMmRef.current = v;
                setColumnWidth(v);
                const num = parseFloat(v);
                if (!isNaN(num) && num > 0) {
                  editor
                    .chain()
                    .setColumnWidth(
                      Math.max(MIN_COLUMN_WIDTH_PX, mmToPx(num))
                    )
                    .run();
                }
              }}
              suffix="mm"
              min={MIN_COLUMN_WIDTH_MM}
              max={500}
              placeholder={uiText("자동")}
              background={`${setting.theme}-1`}
            />
          </div>

          <Button
            size="sm"
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
            color={"white-1"}
            background={"white-10"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={equalizeSelectedColumnWidths}
          >
            {uiText("열 너비 같게")}</Button>

          {/* 행 높이 */}
          <div
            className="flex items-center gap-8"
            onMouseDown={(e) => {
              if (e.target.tagName !== "INPUT") e.preventDefault();
            }}
          >
            <Typography size="sm" className="flex-shrink-0" color={"white-1"}>
              {uiText("행 높이")}</Typography>
            <Input
              {...inputProps}
              type="number"
              value={rowHeight}
              onFocus={() => {
                rowHeightFocusedRef.current = true;
              }}
              onBlur={() => {
                rowHeightFocusedRef.current = false;
              }}
              onChange={(e) => {
                const v = e.target.value;
                setRowHeight(v);
                const num = parseFloat(v);
                if (!isNaN(num) && num > 0) {
                  editor.chain().setRowHeight(num).run();
                } else if (v === "") {
                  editor.chain().setRowHeight(null).run();
                }
              }}
              suffix="mm"
              min={MIN_ROW_HEIGHT_MM}
              max={500}
              placeholder={uiText("자동")}
              background={`${setting.theme}-1`}
            />
          </div>

          <Button
            size="sm"
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
            color={"white-1"}
            background={"white-10"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={equalizeSelectedRowHeights}
          >
            {uiText("행 높이 같게")}</Button>
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col gap-4 w-full">
      <Tabs
        options={tabOptions}
        color={{
          active: `white-1`,
          inactive: "cool-gray-5"
        }}
      />
    </div>
  );
}
