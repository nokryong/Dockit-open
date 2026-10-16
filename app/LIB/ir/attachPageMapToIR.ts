import type { IRBlock, IRDocument, IRPaginationMetadata } from "./types";

interface PageMapSegmentLike {
  blockPos?: number | null;
  kind?: string | null;
  tableRowHasMergedCells?: boolean | null;
  tableRowTooTall?: boolean | null;
}

interface PageMapPageLike {
  pageNumber?: number | null;
  blockPositions?: readonly number[];
  startBlockPos?: number | null;
  endBlockPos?: number | null;
  startsWithContinuation?: boolean | null;
  endsWithContinuation?: boolean | null;
  breakReason?: string | null;
  segments?: readonly PageMapSegmentLike[];
}

interface PageMapBlockAssignmentLike {
  blockPos?: number | null;
  blockIndex?: number | null;
  blockType?: string | null;
  startPage?: number | null;
  endPage?: number | null;
  pageCount?: number | null;
  spansPages?: boolean | null;
}

interface PageMapLike {
  version?: number | null;
  pages?: readonly PageMapPageLike[];
  pagesByNumber?: Record<number, PageMapPageLike>;
  blockPageAssignments?: readonly PageMapBlockAssignmentLike[];
}

const uniqueStrings = (items: readonly (string | null | undefined)[]) =>
  Object.freeze(
    Array.from(
      new Set(
        items.filter(
          (item): item is string => typeof item === "string" && item.length > 0
        )
      )
    )
  );

const findPage = (pageMap: PageMapLike, pageNumber: number) =>
  pageMap.pagesByNumber?.[pageNumber] ||
  pageMap.pages?.find((page) => page.pageNumber === pageNumber) ||
  null;

const getAssignmentPages = (
  pageMap: PageMapLike,
  assignment: PageMapBlockAssignmentLike
) => {
  const startPage = assignment.startPage ?? null;
  const endPage = assignment.endPage ?? null;

  if (!Number.isInteger(startPage) || !Number.isInteger(endPage)) {
    return [];
  }

  return Array.from(
    { length: Math.max(0, Number(endPage) - Number(startPage) + 1) },
    (_, index) => findPage(pageMap, Number(startPage) + index)
  ).filter((page): page is PageMapPageLike => Boolean(page));
};

const buildPaginationMetadata = (
  pageMap: PageMapLike,
  assignment: PageMapBlockAssignmentLike
): Readonly<IRPaginationMetadata> => {
  const blockPos = assignment.blockPos ?? null;
  const pages = getAssignmentPages(pageMap, assignment);
  const pageNumbers = Object.freeze(
    pages
      .map((page) => page.pageNumber)
      .filter((pageNumber): pageNumber is number => Number.isInteger(pageNumber))
  );
  const segments = pages.flatMap((page) =>
    (page.segments || []).filter((segment) => segment.blockPos === blockPos)
  );

  return Object.freeze({
    source: "pagination-page-map",
    pageMapVersion: pageMap.version ?? null,
    blockIndex: assignment.blockIndex ?? null,
    blockPos,
    blockType: assignment.blockType ?? null,
    pageNumbers,
    startPage: assignment.startPage ?? null,
    endPage: assignment.endPage ?? null,
    pageCount: assignment.pageCount ?? pageNumbers.length,
    spansPages: Boolean(assignment.spansPages),
    startsWithContinuation: pages.some(
      (page) => page.startsWithContinuation && page.startBlockPos === blockPos
    ),
    endsWithContinuation: pages.some(
      (page) => page.endsWithContinuation && page.endBlockPos === blockPos
    ),
    breakReasons: uniqueStrings(pages.map((page) => page.breakReason)),
    segmentKinds: uniqueStrings(segments.map((segment) => segment.kind)),
    segmentCount: segments.length,
    hasMergedTableRows: segments.some((segment) =>
      Boolean(segment.tableRowHasMergedCells)
    ),
    hasTooTallTableRows: segments.some((segment) =>
      Boolean(segment.tableRowTooTall)
    )
  });
};

const attachMetadataToBlock = (
  block: IRBlock,
  pagination: Readonly<IRPaginationMetadata>
): IRBlock => ({
  ...block,
  pagination
});

/**
 * Adds readonly PageMap-derived metadata to top-level IR blocks.
 *
 * This does not calculate layout and does not mutate the original IR snapshot.
 * Current PageMap assignments are top-level and single-section, so nested list
 * items/table cells remain untouched until PageMap exposes stable nested ids.
 */
export const attachPageMapToIR = (
  irDocument: IRDocument,
  pageMap: PageMapLike | null | undefined
): IRDocument => {
  if (!pageMap?.blockPageAssignments?.length) {
    return irDocument;
  }

  const assignmentsByBlockIndex = new Map(
    pageMap.blockPageAssignments
      .filter((assignment) => Number.isInteger(assignment.blockIndex))
      .map((assignment) => [Number(assignment.blockIndex), assignment])
  );

  if (!assignmentsByBlockIndex.size) {
    return irDocument;
  }

  return {
    ...irDocument,
    sections: irDocument.sections.map((section, sectionIndex) => {
      if (sectionIndex !== 0) {
        return section;
      }

      return {
        ...section,
        blocks: section.blocks.map((block, blockIndex) => {
          const sourceBlockIndex =
            typeof block.sourceBlockIndex === "number" &&
            Number.isSafeInteger(block.sourceBlockIndex) &&
            block.sourceBlockIndex >= 0
              ? block.sourceBlockIndex
              : blockIndex;
          const assignment = assignmentsByBlockIndex.get(sourceBlockIndex);

          if (!assignment) {
            return block;
          }

          return attachMetadataToBlock(
            block,
            buildPaginationMetadata(pageMap, assignment)
          );
        })
      };
    })
  };
};
