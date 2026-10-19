import { calculateCollapsedNodeHeight } from "../../extensions/utils/paginationUtils";
import { buildPaginationPageMap } from "../model/buildPaginationPageMap";

const getContinuationHeaderMeta = () => ({
  repeatedHeaderHeight: 0,
  repeatedHeaderHtml: ""
});

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);

const PAGE_MAIN_FLOW_CAPACITY_TOLERANCE = 0.000001;

const failPageMainFlowCapacity = (code) => {
  const error = new TypeError(code);
  error.code = code;
  throw error;
};

/**
 * Optional pure capacity contract used by the footnote PageMap bridge.  It is
 * deliberately inert unless a caller supplies it so the legacy plan stays
 * byte-for-byte shape compatible.
 */
const createPageMainFlowConfig = ({
  pageMainFlowByPage,
  pageMainFlowCapacities,
  contentAreaHeight
}) => {
  const source = pageMainFlowByPage ?? pageMainFlowCapacities;

  if (source === undefined || source === null) {
    return {
      get: () => ({ capacity: contentAreaHeight, source: null })
    };
  }

  const isRecordSource =
    typeof source === "object" &&
    (Object.getPrototypeOf(source) === Object.prototype ||
      Object.getPrototypeOf(source) === null);
  if (!Array.isArray(source) && !isRecordSource) {
    failPageMainFlowCapacity("INVALID_PAGE_MAIN_FLOW_CAPACITIES");
  }

  const entries = Array.isArray(source)
    ? source
    : Object.entries(source).map(([pageNumber, value]) => ({
        pageNumber: Number(pageNumber),
        ...(typeof value === "number" ? { mainFlowCapacity: value } : value)
      }));
  const byPageNumber = new Map();

  entries.forEach((entry) => {
    const pageNumber = entry?.pageNumber;
    if (!Number.isSafeInteger(pageNumber) || pageNumber <= 0) {
      failPageMainFlowCapacity("INVALID_PAGE_MAIN_FLOW_PAGE_NUMBER");
    }
    if (byPageNumber.has(pageNumber)) {
      failPageMainFlowCapacity("DUPLICATE_PAGE_MAIN_FLOW_CAPACITY");
    }
    const reservedHeight = entry?.reservedHeight;
    const hasReservedHeight = hasOwn(entry || {}, "reservedHeight");
    const hasMainFlowCapacity = hasOwn(entry || {}, "mainFlowCapacity");
    if (!hasReservedHeight && !hasMainFlowCapacity) {
      failPageMainFlowCapacity("MISSING_PAGE_MAIN_FLOW_CAPACITY");
    }
    if (
      hasReservedHeight &&
      (!Number.isFinite(reservedHeight) || reservedHeight < 0)
    ) {
      failPageMainFlowCapacity("INVALID_PAGE_MAIN_FLOW_RESERVATION");
    }
    if (
      hasMainFlowCapacity &&
      (!Number.isFinite(entry.mainFlowCapacity) ||
        entry.mainFlowCapacity <= 0 ||
        entry.mainFlowCapacity > contentAreaHeight)
    ) {
      failPageMainFlowCapacity("INVALID_PAGE_MAIN_FLOW_CAPACITY");
    }
    if (
      hasReservedHeight &&
      hasMainFlowCapacity &&
      Math.abs(
        entry.mainFlowCapacity + reservedHeight - contentAreaHeight
      ) > PAGE_MAIN_FLOW_CAPACITY_TOLERANCE
    ) {
      failPageMainFlowCapacity("INCONSISTENT_PAGE_MAIN_FLOW_CAPACITY");
    }
    const capacity = hasMainFlowCapacity
      ? entry.mainFlowCapacity
      : hasReservedHeight
        ? contentAreaHeight - reservedHeight
        : contentAreaHeight;

    if (!Number.isFinite(capacity) || capacity <= 0) {
      failPageMainFlowCapacity("INVALID_PAGE_MAIN_FLOW_CAPACITY");
    }

    byPageNumber.set(pageNumber, {
      capacity,
      source: {
        ...(hasMainFlowCapacity
          ? { mainFlowCapacity: entry.mainFlowCapacity }
          : {}),
        ...(hasReservedHeight ? { reservedHeight } : {})
      }
    });
  });

  return {
    get: (pageNumber) =>
      byPageNumber.get(pageNumber) || {
        capacity: contentAreaHeight,
        source: null
      }
  };
};

