const BREAK_REASON_LABELS = {
  overflow: "다음 페이지로 이어짐",
  pageBreakBefore: "강제 페이지 나눔",
  keepWithNext: "제목 묶음 유지",
  inlineTagKeptIntact: "태그 통째 유지",
  tableMergedCellGroupKeptIntact: "병합 셀 행 묶음 유지",
  tableRowTooTall: "표 행이 페이지보다 큼",
  tableRowKeptIntact: "표 행 통째 유지",
  tableRowSplitRequestedButFallback: "표 행 분할은 아직 제한적",
  tableOverflow: "표가 다음 페이지로 이동"
};

const SEGMENT_KIND_LABELS = {
  textLine: "문단 줄",
  listLine: "리스트 줄",
  tableRow: "표 행",
  block: "블록"
};

const getBlockTypeLabel = (blockType) => {
  if (blockType === "table") {
    return "표";
  }

  if (
    blockType === "bulletList" ||
    blockType === "orderedList" ||
    blockType === "taskList"
  ) {
    return "리스트";
  }

  if (blockType === "object") {
    return "객체";
  }

  return "문단";
};

const getBreakReasonLabel = (breakReason) =>
  BREAK_REASON_LABELS[breakReason] || null;

const getSegmentKindLabel = (kind) => SEGMENT_KIND_LABELS[kind] || "세그먼트";

const getBlockRangeLabel = (startBlockIndex, endBlockIndex) => {
  if (!startBlockIndex || !endBlockIndex) {
    return "블록 범위 없음";
  }

  if (startBlockIndex === endBlockIndex) {
    return `블록 ${startBlockIndex}`;
  }

  return `블록 ${startBlockIndex}-${endBlockIndex}`;
};

const countSpanningBlocksOnPage = ({
  blockPageAssignments = [],
  pageNumber
}) =>
  blockPageAssignments.filter(
    (assignment) =>
      assignment.spansPages &&
      assignment.startPage <= pageNumber &&
      assignment.endPage >= pageNumber
  ).length;

const getSegmentRenderType = (segment) => {
  if (segment.kind === "tableRow") {
    return "tableRow";
  }

  if (segment.kind === "listLine") {
    return "listLine";
  }

  if (segment.kind === "textLine") {
    return "textLine";
  }

  return "block";
};

