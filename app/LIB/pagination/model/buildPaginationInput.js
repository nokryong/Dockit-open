import { fromEditorStateToIR } from "../../ir/fromProseMirror";
import {
  calculateCollapsedNodeHeight,
  getContentAreaHeight
} from "../../extensions/utils/paginationUtils";
import { mm2px, px2mm } from "../../utils/unitUtils";

const buildSectionPageSettingsFromPageMetrics = (pageMetrics) => {
  if (!pageMetrics) {
    return undefined;
  }

  return {
    widthMm: px2mm(pageMetrics.width),
    heightMm: px2mm(pageMetrics.pageHeightPx),
    paddingTopMm: px2mm(pageMetrics.padding?.top || 0),
    paddingBottomMm: px2mm(pageMetrics.padding?.bottom || 0),
    paddingLeftMm: px2mm(pageMetrics.padding?.left || 0),
    paddingRightMm: px2mm(pageMetrics.padding?.right || 0),
    lineHeight: pageMetrics.lineHeight ?? 1.5
  };
};

const buildPageMetricsFromSection = (pageMetrics, pageSettings) => {
  if (!pageSettings) {
    return pageMetrics;
  }

  return {
    ...pageMetrics,
    width: mm2px(pageSettings.widthMm),
    pageHeightPx: mm2px(pageSettings.heightMm),
    padding: {
      top: mm2px(pageSettings.paddingTopMm),
      bottom: mm2px(pageSettings.paddingBottomMm),
      left: mm2px(pageSettings.paddingLeftMm),
      right: mm2px(pageSettings.paddingRightMm)
    },
    lineHeight: pageSettings.lineHeight ?? pageMetrics?.lineHeight
  };
};

const summarizeMeasurementGroup = (measurements = []) => {
  let previousMarginBottom = 0;
  let totalHeight = 0;

  measurements.forEach((measurement) => {
    totalHeight += calculateCollapsedNodeHeight({
      offsetHeight: measurement.offsetHeight,
      marginTop: measurement.marginTop,
      marginBottom: measurement.marginBottom,
      previousMarginBottom
    });

    previousMarginBottom = measurement.marginBottom;
  });

  return {
    totalHeight,
    firstMarginTop: measurements[0]?.marginTop ?? 0,
    lastMarginBottom: measurements[measurements.length - 1]?.marginBottom ?? 0,
    firstMeasurementPos: measurements[0]?.pos ?? null,
    measurementCount: measurements.length
  };
};

const parseCellSpan = (attrs = {}, key) => {
  const rawValue = Number(attrs?.[key]);
  return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 1;
};