const getForcedBreakDecision = ({
  measurement,
  currentAccumulatedHeight,
  contentAreaHeight
}) => {
  if (!measurement.isBlockStart || currentAccumulatedHeight <= 0) {
    return null;
  }

  if (measurement.blockHints?.pageBreakBefore === true) {
    return {
      reason: "pageBreakBefore"
    };
  }

  if (
    measurement.blockHints?.keepWithNext === true &&
    measurement.keepWithNextPairHeight >
      contentAreaHeight - currentAccumulatedHeight
  ) {
    return {
      reason: "keepWithNext"
    };
  }

  return null;
};

const getMergedTableBreakDecision = ({
  measurement,
  currentAccumulatedHeight,
  contentAreaHeight
}) => {
  if (
    measurement.kind !== "tableRow" ||
    !measurement.tableRowHasMergedCells ||
    measurement.tableRowIndex !== measurement.tableRowGroupStartIndex
  ) {
    return null;
  }

  if (currentAccumulatedHeight <= 0) {
    return null;
  }

  const remainingHeight = contentAreaHeight - currentAccumulatedHeight;

  if (measurement.tableRowGroupHeight > remainingHeight) {
    return {
      reason: "tableMergedCellGroupKeptIntact"
    };
  }

  return null;
};

const getInlineTagBreakDecision = ({
  measurement,
  currentAccumulatedHeight,
  contentAreaHeight,
  previousMarginBottom
}) => {
  if (currentAccumulatedHeight <= 0 || contentAreaHeight <= 0) {
    return null;
  }

  const inlineTagGroups = measurement.inlineTagGroups || [];
  const protectedGroup = inlineTagGroups.find((inlineTagGroup) => {
    const groupHeight = inlineTagGroup.inlineTagGroupHeight;
    const groupMeasurementCount =
      inlineTagGroup.inlineTagGroupMeasurementCount ||
      inlineTagGroup.inlineTagLineCount ||
      0;

    if (
      !inlineTagGroup.inlineTagIsFirstLine ||
      groupMeasurementCount <= 1 ||
      inlineTagGroup.inlineTagGroupTooTall ||
      !Number.isFinite(groupHeight) ||
      groupHeight <= 0 ||
      groupHeight > contentAreaHeight
    ) {
      return false;
    }

    const firstMarginTop =
      inlineTagGroup.inlineTagGroupFirstMarginTop ?? measurement.marginTop ?? 0;
    const groupRequiredHeight =
      groupHeight -
      firstMarginTop +
      (Math.max(previousMarginBottom, firstMarginTop) -
        previousMarginBottom);

    return currentAccumulatedHeight + groupRequiredHeight > contentAreaHeight;
  });

  if (!protectedGroup) {
    return null;
  }

  return {
    reason: "inlineTagKeptIntact",
    inlineTagId: protectedGroup.inlineTagId
  };
};

const getMeasurementNaturalHeight = (measurement) =>
  calculateCollapsedNodeHeight({
    offsetHeight: measurement.offsetHeight,
    marginTop: measurement.marginTop,
    marginBottom: measurement.marginBottom,
    previousMarginBottom: 0
  });

const isTableRowGroupStart = (measurement) =>
  measurement.kind === "tableRow" &&
  measurement.tableRowHasMergedCells &&
  measurement.tableRowIndex === measurement.tableRowGroupStartIndex;

const isTableRowGroupMember = (measurement) =>
  measurement.kind === "tableRow" &&
  measurement.tableRowHasMergedCells &&
  Boolean(measurement.tableRowGroupId);

