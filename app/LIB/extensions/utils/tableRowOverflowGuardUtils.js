const TABLE_NODE_NAMES = new Set(["table"]);
const TABLE_ROW_NODE_NAMES = new Set(["tableRow", "table_row"]);

const getNodeTypeName = (node) => node?.type?.name || node?.type || "";

const isTableNode = (node) => TABLE_NODE_NAMES.has(getNodeTypeName(node));

const isTableRowNode = (node) =>
  TABLE_ROW_NODE_NAMES.has(getNodeTypeName(node));

const toPositiveNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : fallback;
};

export const getTableRowOverflowLimit = (pageMetrics) => {
  const pageHeight = toPositiveNumber(pageMetrics?.pageHeightPx);
  const paddingTop = toPositiveNumber(pageMetrics?.padding?.top);
  const paddingBottom = toPositiveNumber(pageMetrics?.padding?.bottom);
  const contentHeight = pageHeight - paddingTop - paddingBottom;

  return contentHeight > 0 ? contentHeight : 0;
};

const getNodeChildren = (node) => {
  if (!node) {
    return [];
  }

  const children = [];

  if (typeof node.forEach === "function") {
    node.forEach((child, offset, index) => {
      children.push({ node: child, offset, index });
    });
    return children;
  }

  const content = Array.isArray(node.content)
    ? node.content
    : Array.isArray(node.content?.content)
      ? node.content.content
      : [];

  content.forEach((child, index) => {
    children.push({
      node: child,
      offset: children.reduce(
        (sum, entry) => sum + toPositiveNumber(entry.node?.nodeSize, 1),
        0
      ),
      index
    });
  });

  return children;
};

const getCellSpan = (cellNode, key) => {
  const attrs = cellNode?.attrs || {};
  const value = attrs[key] ?? attrs[key.toLowerCase()] ?? attrs[key.toUpperCase()];

  return Math.max(1, Math.floor(toPositiveNumber(value, 1)));
};

export const buildTableRowGroupMeta = (rows = []) => {
  const rowCount = rows.length;
  const intervals = [];

  rows.forEach((rowNode, rowIndex) => {
    getNodeChildren(rowNode).forEach(({ node: cellNode }) => {
      const colspan = getCellSpan(cellNode, "colspan");
      const rowspan = getCellSpan(cellNode, "rowspan");

      if (colspan <= 1 && rowspan <= 1) {
        return;
      }

      intervals.push({
        start: rowIndex,
        end: Math.min(rowCount - 1, rowIndex + rowspan - 1)
      });
    });
  });

  if (!intervals.length) {
    return rows.map((_, rowIndex) => ({
      rowIndex,
      hasMergedCells: false,
      groupStartIndex: rowIndex,
      groupEndIndex: rowIndex
    }));
  }

  intervals.sort((left, right) => left.start - right.start || left.end - right.end);

  const mergedIntervals = [];

  intervals.forEach((interval) => {
    const previousInterval = mergedIntervals[mergedIntervals.length - 1];

    if (!previousInterval || interval.start > previousInterval.end) {
      mergedIntervals.push({ ...interval });
      return;
    }

    previousInterval.end = Math.max(previousInterval.end, interval.end);
  });

  return rows.map((_, rowIndex) => {
    const interval = mergedIntervals.find(
      (candidate) => rowIndex >= candidate.start && rowIndex <= candidate.end
    );

    if (!interval) {
      return {
        rowIndex,
        hasMergedCells: false,
        groupStartIndex: rowIndex,
        groupEndIndex: rowIndex
      };
    }

    return {
      rowIndex,
      hasMergedCells: true,
      groupStartIndex: interval.start,
      groupEndIndex: interval.end
    };
  });
};

export const getTooTallTableRowReports = ({
  tablePos,
  rowMeasurements = [],
  maxHeightPx,
  tolerancePx = 1
}) => {
  if (!Number.isFinite(maxHeightPx) || maxHeightPx <= 0) {
    return [];
  }

  const rows = rowMeasurements.map((measurement) => measurement.node);
  const groupMeta = buildTableRowGroupMeta(rows);
  const reportedGroupKeys = new Set();
  const reports = [];

  rowMeasurements.forEach((measurement, rowIndex) => {
    const meta = groupMeta[rowIndex];
    const isMultiRowGroup =
      meta?.hasMergedCells && meta.groupEndIndex > meta.groupStartIndex;

    if (isMultiRowGroup) {
      const groupKey = `${tablePos}:${meta.groupStartIndex}-${meta.groupEndIndex}`;

      if (reportedGroupKeys.has(groupKey) || rowIndex !== meta.groupStartIndex) {
        return;
      }

      reportedGroupKeys.add(groupKey);

      const heightPx = rowMeasurements
        .slice(meta.groupStartIndex, meta.groupEndIndex + 1)
        .reduce((sum, row) => sum + Math.max(0, row.heightPx || 0), 0);

      if (heightPx > maxHeightPx + tolerancePx) {
        const firstRow = rowMeasurements[meta.groupStartIndex];
        const lastRow = rowMeasurements[meta.groupEndIndex];

        reports.push({
          key: groupKey,
          kind: "group",
          tablePos,
          rowIndex,
          groupStartIndex: meta.groupStartIndex,
          groupEndIndex: meta.groupEndIndex,
          from: firstRow?.pos ?? null,
          to:
            lastRow?.pos != null
              ? lastRow.pos + toPositiveNumber(lastRow.node?.nodeSize, 1)
              : null,
          heightPx,
          maxHeightPx
        });
      }

      return;
    }

    const heightPx = Math.max(0, measurement.heightPx || 0);

    if (heightPx > maxHeightPx + tolerancePx) {
      reports.push({
        key: `${tablePos}:${rowIndex}`,
        kind: "row",
        tablePos,
        rowIndex,
        groupStartIndex: rowIndex,
        groupEndIndex: rowIndex,
        from: measurement.pos ?? null,
        to:
          measurement.pos != null
            ? measurement.pos + toPositiveNumber(measurement.node?.nodeSize, 1)
            : null,
        heightPx,
        maxHeightPx
      });
    }
  });

  return reports;
};