const buildPageContentSegments = ({
  page,
  pageNumber,
  contentAreaWidth,
  blockAssignmentByPos
}) =>
  (page.segments || []).map((segment, segmentIndex) => {
    const renderType = getSegmentRenderType(segment);
    const blockAssignment = blockAssignmentByPos.get(segment.blockPos) || null;
    const isFirstListLineOfItem =
      segment.listLineIsFirstOfItem ?? segment.listLineIndex === 0;
    const shouldUseSyntheticListMarker =
      renderType === "listLine" && Boolean(isFirstListLineOfItem);
    const segmentMarkerText = shouldUseSyntheticListMarker
      ? segment.listMarkerText || ""
      : "";
    const segmentMarkerKind = segment.listMarkerKind || "bullet";
    const segmentMarkerGutterWidth = Math.max(
      18,
      segment.listMarkerGutterWidth || 18
    );
    const localLeft = Math.max(0, segment.localLeft || 0);
    const localWidth = Math.max(
      12,
      Math.min(
        contentAreaWidth - localLeft,
        segment.localWidth || contentAreaWidth - localLeft
      )
    );
    const continuesFromPrevious =
      page.startsWithContinuation &&
      segment.blockPos === page.startBlockPos &&
      segment.measurementIndex === page.startMeasurementIndex;
    const continuesToNext =
      page.endsWithContinuation &&
      segment.blockPos === page.endBlockPos &&
      segment.measurementIndex === page.endMeasurementIndex;
    const baseDebugLabel =
      renderType === "listLine" && shouldUseSyntheticListMarker
        ? `${getSegmentKindLabel(segment.kind)} · ${segment.listMarkerText || "marker"} · pos ${segment.pos}`
        : `${getSegmentKindLabel(segment.kind)} · pos ${segment.pos}`;
    const debugLabel = segment.tableRowTooTall
      ? `${baseDebugLabel} · tableRowTooTall`
      : baseDebugLabel;

    return {
      id: `${pageNumber}:${segment.measurementIndex ?? segmentIndex}:${segment.pos}`,
      pos: segment.pos,
      blockPos: segment.blockPos,
      blockType: segment.blockType,
      kind: segment.kind,
      kindLabel: getSegmentKindLabel(segment.kind),
      pageLocalTop: segment.pageLocalTop,
      pageLocalBottom: segment.pageLocalBottom,
      localHeight: segment.localHeight,
      localLeft,
      localWidth,
      renderType,
      lineIndex: segment.lineIndex ?? null,
      lineCount: segment.lineCount ?? null,
      listItemIndex: segment.listItemIndex ?? null,
      listItemOrdinal: segment.listItemOrdinal ?? null,
      listType: segment.listType ?? null,
      listDepth: segment.listDepth ?? null,
      listLineIndex: segment.listLineIndex ?? null,
      listLineCount: segment.listLineCount ?? null,
      listLineIsFirstOfItem: Boolean(segment.listLineIsFirstOfItem),
      listLineIsContinuation: Boolean(segment.listLineIsContinuation),
      listMarkerText: segment.listMarkerText ?? "",
      listMarkerKind: segment.listMarkerKind ?? null,
      listMarkerGutterWidth: segment.listMarkerGutterWidth ?? 0,
      listItemChecked: segment.listItemChecked ?? null,
      tableRowIndex: segment.tableRowIndex ?? null,
      isMergedTableRow: Boolean(segment.tableRowHasMergedCells),
      tableRowTooTall: Boolean(segment.tableRowTooTall),
      tableRowTooTallKind: segment.tableRowTooTallKind ?? null,
      tableRowTooTallGroupId: segment.tableRowTooTallGroupId ?? null,
      tableRowTooTallMeasuredHeight:
        segment.tableRowTooTallMeasuredHeight ?? null,
      tableRowTooTallClipHeight: segment.tableRowTooTallClipHeight ?? null,
      blockSpansPages: Boolean(blockAssignment?.spansPages),
      showSegmentMarker: shouldUseSyntheticListMarker,
      segmentMarkerText,
      segmentMarkerKind,
      segmentMarkerGutterWidth,
      segmentMarkerDepth: segment.listDepth ?? 0,
      segmentMarkerOrdinal: segment.listItemOrdinal ?? null,
      showListMarker: shouldUseSyntheticListMarker,
      showMergedGroupBadge:
        renderType === "tableRow" &&
        segment.tableRowHasMergedCells &&
        segment.tableRowIndex === segment.tableRowGroupStartIndex,
      continuesFromPrevious,
      continuesToNext,
      debugLabel
    };
  });