const getTableRowTooTallMeta = ({ measurement, contentAreaHeight }) => {
  if (measurement.kind !== "tableRow" || contentAreaHeight <= 0) {
    return null;
  }

  if (
    isTableRowGroupMember(measurement) &&
    measurement.tableRowGroupHeight > contentAreaHeight
  ) {
    return {
      kind: "group",
      reason: "tableRowTooTall",
      height: measurement.tableRowGroupHeight,
      groupId: measurement.tableRowGroupId,
      isGroupStart: isTableRowGroupStart(measurement)
    };
  }

  const rowHeight = getMeasurementNaturalHeight(measurement);

  if (rowHeight > contentAreaHeight) {
    return {
      kind: "row",
      reason: "tableRowTooTall",
      height: rowHeight,
      groupId: null,
      isGroupStart: false
    };
  }

  return null;
};

const shouldBreakBeforeTableTooTall = ({ tableTooTallMeta }) =>
  Boolean(
    tableTooTallMeta &&
      (tableTooTallMeta.kind === "row" || tableTooTallMeta.isGroupStart)
  );

const createTableRowTooTallDebugEntry = ({
  measurement,
  pageNumber,
  contentAreaHeight,
  tableTooTallMeta
}) => ({
  pos: measurement.pos,
  blockPos: measurement.blockPos,
  reason: "tableRowTooTall",
  pageNumber,
  tooTallKind: tableTooTallMeta?.kind || "row",
  tableRowGroupId: tableTooTallMeta?.groupId || null,
  measuredHeight: tableTooTallMeta?.height || measurement.offsetHeight,
  contentAreaHeight,
  fallback: "keepRowIntact"
});

const getOverflowBreakReason = (measurement, { contentAreaHeight } = {}) => {
  if (measurement.kind !== "tableRow") {
    return "overflow";
  }

  if (getTableRowTooTallMeta({ measurement, contentAreaHeight })) {
    return "tableRowTooTall";
  }

  if (measurement.blockHints?.allowRowSplit === false) {
    return "tableRowKeptIntact";
  }

  if (measurement.blockHints?.allowRowSplit === true) {
    return "tableRowSplitRequestedButFallback";
  }

  return "tableOverflow";
};

const createPageBreakEntry = ({
  measurement,
  fillerHeight,
  footerPageNumber,
  reason,
  continuationHeader
}) => {
  const shouldBreakBeforeWholeListItem =
    measurement.kind === "listLine" &&
    measurement.listLineIsFirstOfItem &&
    Number.isInteger(measurement.listItemPos);
  const shouldBreakBeforeWholeTable =
    measurement.kind === "tableRow" &&
    Number.isInteger(measurement.blockPos) &&
    (measurement.isBlockStart || measurement.tableRowIndex === 0);
  const breakPos = shouldBreakBeforeWholeListItem
    ? measurement.listItemPos
    : shouldBreakBeforeWholeTable
      ? measurement.blockPos
      : measurement.pos;
  const breakKind = shouldBreakBeforeWholeListItem
    ? "listItem"
    : shouldBreakBeforeWholeTable
      ? "block"
      : measurement.kind;

  return {
    pos: breakPos,
    fillerHeight: Math.max(0, fillerHeight),
    marginLeft: -(measurement.extraLeft || 0),
    marginRight: -(measurement.extraRight || 0),
    kind: breakKind,
    tableColSpan: measurement.tableColSpan,
    ...(breakKind === "tableRow" && measurement.tableBreakEndBorderHeight > 0
      ? { tableBreakEndBorderHeight: measurement.tableBreakEndBorderHeight } : {}),
    ...(breakKind === "tableRow" && measurement.tableBreakStartBorderHeight > 0
      ? { tableBreakStartBorderHeight: measurement.tableBreakStartBorderHeight } : {}),
    footerPageNumber,
    repeatedHeaderHeight: continuationHeader.repeatedHeaderHeight,
    repeatedHeaderHtml: continuationHeader.repeatedHeaderHtml,
    reason
  };
};

