export const TABLE_CELL_ARROW_DIRECTIONS = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down"
};

export function getTableCellArrowDirection(key) {
  return TABLE_CELL_ARROW_DIRECTIONS[key] || null;
}

export function shouldHandleTableCellArrowEvent(event) {
  return (
    Boolean(getTableCellArrowDirection(event?.key)) &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey
  );
}

export function getNextTableCellPoint({
  rect,
  direction,
  tableWidth,
  tableHeight
}) {
  if (
    !rect ||
    !direction ||
    !Number.isInteger(tableWidth) ||
    !Number.isInteger(tableHeight) ||
    tableWidth <= 0 ||
    tableHeight <= 0
  ) {
    return null;
  }

  if (direction === "left") {
    return rect.left > 0 ? { row: rect.top, col: rect.left - 1 } : null;
  }

  if (direction === "right") {
    return rect.right < tableWidth
      ? { row: rect.top, col: rect.right }
      : null;
  }

  if (direction === "up") {
    return rect.top > 0 ? { row: rect.top - 1, col: rect.left } : null;
  }

  if (direction === "down") {
    return rect.bottom < tableHeight
      ? { row: rect.bottom, col: rect.left }
      : null;
  }

  return null;
}
