import { Selection } from "@tiptap/pm/state";
import { TableMap, cellAround, CellSelection } from "@tiptap/pm/tables";
import { getNextTableCellPoint } from "../../utils/tableKeyboardNavigationUtils";

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

export {
  findTablePos,
  getTableContext,
  getCurrentCellPos,
  isWholeTableSelected,
  isSingleCellSelected,
  createCellCursorSelection,
  createWholeTableSelection,
  createArrowCellSelection,
  isIgnoredShortcutTarget,
  isBlockedCellSelectionInput
};