const createPageEntry = ({
  pageNumber,
  measurements,
  segments,
  contentAreaHeight,
  occupiedHeight,
  breakMeasurement,
  breakReason,
  pageMainFlowSource = null
}) => {
  const firstMeasurement = measurements[0] || null;
  const lastMeasurement = measurements[measurements.length - 1] || null;
  const blockPositions = Array.from(
    new Set(measurements.map((measurement) => measurement.blockPos))
  );

  return {
    pageNumber,
    startPos: firstMeasurement?.pos ?? null,
    endPos: lastMeasurement?.pos ?? null,
    startMeasurementIndex: firstMeasurement?.measurementIndex ?? null,
    endMeasurementIndex: lastMeasurement?.measurementIndex ?? null,
    startBlockPos: firstMeasurement?.blockPos ?? null,
    endBlockPos: lastMeasurement?.blockPos ?? null,
    startBlockType: firstMeasurement?.blockType ?? null,
    endBlockType: lastMeasurement?.blockType ?? null,
    startKind: firstMeasurement?.kind ?? null,
    endKind: lastMeasurement?.kind ?? null,
    measurementCount: measurements.length,
    segments,
    blockPositions,
    blockCount: blockPositions.length,
    occupiedHeight: Math.max(0, occupiedHeight),
    remainingHeight: Math.max(0, contentAreaHeight - occupiedHeight),
    breakReason: breakReason || null,
    breakPos: breakMeasurement?.pos ?? null,
    startsWithContinuation: false,
    endsWithContinuation: false,
    ...(pageMainFlowSource || {})
  };
};

const clampSegmentWidth = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

const getFallbackSegmentWidth = ({
  measurement,
  availableWidth
}) => {
  if (measurement.kind === "tableRow") {
    return availableWidth;
  }

  if (measurement.kind === "listLine") {
    return Math.max(availableWidth * 0.82, 96);
  }

  if (measurement.kind === "textLine") {
    return Math.max(availableWidth * 0.74, 96);
  }

  return Math.max(availableWidth * 0.88, 120);
};

const createPlacedMeasurementSegment = ({
  measurement,
  currentAccumulatedHeight,
  previousMarginBottom,
  contentAreaWidth,
  tableTooTallClipMeta = null
}) => {
  const collapsedMargin = Math.max(previousMarginBottom, measurement.marginTop);
  const localTop =
    currentAccumulatedHeight + (collapsedMargin - previousMarginBottom);
  const localLeft = Math.max(0, measurement.extraLeft || 0);
  const localRight = Math.max(0, measurement.extraRight || 0);
  const availableWidth = Math.max(0, contentAreaWidth - localLeft - localRight);
  const rawWidth =
    measurement.renderWidth && measurement.renderWidth > 0
      ? measurement.renderWidth
      : getFallbackSegmentWidth({
          measurement,
          availableWidth
        });
  const localWidth =
    availableWidth > 0
      ? clampSegmentWidth(rawWidth, Math.min(availableWidth, 24), availableWidth)
      : 0;

  return {
    pageLocalTop: Math.max(0, localTop),
    pageLocalBottom: Math.max(0, localTop + measurement.offsetHeight),
    localHeight: Math.max(1, measurement.offsetHeight),
    localLeft,
    localRight,
    localWidth,
    pos: measurement.pos,
    blockPos: measurement.blockPos,
    blockIndex: measurement.blockIndex,
    blockType: measurement.blockType,
    kind: measurement.kind,
    measurementIndex: measurement.measurementIndex,
    lineIndex: measurement.lineIndex ?? null,
    lineCount: measurement.lineCount ?? null,
    listItemIndex: measurement.listItemIndex ?? null,
    listItemOrdinal: measurement.listItemOrdinal ?? null,
    listType: measurement.listType ?? null,
    listDepth: measurement.listDepth ?? null,
    listLineIndex: measurement.listLineIndex ?? null,
    listLineCount: measurement.listLineCount ?? null,
    listLineIsFirstOfItem: measurement.listLineIsFirstOfItem ?? null,
    listLineIsContinuation: measurement.listLineIsContinuation ?? null,
    listMarkerText: measurement.listMarkerText ?? "",
    listMarkerKind: measurement.listMarkerKind ?? null,
    listMarkerGutterWidth: measurement.listMarkerGutterWidth ?? 0,
    listItemChecked: measurement.listItemChecked ?? null,
    tableRowIndex: measurement.tableRowIndex ?? null,
    tableRowHasMergedCells: Boolean(measurement.tableRowHasMergedCells),
    tableRowGroupId: measurement.tableRowGroupId ?? null,
    tableRowGroupStartIndex: measurement.tableRowGroupStartIndex ?? null,
    tableRowGroupEndIndex: measurement.tableRowGroupEndIndex ?? null,
    tableColSpan: measurement.tableColSpan ?? null,
    tableRowTooTall: Boolean(tableTooTallClipMeta),
    tableRowTooTallKind: tableTooTallClipMeta?.kind ?? null,
    tableRowTooTallGroupId: tableTooTallClipMeta?.groupId ?? null,
    tableRowTooTallMeasuredHeight: tableTooTallClipMeta?.height ?? null,
    tableRowTooTallClipHeight: tableTooTallClipMeta?.clipHeight ?? null
  };
};

