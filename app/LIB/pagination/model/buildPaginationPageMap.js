export const PAGE_MAP_VERSION = 1;

/**
 * @typedef {Readonly<Record<string, unknown>>} PageMapSegment
 *
 * @typedef {Readonly<{
 *   pageNumber: number,
 *   startPos: number | null,
 *   endPos: number | null,
 *   startBlockPos: number | null,
 *   endBlockPos: number | null,
 *   segments: readonly PageMapSegment[],
 *   breakReason: string | null
 * }>} PageMapPage
 *
 * @typedef {Readonly<{
 *   version: 1,
 *   totalPages: number,
 *   pageCount: number,
 *   pages: readonly PageMapPage[],
 *   pagesByNumber: Readonly<Record<number, PageMapPage>>,
 *   pageBreaks: readonly Readonly<Record<string, unknown>>[],
 *   blockPageAssignments: readonly Readonly<Record<string, unknown>>[]
 * }>} PageMap
 */

const freezeArray = (items = []) => Object.freeze(items);

const clonePageSegment = (segment = {}) =>
  Object.freeze({
    ...segment
  });

const cloneFootnotePage = (page = {}) =>
  Object.freeze({
    ...page,
    segments: freezeArray((page.segments || []).map(clonePageSegment))
  });

const cloneFootnoteLayout = (layout = {}) =>
  Object.freeze({
    ...layout,
    pages: freezeArray((layout.pages || []).map(cloneFootnotePage)),
    segments: freezeArray((layout.segments || []).map(clonePageSegment))
  });

const clonePage = (page = {}, fallbackPageNumber = 1) => {
  const segments = freezeArray((page.segments || []).map(clonePageSegment));
  const blockPositions = freezeArray([...(page.blockPositions || [])]);

  return Object.freeze({
    pageNumber: page.pageNumber ?? fallbackPageNumber,
    startPos: page.startPos ?? null,
    endPos: page.endPos ?? null,
    startMeasurementIndex: page.startMeasurementIndex ?? null,
    endMeasurementIndex: page.endMeasurementIndex ?? null,
    startBlockPos: page.startBlockPos ?? null,
    endBlockPos: page.endBlockPos ?? null,
    startBlockType: page.startBlockType ?? null,
    endBlockType: page.endBlockType ?? null,
    startKind: page.startKind ?? null,
    endKind: page.endKind ?? null,
    measurementCount: page.measurementCount ?? 0,
    blockPositions,
    blockCount: page.blockCount ?? blockPositions.length,
    occupiedHeight: page.occupiedHeight ?? 0,
    remainingHeight: page.remainingHeight ?? 0,
    breakReason: page.breakReason ?? null,
    breakPos: page.breakPos ?? null,
    startsWithContinuation: Boolean(page.startsWithContinuation),
    endsWithContinuation: Boolean(page.endsWithContinuation),
    segments,
    ...(Object.prototype.hasOwnProperty.call(page, "mainFlowCapacity")
      ? { mainFlowCapacity: page.mainFlowCapacity }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(page, "reservedHeight")
      ? { reservedHeight: page.reservedHeight }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(page, "footnote")
      ? { footnote: cloneFootnotePage(page.footnote) }
      : {})
  });
};

const clonePageBreak = (pageBreak = {}) =>
  Object.freeze({
    ...pageBreak
  });

const cloneBlockPageAssignment = (assignment = {}) =>
  Object.freeze({
    ...assignment
  });

const buildPagesByNumber = (pages) =>
  Object.freeze(
    pages.reduce((pagesByNumber, page) => {
      pagesByNumber[page.pageNumber] = page;
      return pagesByNumber;
    }, {})
  );

/**
 * @param {object} plan
 * @returns {PageMap}
 */
export const buildPaginationPageMap = (plan = {}) => {
  const totalPages = Math.max(plan.totalPages || plan.pages?.length || 1, 1);
  const pages = freezeArray(
    Array.from({ length: totalPages }, (_, pageIndex) =>
      clonePage(plan.pages?.[pageIndex] || {}, pageIndex + 1)
    )
  );
  const pageBreaks = freezeArray((plan.pageBreaks || []).map(clonePageBreak));
  const blockPageAssignments = freezeArray(
    (plan.blockPageAssignments || []).map(cloneBlockPageAssignment)
  );

  return Object.freeze({
    version: PAGE_MAP_VERSION,
    totalPages,
    pageCount: pages.length,
    pages,
    pagesByNumber: buildPagesByNumber(pages),
    pageBreaks,
    blockPageAssignments,
    ...(Object.prototype.hasOwnProperty.call(plan, "mainFlowTotalPages")
      ? { mainFlowTotalPages: plan.mainFlowTotalPages }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(plan, "footnoteLayout")
      ? { footnoteLayout: cloneFootnoteLayout(plan.footnoteLayout) }
      : {})
  });
};

export const getPageMapPage = (pageMap, pageNumber) =>
  pageMap?.pagesByNumber?.[pageNumber] || null;
