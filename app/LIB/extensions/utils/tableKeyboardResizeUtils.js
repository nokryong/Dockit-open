import { CellSelection } from "@tiptap/pm/tables";
import { getTableResizeGeometry } from "./tableColumnResize";
import { px2mm } from "../../utils/unitUtils";

const TABLE_KEYBOARD_RESIZE_STEP_PX = 2;
const TABLE_KEYBOARD_MIN_COL_WIDTH_PX = 25;
const TABLE_KEYBOARD_MIN_ROW_HEIGHT_MM = px2mm(12);
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

export {
  TABLE_KEYBOARD_RESIZE_STEP_PX,
  adjustSelectedColumnWidths,
  adjustSelectedRowHeights,
  equalizeSelectedColumnWidths,
  equalizeSelectedRowHeights
};