const annotateContinuationFlags = (pages) =>
  pages.map((page, pageIndex) => {
    const previousPage = pages[pageIndex - 1] || null;
    const nextPage = pages[pageIndex + 1] || null;

    return {
      ...page,
      startsWithContinuation: Boolean(
        previousPage?.endBlockPos &&
          page.startBlockPos &&
          previousPage.endBlockPos === page.startBlockPos
      ),
      endsWithContinuation: Boolean(
        nextPage?.startBlockPos &&
          page.endBlockPos &&
          nextPage.startBlockPos === page.endBlockPos
      )
    };
  });

const buildBlockPageAssignments = ({ blocks = [], pages = [] }) => {
  const pagesByBlockPos = new Map();

  pages.forEach((page) => {
    page.blockPositions.forEach((blockPos) => {
      const assignedPages = pagesByBlockPos.get(blockPos) || [];

      if (assignedPages[assignedPages.length - 1] !== page.pageNumber) {
        assignedPages.push(page.pageNumber);
      }

      pagesByBlockPos.set(blockPos, assignedPages);
    });
  });

  return blocks
    .map((block) => {
      const assignedPages = pagesByBlockPos.get(block.pos) || [];

      if (!assignedPages.length) {
        return null;
      }

      return {
        blockPos: block.pos,
        blockIndex: block.index,
        blockType: block.nodeType,
        startPage: assignedPages[0],
        endPage: assignedPages[assignedPages.length - 1],
        pageCount: assignedPages.length,
        spansPages: assignedPages.length > 1
      };
    })
    .filter(Boolean);
};