const getElementHeight = (element) => {
  if (!element) {
    return 0;
  }

  const rectHeight =
    typeof element.getBoundingClientRect === "function"
      ? element.getBoundingClientRect()?.height
      : 0;

  return (
    toPositiveNumber(rectHeight) ||
    toPositiveNumber(element.offsetHeight) ||
    toPositiveNumber(element.clientHeight)
  );
};

const getTableRowMeasurements = (view, tableNode, tablePos) =>
  getNodeChildren(tableNode)
    .filter(({ node }) => isTableRowNode(node))
    .map(({ node, offset, index }) => {
      const rowPos = tablePos + 1 + offset;
      const rowDom =
        typeof view?.nodeDOM === "function" ? view.nodeDOM(rowPos) : null;

      return {
        node,
        pos: rowPos,
        rowIndex: index,
        heightPx: getElementHeight(rowDom)
      };
    });

export const getTableRowOverflowReports = (
  view,
  { pageMetrics, tolerancePx = 1 } = {}
) => {
  const maxHeightPx = getTableRowOverflowLimit(pageMetrics);

  if (!view?.state?.doc || maxHeightPx <= 0) {
    return [];
  }

  const reports = [];

  view.state.doc.descendants((node, pos) => {
    if (!isTableNode(node)) {
      return true;
    }

    reports.push(
      ...getTooTallTableRowReports({
        tablePos: pos,
        rowMeasurements: getTableRowMeasurements(view, node, pos),
        maxHeightPx,
        tolerancePx
      })
    );

    return false;
  });

  return reports;
};

const getSelectionResolvedPosition = (selection) =>
  selection?.$headCell || selection?.$from || null;

const findSelectionTableRowContext = (state) => {
  const $pos = getSelectionResolvedPosition(state?.selection);

  if (!$pos) {
    return null;
  }

  let rowDepth = null;
  let tableDepth = null;

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);

    if (rowDepth === null && isTableRowNode(node)) {
      rowDepth = depth;
    }

    if (isTableNode(node)) {
      tableDepth = depth;
      break;
    }
  }

  if (rowDepth === null || tableDepth === null) {
    return null;
  }

  return {
    tableNode: $pos.node(tableDepth),
    tablePos: $pos.before(tableDepth),
    rowPos: $pos.before(rowDepth),
    rowIndex: $pos.index(tableDepth)
  };
};

export const getSelectionTableRowOverflowState = (
  view,
  { pageMetrics, tolerancePx = 1 } = {}
) => {
  const maxHeightPx = getTableRowOverflowLimit(pageMetrics);
  const context = findSelectionTableRowContext(view?.state);

  if (!context || maxHeightPx <= 0) {
    return null;
  }

  const rowMeasurements = getTableRowMeasurements(
    view,
    context.tableNode,
    context.tablePos
  );
  const groupMeta = buildTableRowGroupMeta(
    rowMeasurements.map((measurement) => measurement.node)
  );
  const meta = groupMeta[context.rowIndex];

  if (!meta) {
    return null;
  }

  const isMultiRowGroup =
    meta.hasMergedCells && meta.groupEndIndex > meta.groupStartIndex;
  const heightPx = isMultiRowGroup
    ? rowMeasurements
        .slice(meta.groupStartIndex, meta.groupEndIndex + 1)
        .reduce((sum, row) => sum + Math.max(0, row.heightPx || 0), 0)
    : Math.max(0, rowMeasurements[context.rowIndex]?.heightPx || 0);

  return {
    kind: isMultiRowGroup ? "group" : "row",
    tablePos: context.tablePos,
    rowIndex: context.rowIndex,
    groupStartIndex: meta.groupStartIndex,
    groupEndIndex: meta.groupEndIndex,
    heightPx,
    maxHeightPx,
    isAtLimit: heightPx >= maxHeightPx - tolerancePx
  };
};
