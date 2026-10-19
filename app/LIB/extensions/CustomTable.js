import { t as uiText } from "../i18n";
import { Table } from "@tiptap/extension-table";
import { mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import { TableMap, cellAround, CellSelection } from "@tiptap/pm/tables";
import { TableView } from "./TableView.js";
import { boundedTableColumnResize, getTableResizeGeometry } from "./utils/tableColumnResize";
import { px2mm } from "../utils/unitUtils";
import {
  getNextTableCellPoint,
  getTableCellArrowDirection,
  shouldHandleTableCellArrowEvent
} from "../utils/tableKeyboardNavigationUtils";
import { toast } from "sud-ui";

const TABLE_KEYBOARD_RESIZE_STEP_PX = 2;
const TABLE_KEYBOARD_MIN_COL_WIDTH_PX = 25;
const TABLE_KEYBOARD_MIN_ROW_HEIGHT_MM = px2mm(12);
const TABLE_AUTOFILL_MIN_SEED_COUNT = 3;
const TABLE_AUTOFILL_EPSILON = 0.000001;
const TABLE_AUTOFILL_KOREAN_SEQUENCE = [
  "가",
  "나",
  "다",
  "라",
  "마",
  "바",
  "사",
  "아",
  "자",
  "차",
  "카",
  "타",
  "파",
  "하"
];
const TABLE_AUTOFILL_WEEKDAY_SEQUENCE = [
  "월",
  "화",
  "수",
  "목",
  "금",
  "토",
  "일"
];
const TABLE_AUTOFILL_ENGLISH_LOWER_SEQUENCE = Array.from(
  { length: 26 },
  (_, index) => String.fromCharCode(97 + index)
);
const TABLE_AUTOFILL_ENGLISH_UPPER_SEQUENCE = Array.from(
  { length: 26 },
  (_, index) => String.fromCharCode(65 + index)
);

function normalizeCellText(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCellPlainText(cellNode) {
  if (!cellNode) {
    return "";
  }

  return normalizeCellText(
    cellNode.textBetween(0, cellNode.content.size, "\n", "\n")
  );
}

function getLinearCellSelection(state, tableContext) {
  const { selection } = state;

  if (!(selection instanceof CellSelection)) {
    return null;
  }

  const { tablePos, map } = tableContext;
  const anchorRelPos = selection.$anchorCell.pos - tablePos - 1;
  const headRelPos = selection.$headCell.pos - tablePos - 1;
  const rect = map.rectBetween(anchorRelPos, headRelPos);
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;

  if (width !== 1 && height !== 1) {
    return null;
  }

  const cells = [];
  const visited = new Set();

  if (height === 1) {
    for (let col = rect.left; col < rect.right; col += 1) {
      const relPos = map.map[rect.top * map.width + col];

      if (visited.has(relPos)) {
        return null;
      }

      visited.add(relPos);

      const cellRect = map.findCell(relPos);

      if (
        cellRect.left !== col ||
        cellRect.right !== col + 1 ||
        cellRect.top !== rect.top ||
        cellRect.bottom !== rect.bottom
      ) {
        return null;
      }

      const pos = tablePos + 1 + relPos;
      const node = state.doc.nodeAt(pos);

      if (!node) {
        return null;
      }

      cells.push({
        pos,
        node,
        text: getCellPlainText(node)
      });
    }

    return { axis: "row", cells, rect };
  }

  for (let row = rect.top; row < rect.bottom; row += 1) {
    const relPos = map.map[row * map.width + rect.left];

    if (visited.has(relPos)) {
      return null;
    }

    visited.add(relPos);

    const cellRect = map.findCell(relPos);

    if (
      cellRect.left !== rect.left ||
      cellRect.right !== rect.right ||
      cellRect.top !== row ||
      cellRect.bottom !== row + 1
    ) {
      return null;
    }

    const pos = tablePos + 1 + relPos;
    const node = state.doc.nodeAt(pos);

    if (!node) {
      return null;
    }

    cells.push({
      pos,
      node,
      text: getCellPlainText(node)
    });
  }

  return { axis: "column", cells, rect };
}

function getLeadingFilledCellCount(values) {
  let count = 0;

  for (const value of values) {
    if (!normalizeCellText(value)) {
      break;
    }

    count += 1;
  }

  return count;
}

function getAutofillSeedValues(values) {
  if (values.length <= TABLE_AUTOFILL_MIN_SEED_COUNT) {
    return null;
  }

  const leadingFilledCount = getLeadingFilledCellCount(values);

  if (leadingFilledCount < TABLE_AUTOFILL_MIN_SEED_COUNT) {
    return null;
  }

  const seedCount =
    leadingFilledCount < values.length
      ? leadingFilledCount
      : TABLE_AUTOFILL_MIN_SEED_COUNT;

  if (seedCount >= values.length) {
    return null;
  }

  return {
    seedValues: values.slice(0, seedCount).map((value) => normalizeCellText(value)),
    targetCount: values.length - seedCount
  };
}

function parseNumericValueWithSuffix(value) {
  const normalizedValue = normalizeCellText(value);
  const match = normalizedValue.match(
    /^([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(.*)$/
  );

  if (!match) {
    return null;
  }

  const rawNumber = match[1];
  const suffix = match[2] || "";
  const normalizedSuffix = suffix.trim();
  const decimalMatch = rawNumber.replace(/,/g, "").match(/\.(\d+)$/);

  return {
    value: Number(rawNumber.replace(/,/g, "")),
    suffix,
    normalizedSuffix,
    decimals: decimalMatch ? decimalMatch[1].length : 0
  };
}

function parseNumericSeries(values) {
  const entries = values.map(parseNumericValueWithSuffix);

  if (entries.some((entry) => !entry || !Number.isFinite(entry.value))) {
    return null;
  }

  const normalizedSuffix = entries[0].normalizedSuffix;

  if (
    entries.some((entry) => entry.normalizedSuffix !== normalizedSuffix)
  ) {
    return null;
  }

  return {
    entries,
    suffix: entries[0].suffix,
    decimals: entries.reduce(
      (maxDecimals, entry) => Math.max(maxDecimals, entry.decimals),
      0
    )
  };
}

function summarizeNumericValues(values) {
  const entries = values.map(parseNumericValueWithSuffix);
  const numericEntries = entries.filter(
    (entry) => entry && Number.isFinite(entry.value)
  );
  const normalizedSuffixes = new Set(
    numericEntries.map((entry) => entry.normalizedSuffix)
  );

  return {
    totalValue: entries.reduce(
      (sum, entry) => sum + (entry && Number.isFinite(entry.value) ? entry.value : 0),
      0
    ),
    decimals: numericEntries.reduce(
      (maxDecimals, entry) => Math.max(maxDecimals, entry.decimals),
      0
    ),
    suffix:
      numericEntries.length > 0 && normalizedSuffixes.size === 1
        ? numericEntries[0].suffix
        : ""
  };
}

function almostEqual(a, b) {
  return Math.abs(a - b) <= TABLE_AUTOFILL_EPSILON;
}

function formatNumericOutput(value, decimals, suffix) {
  const precision = Math.max(decimals, 6);
  const roundedValue = Number(value.toFixed(precision));
  return `${roundedValue}${suffix || ""}`;
}

function generateArithmeticSeries(entries, targetCount, suffix, decimals) {
  const diff = entries[1].value - entries[0].value;

  for (let index = 2; index < entries.length; index += 1) {
    if (!almostEqual(entries[index].value - entries[index - 1].value, diff)) {
      return null;
    }
  }

  const generatedValues = [];
  let currentValue = entries[entries.length - 1].value;

  for (let index = 0; index < targetCount; index += 1) {
    currentValue += diff;
    generatedValues.push(formatNumericOutput(currentValue, decimals, suffix));
  }

  return generatedValues;
}

function generateGeometricSeries(entries, targetCount, suffix, decimals) {
  if (entries.some((entry) => almostEqual(entry.value, 0))) {
    return null;
  }

  const ratio = entries[1].value / entries[0].value;

  for (let index = 2; index < entries.length; index += 1) {
    if (!almostEqual(entries[index].value / entries[index - 1].value, ratio)) {
      return null;
    }
  }

  const generatedValues = [];
  let currentValue = entries[entries.length - 1].value;

  for (let index = 0; index < targetCount; index += 1) {
    currentValue *= ratio;
    generatedValues.push(formatNumericOutput(currentValue, decimals, suffix));
  }

  return generatedValues;
}

function generateAdditiveSeries(entries, targetCount, suffix, decimals) {
  for (let index = 2; index < entries.length; index += 1) {
    if (
      !almostEqual(
        entries[index].value,
        entries[index - 1].value + entries[index - 2].value
      )
    ) {
      return null;
    }
  }

  const generatedValues = [];
  let previousValue = entries[entries.length - 2].value;
  let currentValue = entries[entries.length - 1].value;

  for (let index = 0; index < targetCount; index += 1) {
    const nextValue = previousValue + currentValue;
    generatedValues.push(formatNumericOutput(nextValue, decimals, suffix));
    previousValue = currentValue;
    currentValue = nextValue;
  }

  return generatedValues;
}

function generateSequenceSeries(values, targetCount, sequence) {
  const sequenceIndexes = values.map((value) => sequence.indexOf(value));

  if (sequenceIndexes.some((index) => index < 0)) {
    return null;
  }

  const step = sequenceIndexes[1] - sequenceIndexes[0];

  if (!Number.isInteger(step) || step === 0) {
    return null;
  }

  for (let index = 2; index < sequenceIndexes.length; index += 1) {
    if (sequenceIndexes[index] - sequenceIndexes[index - 1] !== step) {
      return null;
    }
  }

  const generatedValues = [];
  let currentIndex = sequenceIndexes[sequenceIndexes.length - 1];

  for (let index = 0; index < targetCount; index += 1) {
    currentIndex += step;

    if (currentIndex < 0 || currentIndex >= sequence.length) {
      return null;
    }

    generatedValues.push(sequence[currentIndex]);
  }

  return generatedValues;
}

function generateAutofillValues(seedValues, targetCount) {
  if (
    seedValues.length < TABLE_AUTOFILL_MIN_SEED_COUNT ||
    targetCount <= 0
  ) {
    return null;
  }

  if (seedValues.every((value) => value === seedValues[0])) {
    return Array(targetCount).fill(seedValues[0]);
  }

  const numericSeries = parseNumericSeries(seedValues);

  if (numericSeries) {
    return (
      generateArithmeticSeries(
        numericSeries.entries,
        targetCount,
        numericSeries.suffix,
        numericSeries.decimals
      ) ||
      generateGeometricSeries(
        numericSeries.entries,
        targetCount,
        numericSeries.suffix,
        numericSeries.decimals
      ) ||
      generateAdditiveSeries(
        numericSeries.entries,
        targetCount,
        numericSeries.suffix,
        numericSeries.decimals
      )
    );
  }

  return (
    generateSequenceSeries(
      seedValues,
      targetCount,
      TABLE_AUTOFILL_KOREAN_SEQUENCE
    ) ||
    generateSequenceSeries(
      seedValues,
      targetCount,
      TABLE_AUTOFILL_ENGLISH_LOWER_SEQUENCE
    ) ||
    generateSequenceSeries(
      seedValues,
      targetCount,
      TABLE_AUTOFILL_ENGLISH_UPPER_SEQUENCE
    ) ||
    generateSequenceSeries(
      seedValues,
      targetCount,
      TABLE_AUTOFILL_WEEKDAY_SEQUENCE
    )
  );
}

function createCellTextContent(schema, cellNode, text) {
  const textNode = text ? schema.text(text) : null;
  const preferredType =
    cellNode.firstChild?.type?.isTextblock
      ? cellNode.firstChild.type
      : cellNode.contentMatchAt(0)?.defaultType || schema.nodes.paragraph;
  const preferredAttrs =
    cellNode.firstChild?.type === preferredType ? cellNode.firstChild.attrs : null;

  if (preferredType?.isTextblock) {
    const preferredContent = preferredType.createAndFill(preferredAttrs, textNode);

    if (preferredContent) {
      return preferredContent;
    }
  }

  if (schema.nodes.paragraph) {
    return (
      schema.nodes.paragraph.createAndFill(null, textNode) ||
      schema.nodes.paragraph.create(null, textNode)
    );
  }

  return preferredType.create(preferredAttrs, textNode);
}

function applyCellTextChanges(view, linearSelection, changes) {
  if (!changes.length) {
    return false;
  }

  const { state } = view;
  const tr = state.tr;
  const sortedChanges = [...changes].sort((a, b) => b.pos - a.pos);

  for (const change of sortedChanges) {
    tr.replaceWith(
      change.pos + 1,
      change.pos + change.node.nodeSize - 1,
      createCellTextContent(state.schema, change.node, change.text)
    );
  }

  const firstCellPos = tr.mapping.map(linearSelection.cells[0].pos);
  const lastCellPos = tr.mapping.map(
    linearSelection.cells[linearSelection.cells.length - 1].pos
  );

  tr.setSelection(CellSelection.create(tr.doc, firstCellPos, lastCellPos));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function runTableAutofill(view, tableContext) {
  const { state } = view;
  const linearSelection = getLinearCellSelection(state, tableContext);

  if (!linearSelection || linearSelection.cells.length <= TABLE_AUTOFILL_MIN_SEED_COUNT) {
    toast.danger(uiText("자동채우기를 실패했습니다."));
    return false;
  }

  const selectedValues = linearSelection.cells.map((cell) => cell.text);
  const autofillSeed = getAutofillSeedValues(selectedValues);

  if (!autofillSeed) {
    toast.danger(uiText("자동채우기를 실패했습니다."));
    return false;
  }

  const generatedValues = generateAutofillValues(
    autofillSeed.seedValues,
    autofillSeed.targetCount
  );

  if (!generatedValues) {
    toast.danger(uiText("자동채우기를 실패했습니다."));
    return false;
  }

  return applyCellTextChanges(
    view,
    linearSelection,
    linearSelection.cells
      .slice(linearSelection.cells.length - generatedValues.length)
      .map((cell, index) => ({
        ...cell,
        text: generatedValues[index]
      }))
  );
}

function runTableSelectionSum(view, tableContext) {
  const { state } = view;
  const linearSelection = getLinearCellSelection(state, tableContext);

  if (!linearSelection || linearSelection.cells.length < 2) {
    toast.danger(uiText("합계 계산을 실패했습니다."));
    return false;
  }

  const sourceCells = linearSelection.cells.slice(0, -1);
  const summary = summarizeNumericValues(sourceCells.map((cell) => cell.text));

  return applyCellTextChanges(view, linearSelection, [
    {
      ...linearSelection.cells[linearSelection.cells.length - 1],
      text: formatNumericOutput(
        summary.totalValue,
        summary.decimals,
        summary.suffix
      )
    }
  ]);
}

// 테이블 위치를 찾는 헬퍼
function findTablePos(state) {
  const { selection } = state;
  if (selection.node?.type.name === "table") return selection.from;
  const $from = selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "table") {
      return $from.before(d);
    }
  }
  return null;
}

function getTableContext(state) {
  const tablePos = findTablePos(state);

  if (tablePos === null) {
    return null;
  }

  const tableNode = state.doc.nodeAt(tablePos);

  if (!tableNode || tableNode.type.name !== "table") {
    return null;
  }

  return {
    tablePos,
    tableNode,
    map: TableMap.get(tableNode)
  };
}

function getCurrentCellPos(state, tablePos) {
  const { selection } = state;

  if (selection instanceof CellSelection) {
    return selection.$anchorCell.pos;
  }

  const $cell = cellAround(selection.$head) || cellAround(selection.$from);

  if (!$cell) {
    return null;
  }

  return $cell.pos;
}

function isWholeTableSelected(selection, tablePos, map) {
  if (!(selection instanceof CellSelection)) {
    return false;
  }

  const anchorRelPos = selection.$anchorCell.pos - tablePos - 1;
  const headRelPos = selection.$headCell.pos - tablePos - 1;
  const rect = map.rectBetween(anchorRelPos, headRelPos);

  return (
    rect.left === 0 &&
    rect.top === 0 &&
    rect.right === map.width &&
    rect.bottom === map.height
  );
}

function isSingleCellSelected(selection) {
  if (!(selection instanceof CellSelection)) {
    return false;
  }

  let cellCount = 0;
  selection.forEachCell(() => {
    cellCount += 1;
  });

  return cellCount === 1;
}

function createCellCursorSelection(doc, cellPos) {
  const resolvedPos = Math.max(0, Math.min(cellPos + 1, doc.content.size));

  return Selection.near(doc.resolve(resolvedPos), 1);
}

function createWholeTableSelection(doc, tablePos, map) {
  const firstCellPos = tablePos + 1 + map.map[0];
  const lastCellPos = tablePos + 1 + map.map[map.map.length - 1];

  return CellSelection.create(doc, firstCellPos, lastCellPos);
}

function createArrowCellSelection(state, tableContext, direction, extend) {
  const { selection } = state;

  if (!(selection instanceof CellSelection)) {
    return null;
  }

  const { tablePos, map } = tableContext;
  const headRelPos = selection.$headCell.pos - tablePos - 1;
  let headRect = null;

  try {
    headRect = map.findCell(headRelPos);
  } catch {
    return null;
  }

  const targetPoint = getNextTableCellPoint({
    rect: headRect,
    direction,
    tableWidth: map.width,
    tableHeight: map.height
  });

  if (!targetPoint) {
    return null;
  }

  const targetRelPos = map.map[targetPoint.row * map.width + targetPoint.col];

  if (targetRelPos == null) {
    return null;
  }

  const targetCellPos = tablePos + 1 + targetRelPos;
  const anchorCellPos = extend ? selection.$anchorCell.pos : targetCellPos;

  return CellSelection.create(state.doc, anchorCellPos, targetCellPos);
}

function getSelectedColumnIndexes(state, tablePos, map) {
  const { selection } = state;
  const cols = new Set();

  if (!(selection instanceof CellSelection)) {
    return cols;
  }

  selection.forEachCell((_, pos) => {
    const relPos = pos - tablePos - 1;

    try {
      const rect = map.findCell(relPos);

      for (let col = rect.left; col < rect.right; col += 1) {
        cols.add(col);
      }
    } catch {}
  });

  return cols;
}

function getSelectedRowContexts(state, tablePos, tableNode) {
  const { selection } = state;

  if (!(selection instanceof CellSelection)) {
    return [];
  }

  const rowPositions = new Set();

  selection.forEachCell((_, pos) => {
    const $pos = state.doc.resolve(pos);

    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type.name !== "tableRow") {
        continue;
      }

      rowPositions.add($pos.before(depth));
      break;
    }
  });

  const rowContexts = [];
  let rowPos = tablePos + 1;

  for (let index = 0; index < tableNode.childCount; index += 1) {
    const rowNode = tableNode.child(index);

    if (rowPositions.has(rowPos)) {
      rowContexts.push({
        index,
        pos: rowPos,
        node: rowNode
      });
    }

    rowPos += rowNode.nodeSize;
  }

  return rowContexts;
}

function adjustSelectedColumnWidths(view, tableContext, deltaPx, cellMinWidth) {
  const { state } = view;
  const { tablePos, map } = tableContext;
  const tr = state.tr;
  const selectedColumns = getSelectedColumnIndexes(state, tablePos, map);
  if (!selectedColumns.size) return false;
  const geometry = getTableResizeGeometry(view, tablePos);
  if (deltaPx > 0 && !geometry) return false;
  const boundedDelta = deltaPx > 0
    ? Math.min(deltaPx, Math.max(0, geometry.remainingWidth) / selectedColumns.size)
    : deltaPx;
  if (boundedDelta === 0) return false;
  const visited = new Set();
  let modified = false;

  for (const col of selectedColumns) {
    for (let row = 0; row < map.height; row += 1) {
      const cellRelPos = map.map[row * map.width + col];

      const columnCellKey = `${cellRelPos}:${col}`;
      if (visited.has(columnCellKey)) {
        continue;
      }

      visited.add(columnCellKey);

      const cellAbsPos = tablePos + 1 + cellRelPos;
      const cellNode = tr.doc.nodeAt(cellAbsPos);

      if (!cellNode) {
        continue;
      }

      const rect = map.findCell(cellRelPos);
      const colOffset = col - rect.left;
      const colspan = cellNode.attrs.colspan || 1;
      const currentWidths = cellNode.attrs.colwidth
        ? [...cellNode.attrs.colwidth]
        : Array(colspan).fill(null);

      while (currentWidths.length < colspan) {
        currentWidths.push(null);
      }

      const baseWidth = Number(currentWidths[colOffset]) || geometry?.widths[col] || cellMinWidth;
      const requestedWidth = (baseWidth + boundedDelta) * 10;
      const nextWidth = Math.max(
        TABLE_KEYBOARD_MIN_COL_WIDTH_PX,
        (boundedDelta > 0 ? Math.floor(requestedWidth + 0.000001) : Math.round(requestedWidth)) / 10
      );

      if (nextWidth === baseWidth) {
        continue;
      }

      currentWidths[colOffset] = nextWidth;

      tr.setNodeMarkup(cellAbsPos, undefined, {
        ...cellNode.attrs,
        colwidth: currentWidths
      });
      modified = true;
    }
  }

  if (!modified) {
    return false;
  }

  view.dispatch(tr.scrollIntoView());
  return true;
}

function adjustSelectedRowHeights(view, tableContext, deltaPx) {
  const { state } = view;
  const { tablePos, tableNode } = tableContext;
  const rowContexts = getSelectedRowContexts(state, tablePos, tableNode);

  if (rowContexts.length === 0) {
    return false;
  }

  const tableDom = view.nodeDOM(tablePos);
  const rowElements =
    tableDom instanceof HTMLElement
      ? Array.from(
          tableDom.querySelectorAll("tbody > tr:not(.tiptap-table-page-break-row)")
        )
      : [];
  const deltaMm = px2mm(deltaPx);
  const tr = state.tr;
  let modified = false;

  for (const rowContext of rowContexts) {
    const renderedHeightMm = px2mm(
      rowElements[rowContext.index]?.getBoundingClientRect?.().height || 0
    );
    const baseHeightMm =
      Number(rowContext.node.attrs.height) ||
      renderedHeightMm ||
      TABLE_KEYBOARD_MIN_ROW_HEIGHT_MM;
    const nextHeightMm = Math.max(
      TABLE_KEYBOARD_MIN_ROW_HEIGHT_MM,
      Math.round((baseHeightMm + deltaMm) * 10) / 10
    );

    if (nextHeightMm === rowContext.node.attrs.height) {
      continue;
    }

    tr.setNodeMarkup(rowContext.pos, undefined, {
      ...rowContext.node.attrs,
      height: nextHeightMm
    });
    modified = true;
  }

  if (!modified) {
    return false;
  }

  view.dispatch(tr.scrollIntoView());
  return true;
}

function equalizeSelectedColumnWidths(view, tableContext, cellMinWidth) {
  const { state } = view;
  const { tablePos, map } = tableContext;
  const selectedColumns = Array.from(
    getSelectedColumnIndexes(state, tablePos, map)
  ).sort((a, b) => a - b);

  if (selectedColumns.length === 0) {
    return false;
  }

  const tableDom = view.nodeDOM(tablePos);
  const colElements =
    tableDom instanceof HTMLElement
      ? Array.from(tableDom.querySelectorAll("colgroup > col"))
      : [];

  if (colElements.length === 0) {
    return false;
  }

  const totalWidth = selectedColumns.reduce((sum, colIndex) => {
    const width =
      colElements[colIndex]?.getBoundingClientRect?.().width ||
      parseFloat(colElements[colIndex]?.style.width) ||
      cellMinWidth;

    return sum + width;
  }, 0);
  const nextWidth = Math.max(
    TABLE_KEYBOARD_MIN_COL_WIDTH_PX,
    Math.round((totalWidth / selectedColumns.length) * 10) / 10
  );

  const tr = state.tr;
  const visited = new Set();
  let modified = false;

  for (const col of selectedColumns) {
    for (let row = 0; row < map.height; row += 1) {
      const cellRelPos = map.map[row * map.width + col];

      if (visited.has(cellRelPos)) {
        continue;
      }

      visited.add(cellRelPos);

      const cellAbsPos = tablePos + 1 + cellRelPos;
      const cellNode = state.doc.nodeAt(cellAbsPos);

      if (!cellNode) {
        continue;
      }

      const rect = map.findCell(cellRelPos);
      const colOffset = col - rect.left;
      const colspan = cellNode.attrs.colspan || 1;
      const currentWidths = cellNode.attrs.colwidth
        ? [...cellNode.attrs.colwidth]
        : Array(colspan).fill(null);

      while (currentWidths.length < colspan) {
        currentWidths.push(null);
      }

      if (Number(currentWidths[colOffset]) === nextWidth) {
        continue;
      }

      currentWidths[colOffset] = nextWidth;

      tr.setNodeMarkup(cellAbsPos, undefined, {
        ...cellNode.attrs,
        colwidth: currentWidths
      });
      modified = true;
    }
  }

  if (!modified) {
    return false;
  }

  view.dispatch(tr.scrollIntoView());
  return true;
}

function equalizeSelectedRowHeights(view, tableContext) {
  const { state } = view;
  const { tablePos, tableNode } = tableContext;
  const rowContexts = getSelectedRowContexts(state, tablePos, tableNode);

  if (rowContexts.length === 0) {
    return false;
  }

  const tableDom = view.nodeDOM(tablePos);
  const rowElements =
    tableDom instanceof HTMLElement
      ? Array.from(
          tableDom.querySelectorAll("tbody > tr:not(.tiptap-table-page-break-row)")
        )
      : [];

  const totalHeightMm = rowContexts.reduce((sum, rowContext) => {
    const renderedHeightMm = px2mm(
      rowElements[rowContext.index]?.getBoundingClientRect?.().height || 0
    );

    return (
      sum +
      (Number(rowContext.node.attrs.height) ||
        renderedHeightMm ||
        TABLE_KEYBOARD_MIN_ROW_HEIGHT_MM)
    );
  }, 0);
  const nextHeightMm = Math.max(
    TABLE_KEYBOARD_MIN_ROW_HEIGHT_MM,
    Math.round((totalHeightMm / rowContexts.length) * 10) / 10
  );

  const tr = state.tr;
  let modified = false;

  for (const rowContext of rowContexts) {
    if (Number(rowContext.node.attrs.height) === nextHeightMm) {
      continue;
    }

    tr.setNodeMarkup(rowContext.pos, undefined, {
      ...rowContext.node.attrs,
      height: nextHeightMm
    });
    modified = true;
  }

  if (!modified) {
    return false;
  }

  view.dispatch(tr.scrollIntoView());
  return true;
}

function isIgnoredShortcutTarget(target) {
  return (
    target instanceof HTMLElement &&
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

function isBlockedCellSelectionInput(inputType) {
  return [
    "insertText",
    "insertCompositionText",
    "insertFromComposition",
    "insertReplacementText"
  ].includes(inputType);
}

const CustomTable = Table.extend({
  name: "table",
  priority: 1000,

  addOptions() {
    return { ...this.parent?.(), View: TableView };
  },

  addNodeView() {
    const cellMinWidth = this.options.cellMinWidth;
    return ({ node, editor, getPos }) =>
      new TableView(node, cellMinWidth, editor.view, getPos);
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      headerColor: {
        default: "#dcdddd",
        parseHTML: (element) =>
          element.style.getPropertyValue("--header-bg") || "#dcdddd",
        renderHTML: (attributes) => {
          if (!attributes.headerColor) return {};
          return { style: `--header-bg: ${attributes.headerColor}` };
        },
      },
      borderColor: {
        default: "#006d75",
        parseHTML: (element) =>
          element.style.getPropertyValue("--table-border") || "#006d75",
        renderHTML: (attributes) => {
          if (!attributes.borderColor) return {};
          return { style: `--table-border: ${attributes.borderColor}` };
        },
      },
      borderStyle: {
        default: "solid",
        parseHTML: (element) =>
          element.style.getPropertyValue("--table-border-style") || "solid",
        renderHTML: (attributes) => {
          if (!attributes.borderStyle || attributes.borderStyle === "solid") return {};
          return { style: `--table-border-style: ${attributes.borderStyle}` };
        },
      },
      borderWidth: {
        default: 1,
        parseHTML: (element) => {
          const val = element.style.getPropertyValue("--table-border-width");
          return val ? parseFloat(val) : 1;
        },
        renderHTML: (attributes) => {
          if (!attributes.borderWidth || attributes.borderWidth === 1) return {};
          return { style: `--table-border-width: ${attributes.borderWidth}pt` };
        },
      },
      objectId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-object-id") || null,
        renderHTML: (attributes) =>
          attributes.objectId ? { "data-object-id": attributes.objectId } : {},
      },
      cellPaddingTop: {
        default: null,
        parseHTML: (element) => {
          const val = element.style.getPropertyValue("--cell-pt");
          return val ? parseFloat(val) : null;
        },
        renderHTML: (attributes) => {
          if (attributes.cellPaddingTop == null) return {};
          return { style: `--cell-pt: ${attributes.cellPaddingTop}px` };
        },
      },
      cellPaddingBottom: {
        default: null,
        parseHTML: (element) => {
          const val = element.style.getPropertyValue("--cell-pb");
          return val ? parseFloat(val) : null;
        },
        renderHTML: (attributes) => {
          if (attributes.cellPaddingBottom == null) return {};
          return { style: `--cell-pb: ${attributes.cellPaddingBottom}px` };
        },
      },
      cellPaddingLeft: {
        default: null,
        parseHTML: (element) => {
          const val = element.style.getPropertyValue("--cell-pl");
          return val ? parseFloat(val) : null;
        },
        renderHTML: (attributes) => {
          if (attributes.cellPaddingLeft == null) return {};
          return { style: `--cell-pl: ${attributes.cellPaddingLeft}px` };
        },
      },
      cellPaddingRight: {
        default: null,
        parseHTML: (element) => {
          const val = element.style.getPropertyValue("--cell-pr");
          return val ? parseFloat(val) : null;
        },
        renderHTML: (attributes) => {
          if (attributes.cellPaddingRight == null) return {};
          return { style: `--cell-pr: ${attributes.cellPaddingRight}px` };
        },
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "table",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      ["tbody", 0],
    ];
  },

  addCommands() {
    const cellMinWidth = this.options.cellMinWidth || 25;

    const setAttr = (key, value) => ({ state, tr, dispatch }) => {
      const tablePos = findTablePos(state);
      if (tablePos !== null && dispatch) {
        const node = state.doc.nodeAt(tablePos);
        dispatch(
          tr.setNodeMarkup(tablePos, undefined, {
            ...node.attrs,
            [key]: value,
          })
        );
        return true;
      }
      return false;
    };

    return {
      ...this.parent?.(),
      setHeaderColor: (color) => setAttr("headerColor", color),
      setBorderColor: (color) => setAttr("borderColor", color),
      setBorderStyle: (style) => setAttr("borderStyle", style),
      setBorderWidth: (width) => setAttr("borderWidth", width),
      setCellPaddingTop: (val) => setAttr("cellPaddingTop", val),
      setCellPaddingBottom: (val) => setAttr("cellPaddingBottom", val),
      setCellPaddingLeft: (val) => setAttr("cellPaddingLeft", val),
      setCellPaddingRight: (val) => setAttr("cellPaddingRight", val),

      // 선택된 열(들)의 모든 셀 너비를 일괄 설정 (widthPx: 픽셀 단위)
      setColumnWidth: (widthPx) => ({ state, tr, dispatch }) => {
        const tablePos = findTablePos(state);
        if (tablePos === null) return false;

        const tableNode = state.doc.nodeAt(tablePos);
        if (!tableNode) return false;

        const map = TableMap.get(tableNode);
        const roundedWidth = widthPx ? Math.round(Number(widthPx)) : 0;
        const numWidth =
          roundedWidth > 0
            ? Math.max(cellMinWidth, roundedWidth)
            : 0;
        const { selection } = state;

        // 선택된 열 인덱스 수집
        const cols = new Set();
        if (selection instanceof CellSelection) {
          selection.forEachCell((_, pos) => {
            const relPos = pos - tablePos - 1;
            try {
              const rect = map.findCell(relPos);
              for (let c = rect.left; c < rect.right; c++) cols.add(c);
            } catch {}
          });
        } else {
          const $cell = cellAround(selection.$head);
          if (!$cell) return false;
          const cellRelPos = $cell.pos - tablePos - 1;
          try {
            const rect = map.findCell(cellRelPos);
            cols.add(rect.left);
          } catch {
            return false;
          }
        }

        // 수집된 열의 모든 셀에 colwidth 적용 (중복 제거)
        const visited = new Set();
        for (const col of cols) {
          for (let row = 0; row < map.height; row++) {
            const cellRelP = map.map[row * map.width + col];
            if (visited.has(cellRelP)) continue;
            visited.add(cellRelP);

            const cellAbsPos = tablePos + 1 + cellRelP;
            const cell = state.doc.nodeAt(cellAbsPos);
            if (!cell) continue;

            const cellLeft = map.findCell(cellRelP).left;
            const colOffset = col - cellLeft;
            const colspan = cell.attrs.colspan || 1;
            const oldCw = cell.attrs.colwidth
              ? [...cell.attrs.colwidth]
              : Array(colspan).fill(0);
            while (oldCw.length < colspan) oldCw.push(0);
            oldCw[colOffset] = numWidth;

            tr.setNodeMarkup(cellAbsPos, undefined, {
              ...cell.attrs,
              colwidth: numWidth ? oldCw : null
            });
          }
        }

        if (dispatch) dispatch(tr);
        return true;
      },

      // 선택된 행(들)의 높이 설정 (heightMm: mm 단위)
      setRowHeight: (heightMm) => ({ state, tr, dispatch }) => {
        const { selection } = state;
        const h = heightMm ? Number(heightMm) : null;

        // 선택된 행 위치 수집
        const rowPositions = new Set();
        if (selection instanceof CellSelection) {
          selection.forEachCell((_, pos) => {
            const $pos = state.doc.resolve(pos);
            for (let d = $pos.depth; d > 0; d--) {
              if ($pos.node(d).type.name === "tableRow") {
                rowPositions.add($pos.before(d));
                break;
              }
            }
          });
        } else {
          for (let d = selection.$from.depth; d > 0; d--) {
            if (selection.$from.node(d).type.name === "tableRow") {
              rowPositions.add(selection.$from.before(d));
              break;
            }
          }
        }

        if (rowPositions.size === 0) return false;

        for (const rowPos of rowPositions) {
          const rowNode = state.doc.nodeAt(rowPos);
          if (!rowNode) continue;
          tr.setNodeMarkup(rowPos, undefined, { ...rowNode.attrs, height: h });
        }

        if (dispatch) dispatch(tr);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() || [];
    const cellMinWidth = this.options.cellMinWidth || 25;
    const editor = this.editor;
    const tableCellArrowNavigationPlugin = new Plugin({
      key: new PluginKey("tableCellArrowNavigation"),
      props: {
        handleKeyDown(view, event) {
          if (!shouldHandleTableCellArrowEvent(event)) {
            return false;
          }

          if (event.isComposing || view.composing) {
            return false;
          }

          const target = event.target;

          if (isIgnoredShortcutTarget(target)) {
            return false;
          }

          const { state } = view;

          if (!(state.selection instanceof CellSelection)) {
            return false;
          }

          const tableContext = getTableContext(state);

          if (!tableContext) {
            return false;
          }

          const direction = getTableCellArrowDirection(event.key);
          const nextSelection = createArrowCellSelection(
            state,
            tableContext,
            direction,
            event.shiftKey
          );

          event.preventDefault();

          if (nextSelection) {
            view.dispatch(state.tr.setSelection(nextSelection).scrollIntoView());
          }

          return true;
        }
      }
    });

    return [
      tableCellArrowNavigationPlugin,
      boundedTableColumnResize(cellMinWidth),
      ...parentPlugins,
      new Plugin({
        key: new PluginKey("tableSelectionCycle"),
        props: {
          handleKeyDown(view, event) {
            if (event.key !== "F5") {
              return false;
            }

            if (event.isComposing || view.composing) {
              return false;
            }

            const target = event.target;

            if (isIgnoredShortcutTarget(target)) {
              return false;
            }

            const { state } = view;
            const tableContext = getTableContext(state);

            if (!tableContext) {
              return false;
            }

            const { selection } = state;
            const currentCellPos = getCurrentCellPos(state, tableContext.tablePos);

            if (currentCellPos === null) {
              return false;
            }

            let nextSelection = null;

            if (selection instanceof CellSelection) {
              if (isWholeTableSelected(selection, tableContext.tablePos, tableContext.map)) {
                nextSelection = createCellCursorSelection(state.doc, selection.$anchorCell.pos);
              } else if (isSingleCellSelected(selection)) {
                nextSelection = createWholeTableSelection(
                  state.doc,
                  tableContext.tablePos,
                  tableContext.map
                );
              } else {
                nextSelection = createWholeTableSelection(
                  state.doc,
                  tableContext.tablePos,
                  tableContext.map
                );
              }
            } else {
              nextSelection = CellSelection.create(state.doc, currentCellPos);
            }

            if (!nextSelection) {
              return false;
            }

            event.preventDefault();
            view.dispatch(state.tr.setSelection(nextSelection).scrollIntoView());
            return true;
          }
        }
      }),
      new Plugin({
        key: new PluginKey("tableKeyboardResize"),
        props: {
          handleKeyDown(view, event) {
            const isResizeShortcut =
              event.ctrlKey &&
              !event.altKey &&
              !event.metaKey &&
              ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                event.key
              );

            if (!isResizeShortcut) {
              return false;
            }

            if (event.isComposing || view.composing) {
              return false;
            }

            const target = event.target;

            if (isIgnoredShortcutTarget(target)) {
              return false;
            }

            const { state } = view;

            if (!(state.selection instanceof CellSelection)) {
              return false;
            }

            const tableContext = getTableContext(state);

            if (!tableContext) {
              return false;
            }

            let handled = false;

            if (event.key === "ArrowLeft") {
              handled = adjustSelectedColumnWidths(
                view,
                tableContext,
                -TABLE_KEYBOARD_RESIZE_STEP_PX,
                cellMinWidth
              );
            } else if (event.key === "ArrowRight") {
              handled = adjustSelectedColumnWidths(
                view,
                tableContext,
                TABLE_KEYBOARD_RESIZE_STEP_PX,
                cellMinWidth
              );
            } else if (event.key === "ArrowUp") {
              handled = adjustSelectedRowHeights(
                view,
                tableContext,
                -TABLE_KEYBOARD_RESIZE_STEP_PX
              );
            } else if (event.key === "ArrowDown") {
              handled = adjustSelectedRowHeights(
                view,
                tableContext,
                TABLE_KEYBOARD_RESIZE_STEP_PX
              );
            }

            if (!handled) {
              event.preventDefault();
              return true;
            }

            event.preventDefault();
            return true;
          }
        }
      }),
      new Plugin({
        key: new PluginKey("tableKeyboardActions"),
        props: {
          handleKeyDown(view, event) {
            if (event.isComposing || view.composing) {
              return false;
            }

            const target = event.target;

            if (isIgnoredShortcutTarget(target)) {
              return false;
            }

            const { state } = view;
            const tableContext = getTableContext(state);

            if (!tableContext) {
              return false;
            }

            const normalizedKey =
              typeof event.key === "string" && event.key.length === 1
                ? event.key.toLowerCase()
                : event.key;
            const normalizedCode =
              typeof event.code === "string" ? event.code : "";
            const matchesLetterKey = (letter) => {
              const upperLetter = letter.toUpperCase();
              return (
                normalizedKey === letter.toLowerCase() ||
                normalizedCode === `Key${upperLetter}`
              );
            };

            if (
              event.ctrlKey &&
              !event.altKey &&
              !event.metaKey &&
              !event.shiftKey
            ) {
              if (normalizedKey === "Enter") {
                event.preventDefault();
                editor.chain().focus().addRowAfter().run();
                return true;
              }

              if (normalizedKey === "Backspace") {
                event.preventDefault();
                editor.chain().focus().deleteRow().run();
                return true;
              }

              if (matchesLetterKey("a")) {
                event.preventDefault();
                view.dispatch(
                  state.tr
                    .setSelection(
                      createWholeTableSelection(
                        state.doc,
                        tableContext.tablePos,
                        tableContext.map
                      )
                    )
                    .scrollIntoView()
                );
                return true;
              }
            }

            if (
              event.altKey &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey
            ) {
              if (matchesLetterKey("h")) {
                event.preventDefault();
                editor.chain().focus().toggleHeaderRow().run();
                return true;
              }

              if (matchesLetterKey("r")) {
                event.preventDefault();
                editor.chain().focus().toggleHeaderColumn().run();
                return true;
              }

              if (matchesLetterKey("s")) {
                event.preventDefault();
                editor.chain().focus().toggleHeaderCell().run();
                return true;
              }
            }

            if (!(state.selection instanceof CellSelection)) {
              return false;
            }

            if (
              event.ctrlKey ||
              event.altKey ||
              event.metaKey ||
              event.shiftKey
            ) {
              return false;
            }

            if (matchesLetterKey("h")) {
              event.preventDefault();
              equalizeSelectedRowHeights(view, tableContext);
              return true;
            }

            if (matchesLetterKey("a")) {
              event.preventDefault();
              runTableAutofill(view, tableContext);
              return true;
            }

            if (matchesLetterKey("s")) {
              event.preventDefault();
              runTableSelectionSum(view, tableContext);
              return true;
            }

            if (matchesLetterKey("w")) {
              event.preventDefault();
              equalizeSelectedColumnWidths(view, tableContext, cellMinWidth);
              return true;
            }

            if (matchesLetterKey("m")) {
              event.preventDefault();
              editor.chain().focus().mergeCells().run();
              return true;
            }

            return false;
          }
        }
      }),
      new Plugin({
        key: new PluginKey("tableCellSelectionInputGuard"),
        props: {
          handleTextInput(view) {
            if (!(view.state.selection instanceof CellSelection)) {
              return false;
            }

            return true;
          },
          handleDOMEvents: {
            beforeinput(view, event) {
              if (!(view.state.selection instanceof CellSelection)) {
                return false;
              }

              const target = event.target;

              if (isIgnoredShortcutTarget(target)) {
                return false;
              }

              if (!isBlockedCellSelectionInput(event.inputType)) {
                return false;
              }

              event.preventDefault();
              return true;
            }
          }
        }
      })
    ];
  }
});

export default CustomTable;