export const calculatePaginationPlan = ({
  measurements,
  contentAreaHeight,
  section,
  pageMetrics,
  blocks = [],
  pageMainFlowByPage,
  pageMainFlowCapacities
}) => {
  const pageBreaks = [];
  const pages = [];
  const debugDecisions = [];
  const contentAreaWidth =
    (pageMetrics?.width || 0) -
    (pageMetrics?.padding?.left || 0) -
    (pageMetrics?.padding?.right || 0);
  const pageMainFlow = createPageMainFlowConfig({
    pageMainFlowByPage,
    pageMainFlowCapacities,
    contentAreaHeight
  });
  let currentAccumulatedHeight = 0;
  let currentPageNumber = 1;
  let currentContentAreaHeight = pageMainFlow.get(currentPageNumber).capacity;
  let previousMarginBottom = 0;
  let activeProtectedTableGroupId = null;
  let activeTooTallTableGroup = null;
  let currentPageMeasurements = [];
  let currentPageSegments = [];

  if (section?.breakType && section.breakType !== "continuous") {
    debugDecisions.push({
      kind: "sectionBreak",
      reason: "singleSectionRuntimeFallback",
      sectionBreakType: section.breakType
    });
  }

  for (const measurement of measurements) {
    const continuationHeader = getContinuationHeaderMeta(measurement);
    let tableTooTallMeta = getTableRowTooTallMeta({
      measurement,
      contentAreaHeight: currentContentAreaHeight
    });
    const mergedTableBreakDecision = getMergedTableBreakDecision({
      measurement,
      currentAccumulatedHeight,
      contentAreaHeight: currentContentAreaHeight
    });
    const forcedBreakDecision = getForcedBreakDecision({
      measurement,
      currentAccumulatedHeight,
      contentAreaHeight: currentContentAreaHeight
    });
    const inlineTagBreakDecision = getInlineTagBreakDecision({
      measurement,
      currentAccumulatedHeight,
      contentAreaHeight: currentContentAreaHeight,
      previousMarginBottom
    });
    const tableRowTooTallBreakDecision =
      shouldBreakBeforeTableTooTall({ tableTooTallMeta }) &&
      currentAccumulatedHeight > 0
        ? { reason: "tableRowTooTall" }
        : null;
    const preOverflowBreakDecision =
      forcedBreakDecision ||
      tableRowTooTallBreakDecision ||
      mergedTableBreakDecision ||
      inlineTagBreakDecision;

    if (preOverflowBreakDecision) {
      pageBreaks.push(
        createPageBreakEntry({
          measurement,
          fillerHeight: currentContentAreaHeight - currentAccumulatedHeight,
          footerPageNumber: currentPageNumber,
          reason: preOverflowBreakDecision.reason,
          continuationHeader
        })
      );
      pages.push(
        createPageEntry({
          pageNumber: currentPageNumber,
          measurements: currentPageMeasurements,
          segments: currentPageSegments,
          contentAreaHeight: currentContentAreaHeight,
          occupiedHeight: currentAccumulatedHeight,
          breakMeasurement: measurement,
          breakReason: preOverflowBreakDecision.reason,
          pageMainFlowSource: pageMainFlow.get(currentPageNumber).source
        })
      );
      debugDecisions.push({
        pos: measurement.pos,
        blockPos: measurement.blockPos,
        reason: preOverflowBreakDecision.reason,
        pageNumber: currentPageNumber
      });

      currentPageNumber += 1;
      currentContentAreaHeight = pageMainFlow.get(currentPageNumber).capacity;
      currentAccumulatedHeight = continuationHeader.repeatedHeaderHeight;
      previousMarginBottom = 0;
      activeProtectedTableGroupId = null;
      activeTooTallTableGroup = null;
      currentPageMeasurements = [];
      currentPageSegments = [];
      tableTooTallMeta = getTableRowTooTallMeta({
        measurement,
        contentAreaHeight: currentContentAreaHeight
      });
    }

    const isInsideProtectedMergedTableGroup =
      Boolean(activeProtectedTableGroupId) &&
      measurement.tableRowGroupId === activeProtectedTableGroupId;

    const nodeHeight = calculateCollapsedNodeHeight({
      offsetHeight: measurement.offsetHeight,
      marginTop: measurement.marginTop,
      marginBottom: measurement.marginBottom,
      previousMarginBottom
    });
    const requiredHeight =
      nodeHeight + continuationHeader.repeatedHeaderHeight;

    if (
      currentAccumulatedHeight > 0 &&
      !isInsideProtectedMergedTableGroup &&
      currentAccumulatedHeight + requiredHeight > currentContentAreaHeight
    ) {
      const overflowReason = getOverflowBreakReason(measurement, {
        contentAreaHeight: currentContentAreaHeight
      });

      pageBreaks.push(
        createPageBreakEntry({
          measurement,
          fillerHeight: currentContentAreaHeight - currentAccumulatedHeight,
          footerPageNumber: currentPageNumber,
          reason: overflowReason,
          continuationHeader
        })
      );
      pages.push(
        createPageEntry({
          pageNumber: currentPageNumber,
          measurements: currentPageMeasurements,
          segments: currentPageSegments,
          contentAreaHeight: currentContentAreaHeight,
          occupiedHeight: currentAccumulatedHeight,
          breakMeasurement: measurement,
          breakReason: overflowReason,
          pageMainFlowSource: pageMainFlow.get(currentPageNumber).source
        })
      );
      debugDecisions.push({
        pos: measurement.pos,
        blockPos: measurement.blockPos,
        reason: overflowReason,
        pageNumber: currentPageNumber
      });

      currentPageNumber += 1;
      currentContentAreaHeight = pageMainFlow.get(currentPageNumber).capacity;
      currentAccumulatedHeight = continuationHeader.repeatedHeaderHeight;
      previousMarginBottom = 0;
      activeProtectedTableGroupId = null;
      activeTooTallTableGroup = null;
      currentPageMeasurements = [];
      currentPageSegments = [];
      tableTooTallMeta = getTableRowTooTallMeta({
        measurement,
        contentAreaHeight: currentContentAreaHeight
      });
    }

    if (
      tableTooTallMeta &&
      shouldBreakBeforeTableTooTall({ tableTooTallMeta }) &&
      currentPageMeasurements.length === 0
    ) {
      debugDecisions.push(
        createTableRowTooTallDebugEntry({
          measurement,
          pageNumber: currentPageNumber,
          contentAreaHeight: currentContentAreaHeight,
          tableTooTallMeta
        })
      );
    }

    if (tableTooTallMeta?.kind === "group" && tableTooTallMeta.isGroupStart) {
      activeTooTallTableGroup = {
        groupId: tableTooTallMeta.groupId,
        height: tableTooTallMeta.height,
        consumedHeight: 0
      };
    }

    const tableTooTallClipMeta =
      tableTooTallMeta?.kind === "row"
        ? {
            ...tableTooTallMeta,
            clipHeight: currentContentAreaHeight
          }
        : activeTooTallTableGroup &&
            tableTooTallMeta?.kind === "group" &&
            tableTooTallMeta.groupId === activeTooTallTableGroup.groupId
          ? {
              ...tableTooTallMeta,
              clipHeight: Math.max(
                0,
                currentContentAreaHeight - activeTooTallTableGroup.consumedHeight
              )
            }
          : null;

    currentPageSegments.push(
      createPlacedMeasurementSegment({
        measurement,
        currentAccumulatedHeight,
        previousMarginBottom,
        contentAreaWidth,
        tableTooTallClipMeta
      })
    );

    const pageNodeHeight = calculateCollapsedNodeHeight({
      offsetHeight: measurement.offsetHeight,
      marginTop: measurement.marginTop,
      marginBottom: measurement.marginBottom,
      previousMarginBottom
    });

    currentAccumulatedHeight += pageNodeHeight;
    previousMarginBottom = measurement.marginBottom;
    currentPageMeasurements.push(measurement);

    if (
      activeTooTallTableGroup &&
      measurement.tableRowGroupId === activeTooTallTableGroup.groupId
    ) {
      activeTooTallTableGroup.consumedHeight += Math.max(
        0,
        measurement.offsetHeight || 0
      );

      if (measurement.tableRowIndex >= measurement.tableRowGroupEndIndex) {
        activeTooTallTableGroup = null;
      }
    } else if (measurement.kind !== "tableRow") {
      activeTooTallTableGroup = null;
    }

    if (
      measurement.kind === "tableRow" &&
      measurement.tableRowHasMergedCells &&
      measurement.tableRowGroupId
    ) {
      activeProtectedTableGroupId =
        measurement.tableRowIndex < measurement.tableRowGroupEndIndex
          ? measurement.tableRowGroupId
          : null;
    } else if (
      measurement.kind === "tableRow" &&
      activeProtectedTableGroupId &&
      measurement.tableRowGroupId !== activeProtectedTableGroupId
    ) {
      activeProtectedTableGroupId = null;
    } else if (measurement.kind !== "tableRow") {
      activeProtectedTableGroupId = null;
    }
  }

  pages.push(
    createPageEntry({
      pageNumber: currentPageNumber,
      measurements: currentPageMeasurements,
      segments: currentPageSegments,
      contentAreaHeight: currentContentAreaHeight,
      occupiedHeight: currentAccumulatedHeight,
      pageMainFlowSource: pageMainFlow.get(currentPageNumber).source
    })
  );

  const annotatedPages = annotateContinuationFlags(pages);

  const blockPageAssignments = buildBlockPageAssignments({
    blocks,
    pages: annotatedPages
  });
  const plan = {
    pageBreaks,
    finalFillerHeight: Math.max(
      0,
      currentContentAreaHeight - currentAccumulatedHeight
    ),
    totalPages: currentPageNumber,
    debugDecisions,
    pages: annotatedPages,
    blockPageAssignments
  };

  return {
    ...plan,
    pageMap: buildPaginationPageMap(plan)
  };
};