const buildTableMergedRowMeta = (tableSource) => {
  if (!tableSource) {
    return [];
  }

  const rows = Array.isArray(tableSource.rows)
    ? tableSource.rows
    : Array.isArray(tableSource.content)
      ? tableSource.content
      : [];
  const rowCount = rows.length;

  if (rowCount === 0) {
    return [];
  }

  const intervals = [];

  rows.forEach((rowNode, rowIndex) => {
    const cells = Array.isArray(rowNode?.cells)
      ? rowNode.cells
      : Array.isArray(rowNode?.content)
        ? rowNode.content
        : [];

    cells.forEach((cellNode) => {
      const cellAttrs = cellNode?.attrs || {};
      const colspan = parseCellSpan(cellAttrs, "colspan");
      const rowspan = parseCellSpan(cellAttrs, "rowspan");

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
    return Array.from({ length: rowCount }, (_, rowIndex) => ({
      rowIndex,
      hasMergedCells: false,
      groupStartIndex: rowIndex,
      groupEndIndex: rowIndex
    }));
  }

  intervals.sort((left, right) => left.start - right.start || left.end - right.end);

  const mergedIntervals = [];

  intervals.forEach((interval) => {
    const lastInterval = mergedIntervals[mergedIntervals.length - 1];

    if (!lastInterval || interval.start > lastInterval.end) {
      mergedIntervals.push({ ...interval });
      return;
    }

    lastInterval.end = Math.max(lastInterval.end, interval.end);
  });

  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const activeInterval = mergedIntervals.find(
      (interval) =>
        rowIndex >= interval.start && rowIndex <= interval.end
    );

    if (!activeInterval) {
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
      groupStartIndex: activeInterval.start,
      groupEndIndex: activeInterval.end
    };
  });
};

const calculateAdjacentBlockHeight = (currentBlock, nextBlock) => {
  if (!currentBlock) {
    return 0;
  }

  if (!nextBlock) {
    return currentBlock.totalHeight;
  }

  return (
    currentBlock.totalHeight +
    nextBlock.totalHeight -
    Math.min(currentBlock.lastMarginBottom, nextBlock.firstMarginTop)
  );
};

const getBlockHints = (irBlock) => ({
  keepWithNext: irBlock?.keepWithNext ?? null,
  keepLinesTogether: irBlock?.keepLinesTogether ?? null,
  pageBreakBefore: irBlock?.pageBreakBefore ?? null,
  widows: irBlock?.widows ?? null,
  orphans: irBlock?.orphans ?? null,
  headerRowRepeat: irBlock?.headerRowRepeat ?? null,
  allowRowSplit: irBlock?.allowRowSplit ?? null
});

export const buildPaginationInput = ({
  editorState,
  pageMetrics,
  domModel,
  footnoteCandidate = undefined
}) => {
  const ir = fromEditorStateToIR(editorState, {
    pageSettings: buildSectionPageSettingsFromPageMetrics(pageMetrics)
  });
  const section = ir.sections[0] || null;
  const effectivePageMetrics = buildPageMetricsFromSection(
    pageMetrics,
    section?.pageSettings
  );
  const contentAreaHeight = getContentAreaHeight(effectivePageMetrics);
  const candidateExcludedBodyPositions = new Set(
    footnoteCandidate?.status === "ok" &&
    Array.isArray(footnoteCandidate.excludedBodyPositions)
      ? footnoteCandidate.excludedBodyPositions.filter(
        (pos) => Number.isSafeInteger(pos) && pos >= 0
      )
      : []
  );
  const topLevelNodes = [];

  editorState.doc.forEach((node, pos) => {
    topLevelNodes.push({
      node,
      pos,
      sourceIndex: topLevelNodes.length
    });
  });

  const isExcludedFootnoteBody = ({ node, pos }) =>
    candidateExcludedBodyPositions.has(pos) &&
    node?.type?.name === "noteBody" &&
    node?.attrs?.kind === "footnote";
  const excludedFootnoteBodyPositions = new Set(
    topLevelNodes
      .filter(isExcludedFootnoteBody)
      .map(({ pos }) => pos)
  );
  const paginationTopLevelNodes = topLevelNodes.filter(
    (entry) => !isExcludedFootnoteBody(entry)
  );
  const firstEndnoteBodyPos = paginationTopLevelNodes.find(
    ({ node }) =>
      node?.type?.name === "noteBody" && node?.attrs?.kind === "endnote"
  )?.pos ?? null;
  const irBlocksBySourceIndex = new Map(
    (section?.blocks || []).map((irBlock, irBlockIndex) => [
      Number.isSafeInteger(irBlock?.sourceBlockIndex) &&
      irBlock.sourceBlockIndex >= 0
        ? irBlock.sourceBlockIndex
        : irBlockIndex,
      irBlock
    ])
  );

  const measurementsByBlockPos = new Map();

  const mainFlowMeasurements = domModel.measurements.filter(
    (measurement) => !excludedFootnoteBodyPositions.has(measurement.blockPos)
  );

  mainFlowMeasurements.forEach((measurement, measurementIndex) => {
    const existing = measurementsByBlockPos.get(measurement.blockPos) || [];
    existing.push({
      ...measurement,
      measurementIndex
    });
    measurementsByBlockPos.set(measurement.blockPos, existing);
  });

  const blocks = paginationTopLevelNodes.map(({ node, pos, sourceIndex }) => {
    const blockMeasurements = measurementsByBlockPos.get(pos) || [];
    const summary = summarizeMeasurementGroup(blockMeasurements);
    const domBlock = domModel.blocks.find((block) => block.pos === pos) || {};
    const irBlock = irBlocksBySourceIndex.get(sourceIndex) || null;
    const mergedTableRowMeta =
      node.type.name === "table" ? buildTableMergedRowMeta(irBlock) : [];
    const hints = getBlockHints(irBlock);

    return {
      index: sourceIndex,
      pos,
      nodeSize: node.nodeSize,
      nodeType: node.type.name,
      irBlock,
      hints: {
        ...hints,
        pageBreakBefore:
          pos === firstEndnoteBodyPos ? true : hints.pageBreakBefore
      },
      sectionBreakType: section?.breakType || "continuous",
      repeatHeaderHtml: domBlock.repeatHeaderHtml || "",
      repeatHeaderHeight: domBlock.repeatHeaderHeight || 0,
      tableHeaderRowCount: domBlock.tableHeaderRowCount || 0,
      tableColSpan: domBlock.tableColSpan || null,
      mergedTableRowMeta,
      totalHeight: summary.totalHeight,
      firstMarginTop: summary.firstMarginTop,
      lastMarginBottom: summary.lastMarginBottom,
      firstMeasurementPos: summary.firstMeasurementPos,
      measurementCount: summary.measurementCount
    };
  });

  const blocksByPos = new Map(blocks.map((block) => [block.pos, block]));
  const nextBlockByPos = new Map(
    blocks.map((block, index) => [block.pos, blocks[index + 1] || null])
  );

  const enhancedMeasurements = mainFlowMeasurements.map(
    (measurement, measurementIndex) => {
      const block = blocksByPos.get(measurement.blockPos) || null;
      const nextBlock = block ? nextBlockByPos.get(block.pos) || null : null;
      const blockMeasurements =
        measurementsByBlockPos.get(measurement.blockPos) || [];
      const isBlockStart =
        blockMeasurements[0]?.measurementIndex === measurementIndex;

      return {
        ...measurement,
        measurementIndex,
        blockIndex: block?.index ?? null,
        isBlockStart,
        blockHints: block?.hints || {},
        blockTotalHeight: block?.totalHeight ?? 0,
        keepWithNextPairHeight: block
          ? calculateAdjacentBlockHeight(block, nextBlock)
          : 0,
        nextBlockPos: nextBlock?.pos ?? null,
        nextBlockTotalHeight: nextBlock?.totalHeight ?? 0,
        sectionBreakType: block?.sectionBreakType || "continuous",
        repeatHeaderHtml:
          measurement.repeatHeaderHtml || block?.repeatHeaderHtml || "",
        repeatHeaderHeight:
          measurement.repeatHeaderHeight ?? block?.repeatHeaderHeight ?? 0,
        tableHeaderRowCount:
          measurement.tableHeaderRowCount ?? block?.tableHeaderRowCount ?? 0,
        tableColSpan: measurement.tableColSpan ?? block?.tableColSpan ?? null,
        tableRowMergeMeta:
          block?.mergedTableRowMeta?.[measurement.tableRowIndex ?? -1] || null
      };
    }
  );

  const mergedTableGroupHeights = new Map();

  enhancedMeasurements.forEach((measurement) => {
    if (
      measurement.kind !== "tableRow" ||
      !measurement.tableRowMergeMeta?.hasMergedCells
    ) {
      return;
    }

    const groupKey = `${measurement.blockPos}:${measurement.tableRowMergeMeta.groupStartIndex}-${measurement.tableRowMergeMeta.groupEndIndex}`;
    const existingGroup = mergedTableGroupHeights.get(groupKey) || [];

    existingGroup.push(measurement);
    mergedTableGroupHeights.set(groupKey, existingGroup);
  });

  const mergedTableGroupHeightByKey = new Map(
    Array.from(mergedTableGroupHeights.entries()).map(([groupKey, groupMeasurements]) => [
      groupKey,
      summarizeMeasurementGroup(groupMeasurements).totalHeight
    ])
  );

  const finalizedMeasurements = enhancedMeasurements.map((measurement) => {
    const mergeMeta = measurement.tableRowMergeMeta;

    if (measurement.kind !== "tableRow" || !mergeMeta?.hasMergedCells) {
      return {
        ...measurement,
        tableRowHasMergedCells: false,
        tableRowGroupStartIndex: measurement.tableRowIndex ?? null,
        tableRowGroupEndIndex: measurement.tableRowIndex ?? null,
        tableRowGroupId: null,
        tableRowGroupHeight: 0
      };
    }

    const groupId = `${measurement.blockPos}:${mergeMeta.groupStartIndex}-${mergeMeta.groupEndIndex}`;

    return {
      ...measurement,
      tableRowHasMergedCells: true,
      tableRowGroupStartIndex: mergeMeta.groupStartIndex,
      tableRowGroupEndIndex: mergeMeta.groupEndIndex,
      tableRowGroupId: groupId,
      tableRowGroupHeight:
        mergedTableGroupHeightByKey.get(groupId) || measurement.offsetHeight
    };
  });
  const inlineTagMeasurements = new Map();

  finalizedMeasurements.forEach((measurement) => {
    (measurement.inlineTagGroups || []).forEach((inlineTagGroup) => {
      if (!inlineTagGroup.inlineTagId) {
        return;
      }

      const existing =
        inlineTagMeasurements.get(inlineTagGroup.inlineTagId) || [];

      existing.push(measurement);
      inlineTagMeasurements.set(inlineTagGroup.inlineTagId, existing);
    });
  });

  const inlineTagGroupMetaById = new Map(
    Array.from(inlineTagMeasurements.entries()).map(
      ([inlineTagId, inlineTagGroupMeasurements]) => {
        const summary = summarizeMeasurementGroup(inlineTagGroupMeasurements);

        return [
          inlineTagId,
          {
            inlineTagGroupHeight: summary.totalHeight,
            inlineTagGroupFirstMarginTop: summary.firstMarginTop,
            inlineTagGroupLastMarginBottom: summary.lastMarginBottom,
            inlineTagGroupMeasurementCount: summary.measurementCount,
            inlineTagGroupTooTall:
              contentAreaHeight > 0 && summary.totalHeight > contentAreaHeight
          }
        ];
      }
    )
  );
  const finalizedMeasurementsWithInlineTagMeta = finalizedMeasurements.map(
    (measurement) => {
      if (!measurement.inlineTagGroups?.length) {
        return measurement;
      }

      return {
        ...measurement,
        inlineTagGroups: measurement.inlineTagGroups.map((inlineTagGroup) => ({
          ...inlineTagGroup,
          ...(inlineTagGroupMetaById.get(inlineTagGroup.inlineTagId) || {})
        }))
      };
    }
  );

  return {
    ir,
    section,
    pageMetrics: effectivePageMetrics,
    contentAreaHeight,
    blocks,
    measurements: finalizedMeasurementsWithInlineTagMeta
  };
};