export const buildPaginationPageSegmentModel = ({
  input,
  plan,
  pageMap,
  pageMetrics,
  gapHeight = 50,
  viewPage
}) => {
  if (!viewPage || !pageMetrics) {
    return null;
  }

  const effectivePageMetrics = input?.pageMetrics || pageMetrics;
  const effectiveGapHeight = gapHeight;
  const effectivePageMap = pageMap || plan?.pageMap || null;
  const blockPageAssignments =
    effectivePageMap?.blockPageAssignments || plan?.blockPageAssignments || [];
  const totalPages = Math.max(
    effectivePageMap?.totalPages || plan?.totalPages || 1,
    1
  );
  const contentAreaTop = effectivePageMetrics.padding?.top || 0;
  const contentAreaLeft = effectivePageMetrics.padding?.left || 0;
  const contentAreaHeight =
    (effectivePageMetrics.pageHeightPx || 0) -
    (effectivePageMetrics.padding?.top || 0) -
    (effectivePageMetrics.padding?.bottom || 0);
  const contentAreaWidth =
    (effectivePageMetrics.width || 0) -
    (effectivePageMetrics.padding?.left || 0) -
    (effectivePageMetrics.padding?.right || 0);
  const blockIndexByPos = new Map(
    (input?.blocks || []).map((block) => [block.pos, block.index + 1])
  );
  const blockAssignmentByPos = new Map(
    blockPageAssignments.map((assignment) => [
      assignment.blockPos,
      assignment
    ])
  );

  return {
    pageMetrics: effectivePageMetrics,
    pageMapVersion: effectivePageMap?.version ?? null,
    gapHeight: effectiveGapHeight,
    totalPages,
    totalHeight:
      totalPages * (effectivePageMetrics.pageHeightPx || 0) +
      Math.max(0, totalPages - 1) * effectiveGapHeight,
    contentAreaTop,
    contentAreaLeft,
    contentAreaHeight,
    contentAreaWidth,
    pages: Array.from({ length: totalPages }, (_, pageIndex) => {
      const pageNumber = pageIndex + 1;
      const page =
        effectivePageMap?.pages?.[pageIndex] || plan?.pages?.[pageIndex] || {};
      const pageTop =
        pageIndex *
        ((effectivePageMetrics.pageHeightPx || 0) + effectiveGapHeight);
      const startBlockIndex = blockIndexByPos.get(page.startBlockPos) || null;
      const endBlockIndex = blockIndexByPos.get(page.endBlockPos) || null;
      const blockRangeLabel = getBlockRangeLabel(startBlockIndex, endBlockIndex);
      const continuationLabel = page.startsWithContinuation
        ? `${getBlockTypeLabel(page.startBlockType)} 이어짐`
        : null;
      const nextContinuationLabel = page.endsWithContinuation
        ? `${getBlockTypeLabel(page.endBlockType)} 다음 페이지로 이어짐`
        : null;
      const breakLabel = getBreakReasonLabel(page.breakReason);
      const filledHeight = Math.max(
        0,
        Math.min(page.occupiedHeight || 0, contentAreaHeight)
      );
      const contentSegments = buildPageContentSegments({
        page,
        pageNumber,
        contentAreaWidth,
        blockAssignmentByPos
      });
      const footnote = effectivePageMap?.footnoteLayout?.pages?.find(
        (entry) => entry.pageNumber === pageNumber
      ) || page.footnote || null;
      const footnoteReservedHeight = footnote?.reservedHeight || 0;

      return {
        pageNumber,
        top: pageTop,
        startPos: page.startPos ?? null,
        endPos: page.endPos ?? null,
        startBlockPos: page.startBlockPos ?? null,
        endBlockPos: page.endBlockPos ?? null,
        startBlockType: page.startBlockType ?? null,
        endBlockType: page.endBlockType ?? null,
        measurementCount: page.measurementCount ?? 0,
        blockCount: page.blockCount ?? 0,
        blockRangeLabel,
        occupiedHeight: page.occupiedHeight ?? 0,
        remainingHeight: page.remainingHeight ?? contentAreaHeight,
        filledHeight,
        fillRatio:
          contentAreaHeight > 0 ? filledHeight / contentAreaHeight : 0,
        contentFrameTop: contentAreaTop,
        contentFrameLeft: contentAreaLeft,
        contentFrameWidth: contentAreaWidth,
        contentFrameHeight: contentAreaHeight,
        contentFrameBottom: effectivePageMetrics.padding?.bottom || 0,
        mainFlowFrameHeight: Math.max(0, contentAreaHeight - footnoteReservedHeight),
        footnoteReservedHeight,
        footnoteChromeHeight: footnote?.noteAreaOverhead || 0,
        footnoteBodyHeight: footnote?.bodyReservedHeight || 0,
        footnoteSegments: footnote?.segments || [],
        contentOffsetTop: pageTop + contentAreaTop,
        contentOffsetLeft: contentAreaLeft,
        contentRenderMode: "mirrorSlice",
        topLabel: continuationLabel
          ? `${continuationLabel} · ${blockRangeLabel}`
          : blockRangeLabel,
        bottomLabel: nextContinuationLabel || breakLabel,
        breakReason: page.breakReason ?? null,
        startsWithContinuation: Boolean(page.startsWithContinuation),
        endsWithContinuation: Boolean(page.endsWithContinuation),
        spanningBlockCount: countSpanningBlocksOnPage({
          blockPageAssignments,
          pageNumber
        }),
        contentSegments,
        debugSummary: {
          pageMapVersion: effectivePageMap?.version ?? null,
          startPos: page.startPos ?? null,
          endPos: page.endPos ?? null,
          measurementCount: page.measurementCount ?? 0,
          blockCount: page.blockCount ?? 0,
          occupiedHeight: page.occupiedHeight ?? 0,
          remainingHeight: page.remainingHeight ?? contentAreaHeight
        }
      };
    })
  };
};
