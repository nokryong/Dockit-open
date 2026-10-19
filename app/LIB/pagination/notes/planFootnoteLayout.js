import {
  isValidNoteId,
  NOTE_PAIR_LIMIT
} from "../../utils/noteSemanticUtils";

export const FOOTNOTE_LAYOUT_PAGE_LIMIT = 4096;
export const FOOTNOTE_LAYOUT_ITERATION_LIMIT = 64;
export const FOOTNOTE_FRAGMENT_HEIGHT_TOLERANCE = 0.000001;
export const FOOTNOTE_CONTINUATION_LABELS = Object.freeze({
  fromPrevious: "각주 계속",
  toNext: "다음 페이지에 계속"
});

export class FootnoteLayoutError extends Error {
  constructor(code, details = {}) {
    super(`Footnote layout failed: ${code}`);
    this.name = "FootnoteLayoutError";
    this.code = code;
    this.details = details;
  }
}

const fail = (code, details) => {
  throw new FootnoteLayoutError(code, details);
};

const isPositiveFinite = (value) => Number.isFinite(value) && value > 0;
const isNonNegativeFinite = (value) => Number.isFinite(value) && value >= 0;
const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const fitsHeightWithinTolerance = (height, capacity) =>
  height <= capacity ||
  height - capacity <= FOOTNOTE_FRAGMENT_HEIGHT_TOLERANCE;
const clampHeightToCapacityWithinTolerance = (height, capacity) =>
  height > capacity &&
  height - capacity <= FOOTNOTE_FRAGMENT_HEIGHT_TOLERANCE
    ? capacity
    : height;
const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);
const isPlainRecord = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const normalizeFragments = (body, noteId, usableFootnoteBodyHeight) => {
  if (!hasOwn(body, "fragments")) return null;
  if (!Array.isArray(body.fragments) || body.fragments.length === 0) {
    fail("INVALID_FOOTNOTE_FRAGMENTS", { noteId });
  }

  const fragments = body.fragments.map((fragment, expectedIndex) => {
    if (!isPlainRecord(fragment)) {
      fail("INVALID_FOOTNOTE_FRAGMENT", { noteId, fragmentIndex: expectedIndex });
    }
    if (!isPositiveInteger(fragment.fragmentIndex) && fragment.fragmentIndex !== 0) {
      fail("INVALID_FOOTNOTE_FRAGMENT_INDEX", { noteId, fragmentIndex: fragment.fragmentIndex ?? null });
    }
    if (fragment.fragmentIndex !== expectedIndex) {
      fail("INVALID_FOOTNOTE_FRAGMENT_INDEX", { noteId, fragmentIndex: fragment.fragmentIndex });
    }
    if (!isPositiveFinite(fragment.measuredHeight)) {
      fail("INVALID_FOOTNOTE_FRAGMENT_HEIGHT", { noteId, fragmentIndex: expectedIndex });
    }
    if (fragment.measuredHeight > usableFootnoteBodyHeight) {
      fail("FOOTNOTE_FRAGMENT_TOO_TALL", { noteId, fragmentIndex: expectedIndex });
    }
    return Object.freeze({
      fragmentIndex: fragment.fragmentIndex,
      measuredHeight: fragment.measuredHeight
    });
  });
  const measuredHeight = fragments.reduce(
    (total, fragment) => total + fragment.measuredHeight,
    0
  );
  if (Math.abs(body.measuredHeight - measuredHeight) > FOOTNOTE_FRAGMENT_HEIGHT_TOLERANCE) {
    fail("FOOTNOTE_FRAGMENT_HEIGHT_MISMATCH", { noteId });
  }
  return Object.freeze(fragments);
};

const validateInput = ({
  pageCapacity,
  maxFootnoteAreaHeight = pageCapacity,
  noteAreaOverhead = 0,
  maxPages = FOOTNOTE_LAYOUT_PAGE_LIMIT,
  contentHeightsByPage = [],
  footnotes = []
}) => {
  if (!isPositiveFinite(pageCapacity)) fail("INVALID_PAGE_CAPACITY");
  if (
    !isPositiveFinite(maxFootnoteAreaHeight) ||
    maxFootnoteAreaHeight > pageCapacity
  ) {
    fail("INVALID_FOOTNOTE_AREA_CAPACITY");
  }
  if (
    !isNonNegativeFinite(noteAreaOverhead) ||
    noteAreaOverhead >= maxFootnoteAreaHeight
  ) {
    fail("INVALID_FOOTNOTE_AREA_OVERHEAD");
  }
  if (
    !isPositiveInteger(maxPages) ||
    maxPages > FOOTNOTE_LAYOUT_PAGE_LIMIT
  ) {
    fail("INVALID_PAGE_LIMIT");
  }
  if (!Array.isArray(contentHeightsByPage)) fail("INVALID_CONTENT_CAPACITIES");
  if (!Array.isArray(footnotes)) fail("INVALID_FOOTNOTES");
  if (footnotes.length > NOTE_PAIR_LIMIT) fail("FOOTNOTE_PAIR_LIMIT_EXCEEDED");

  const contentByPage = new Map();
  contentHeightsByPage.forEach((entry) => {
    if (
      !entry ||
      !isPositiveInteger(entry.pageNumber) ||
      entry.pageNumber > maxPages ||
      !isNonNegativeFinite(entry.height)
    ) {
      fail("INVALID_CONTENT_CAPACITY", { pageNumber: entry?.pageNumber ?? null });
    }
    if (entry.height > pageCapacity) {
      fail("INVALID_CONTENT_HEIGHT", { pageNumber: entry.pageNumber });
    }
    if (contentByPage.has(entry.pageNumber)) {
      fail("DUPLICATE_CONTENT_PAGE", { pageNumber: entry.pageNumber });
    }
    contentByPage.set(entry.pageNumber, entry.height);
  });

  const references = new Set();
  const bodies = new Set();
  const normalized = footnotes.map((entry) => {
    const reference = entry?.reference;
    const body = entry?.body;
    const noteId = reference?.noteId;
    if (!isValidNoteId(noteId) || !isValidNoteId(body?.noteId) || noteId !== body.noteId) {
      fail("INVALID_FOOTNOTE_ID", { noteId: noteId ?? body?.noteId ?? null });
    }
    if (reference.kind !== "footnote" || body.kind !== "footnote") {
      fail("INVALID_FOOTNOTE_KIND", { noteId });
    }
    if (
      !isPositiveInteger(reference.pageNumber) ||
      reference.pageNumber > maxPages ||
      !isPositiveInteger(reference.order)
    ) {
      fail("INVALID_FOOTNOTE_REFERENCE", { noteId });
    }
    if (!isPositiveFinite(body.measuredHeight)) {
      fail("INVALID_FOOTNOTE_BODY_HEIGHT", { noteId });
    }
    const fragments = normalizeFragments(
      body,
      noteId,
      maxFootnoteAreaHeight - noteAreaOverhead
    );
    if (references.has(noteId)) fail("DUPLICATE_FOOTNOTE_REFERENCE", { noteId });
    if (bodies.has(body.noteId)) fail("DUPLICATE_FOOTNOTE_BODY", { noteId: body.noteId });
    references.add(noteId);
    bodies.add(body.noteId);
    return {
      noteId,
      referencePage: reference.pageNumber,
      referenceOrder: reference.order,
      measuredHeight: body.measuredHeight,
      ...(fragments ? { fragments } : {})
    };
  });

  const referenceOrderKeys = new Set();
  normalized.forEach((note) => {
    const key = `${note.referencePage}:${note.referenceOrder}`;
    if (referenceOrderKeys.has(key)) {
      fail("DUPLICATE_FOOTNOTE_REFERENCE_ORDER", { pageNumber: note.referencePage, order: note.referenceOrder });
    }
    referenceOrderKeys.add(key);
  });

  return {
    pageCapacity,
    maxFootnoteAreaHeight,
    noteAreaOverhead,
    maxPages,
    contentByPage,
    footnotes: normalized
  };
};

const createPage = (
  pageNumber,
  pageCapacity,
  maxFootnoteAreaHeight,
  noteAreaOverhead,
  contentByPage
) => {
  const contentHeightMeasured = contentByPage.has(pageNumber);
  const contentHeight = contentHeightMeasured
    ? contentByPage.get(pageNumber)
    : null;
  return {
    pageNumber,
    contentHeight,
    contentHeightMeasured,
    noteAreaOverhead,
    bodyReservedHeight: 0,
    reservedHeight: 0,
    mainFlowCapacity: pageCapacity,
    mainFlowOverflowHeight: null,
    requiresMeasurement: false,
    requiresReflow: null,
    availableFootnoteHeight: maxFootnoteAreaHeight - noteAreaOverhead,
    segments: []
  };
};

/**
 * Pure N4a/N4b1b-A contract. `contentHeightsByPage` is the caller's measured
 * main-flow height before footnote reservation. Optional body fragments are
 * allocated only at validated whole-fragment boundaries. The caller reruns its
 * page map when a returned `reservedHeight` moves a reference; this module
 * never touches DOM, canonical HTML, or pagination state.
 */
export const planFootnoteLayout = (input) => {
  const {
    pageCapacity,
    maxFootnoteAreaHeight,
    noteAreaOverhead,
    maxPages,
    contentByPage,
    footnotes
  } = validateInput(input || {});
  if (footnotes.length === 0) {
    return Object.freeze({
      pageCapacity,
      maxFootnoteAreaHeight,
      noteAreaOverhead,
      maxPages,
      pages: Object.freeze([]),
      segments: Object.freeze([])
    });
  }

  const byReferencePage = new Map();
  footnotes
    .sort((left, right) => left.referencePage - right.referencePage || left.referenceOrder - right.referenceOrder)
    .forEach((note) => {
      const pageNotes = byReferencePage.get(note.referencePage) || [];
      pageNotes.push(note);
      byReferencePage.set(note.referencePage, pageNotes);
    });

  const pages = new Map();
  const getPage = (pageNumber) => {
    if (!pages.has(pageNumber)) {
      pages.set(
        pageNumber,
        createPage(
          pageNumber,
          pageCapacity,
          maxFootnoteAreaHeight,
          noteAreaOverhead,
          contentByPage
        )
      );
    }
    return pages.get(pageNumber);
  };
  const segments = [];
  let pending = [];
  let pageNumber = 1;
  const finalReferencePage = Math.max(...byReferencePage.keys());

  while (pageNumber <= finalReferencePage || pending.length > 0) {
    if (pageNumber > maxPages) {
      fail("FOOTNOTE_PAGE_LIMIT_EXCEEDED", { maxPages });
    }
    const page = getPage(pageNumber);
    const newlyReferenced = byReferencePage.get(pageNumber) || [];
    pending = [...pending, ...newlyReferenced.map((note) => ({
      ...note,
      remainingHeight: note.measuredHeight,
      nextFragmentOffset: 0,
      segmentIndex: 0
    }))];
    let remainingCapacity = page.availableFootnoteHeight;
    while (pending.length > 0 && remainingCapacity > 0) {
      const current = pending[0];
      const isFragmented = Array.isArray(current.fragments);
      let height;
      let fragmentStartIndex;
      let fragmentEndIndex;
      let fragmentCount;
      if (isFragmented) {
        const startOffset = current.nextFragmentOffset;
        let endOffset = startOffset;
        height = 0;
        while (
          endOffset < current.fragments.length &&
          fitsHeightWithinTolerance(
            height + current.fragments[endOffset].measuredHeight,
            remainingCapacity
          )
        ) {
          height += current.fragments[endOffset].measuredHeight;
          endOffset += 1;
        }
        if (endOffset === startOffset) break;
        height = clampHeightToCapacityWithinTolerance(height, remainingCapacity);
        fragmentStartIndex = current.fragments[startOffset].fragmentIndex;
        fragmentEndIndex = current.fragments[endOffset - 1].fragmentIndex + 1;
        fragmentCount = endOffset - startOffset;
        current.nextFragmentOffset = endOffset;
        current.remainingHeight -= height;
      } else {
        height = Math.min(current.remainingHeight, remainingCapacity);
        current.remainingHeight -= height;
      }
      const isContinuation = current.segmentIndex > 0;
      const continuesToNextPage = isFragmented
        ? current.nextFragmentOffset < current.fragments.length
        : current.remainingHeight > 0;
      const segment = Object.freeze({
        noteId: current.noteId,
        pageNumber,
        referencePage: current.referencePage,
        referenceOrder: current.referenceOrder,
        measuredHeight: height,
        segmentIndex: current.segmentIndex,
        continuation: isContinuation ? "continued" : continuesToNextPage ? "continues" : "none",
        continuationFromPreviousLabel: isContinuation
          ? FOOTNOTE_CONTINUATION_LABELS.fromPrevious
          : null,
        continuationToNextLabel: continuesToNextPage
          ? FOOTNOTE_CONTINUATION_LABELS.toNext
          : null,
        isContinuation,
        continuesToNextPage,
        ...(isFragmented ? {
          fragmentStartIndex,
          fragmentEndIndex,
          fragmentCount
        } : {})
      });
      page.segments.push(segment);
      segments.push(segment);
      page.bodyReservedHeight += height;
      remainingCapacity -= height;
      current.segmentIndex += 1;
      if (isFragmented ? current.nextFragmentOffset === current.fragments.length : current.remainingHeight === 0) {
        pending.shift();
      }
    }
    page.availableFootnoteHeight = remainingCapacity;
    page.reservedHeight = page.segments.length
      ? page.noteAreaOverhead + page.bodyReservedHeight
      : 0;
    page.mainFlowCapacity = pageCapacity - page.reservedHeight;
    page.requiresMeasurement =
      page.segments.length > 0 && !page.contentHeightMeasured;
    if (page.requiresMeasurement) {
      page.mainFlowOverflowHeight = null;
      page.requiresReflow = null;
    } else {
      page.mainFlowOverflowHeight = Math.max(
        0,
        (page.contentHeight ?? 0) - page.mainFlowCapacity
      );
      page.requiresReflow = page.mainFlowOverflowHeight > 0;
    }
    pageNumber += 1;
  }

  const result = {
    pageCapacity,
    maxFootnoteAreaHeight,
    noteAreaOverhead,
    maxPages,
    pages: Object.freeze(
      [...pages.values()].sort((left, right) => left.pageNumber - right.pageNumber).map((page) => Object.freeze({
        ...page,
        segments: Object.freeze([...page.segments])
      }))
    ),
    segments: Object.freeze([...segments])
  };
  return Object.freeze(result);
};

export const createFootnoteLayoutFingerprint = (plan) => JSON.stringify({
  pageCapacity: plan?.pageCapacity,
  maxFootnoteAreaHeight: plan?.maxFootnoteAreaHeight,
  noteAreaOverhead: plan?.noteAreaOverhead,
  maxPages: plan?.maxPages,
  pages: (plan?.pages || []).map((page) => ({
    pageNumber: page.pageNumber,
    contentHeight: page.contentHeight,
    contentHeightMeasured: page.contentHeightMeasured,
    reservedHeight: page.reservedHeight,
    mainFlowCapacity: page.mainFlowCapacity,
    mainFlowOverflowHeight: page.mainFlowOverflowHeight,
    requiresMeasurement: page.requiresMeasurement,
    requiresReflow: page.requiresReflow,
    segments: page.segments.map((segment) => [
      segment.noteId,
      segment.referencePage,
      segment.referenceOrder,
      segment.measuredHeight,
      segment.segmentIndex,
      segment.continuation,
      segment.continuationFromPreviousLabel,
      segment.continuationToNextLabel,
      segment.isContinuation,
      segment.continuesToNextPage,
      ...(segment.fragmentCount === undefined ? [] : [
        segment.fragmentStartIndex,
        segment.fragmentEndIndex,
        segment.fragmentCount
      ])
    ])
  }))
});

const layoutInputState = (input, plan) => ({
  referencePages: input.footnotes
    .map((footnote) => [
      footnote.reference.noteId,
      footnote.reference.pageNumber
    ])
    .sort(([left], [right]) => left.localeCompare(right)),
  contentHeightsByPage: (input.contentHeightsByPage || [])
    .map((entry) => [entry.pageNumber, entry.height])
    .sort(([left], [right]) => left - right),
  fragmentSegments: (plan?.segments || [])
    .filter((segment) => segment.fragmentCount !== undefined)
    .map((segment) => [
      segment.noteId,
      segment.pageNumber,
      segment.segmentIndex,
      segment.fragmentStartIndex,
      segment.fragmentEndIndex,
      segment.fragmentCount,
      segment.measuredHeight
    ])
});

const updateReferencePages = (input, referencePages) => ({
  ...input,
  footnotes: input.footnotes.map((footnote) => ({
    ...footnote,
    reference: {
      ...footnote.reference,
      pageNumber: hasOwn(referencePages, footnote.reference.noteId)
        ? referencePages[footnote.reference.noteId]
        : footnote.reference.pageNumber
    }
  }))
});

const updateLayoutInput = (input, resolution) => ({
  ...updateReferencePages(input, resolution.referencePages),
  contentHeightsByPage: resolution.contentHeightsByPage.map((entry) => ({
    ...entry
  }))
});

const cloneFootnoteLayoutInput = (input) => ({
  ...input,
  contentHeightsByPage: (input?.contentHeightsByPage || []).map((entry) => ({
    ...entry
  })),
  footnotes: (input?.footnotes || []).map((footnote) => ({
    ...footnote,
    reference: { ...footnote?.reference },
    body: { ...footnote?.body }
  }))
});

/** Bounded caller-driven rerun helper. Non-stable results intentionally omit a plan. */
export const convergeFootnoteLayout = ({
  input,
  resolveLayout,
  maxIterations = 8
}) => {
  if (
    !isPositiveInteger(maxIterations) ||
    maxIterations > FOOTNOTE_LAYOUT_ITERATION_LIMIT
  ) {
    fail("INVALID_MAX_ITERATIONS");
  }
  if (typeof resolveLayout !== "function") fail("INVALID_LAYOUT_RESOLVER");
  planFootnoteLayout(input);
  let currentInput = cloneFootnoteLayoutInput(input);
  const seenStates = new Map();

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const plan = planFootnoteLayout(currentInput);
    const state = JSON.stringify(layoutInputState(currentInput, plan));
    seenStates.set(state, iteration);
    const proposed = resolveLayout(Object.freeze({ plan, iteration }));
    if (!proposed || typeof proposed !== "object" || Array.isArray(proposed)) {
      fail("INVALID_LAYOUT_RESOLUTION");
    }
    const referencePages = proposed.referencePages ?? {};
    const contentHeightsByPage = proposed.contentHeightsByPage ??
      currentInput.contentHeightsByPage ?? [];
    if (
      !referencePages ||
      typeof referencePages !== "object" ||
      Array.isArray(referencePages) ||
      !Array.isArray(contentHeightsByPage)
    ) {
      fail("INVALID_LAYOUT_RESOLUTION");
    }
    const currentNoteIds = new Set(
      currentInput.footnotes.map((footnote) => footnote.reference.noteId)
    );
    Object.entries(referencePages).forEach(([noteId, pageNumber]) => {
      if (
        !currentNoteIds.has(noteId) ||
        !isValidNoteId(noteId) ||
        !isPositiveInteger(pageNumber) ||
        pageNumber > (currentInput.maxPages || FOOTNOTE_LAYOUT_PAGE_LIMIT)
      ) {
        fail("INVALID_REFERENCE_PAGE_RESOLUTION", { noteId });
      }
    });
    const nextInput = updateLayoutInput(currentInput, {
      referencePages,
      contentHeightsByPage
    });
    const nextPlan = planFootnoteLayout(nextInput);
    const nextState = JSON.stringify(layoutInputState(nextInput, nextPlan));
    if (nextState === state) {
      const missingPageNumbers = plan.pages
        .filter((page) => page.requiresMeasurement)
        .map((page) => page.pageNumber);
      if (missingPageNumbers.length > 0) {
        return Object.freeze({
          status: "unresolved",
          code: "FOOTNOTE_PAGE_MEASUREMENT_REQUIRED",
          iterations: iteration,
          missingPageNumbers: Object.freeze(missingPageNumbers)
        });
      }
      if (plan.pages.some((page) => page.requiresReflow)) {
        return Object.freeze({
          status: "unresolved",
          code: "FOOTNOTE_REFLOW_UNRESOLVED",
          iterations: iteration
        });
      }
      return Object.freeze({ status: "stable", iterations: iteration, plan, fingerprint: createFootnoteLayoutFingerprint(plan) });
    }
    if (seenStates.has(nextState)) {
      return Object.freeze({ status: "cycle", code: "REFERENCE_PAGE_CYCLE", iterations: iteration, cycleLength: iteration - seenStates.get(nextState) + 1 });
    }
    currentInput = nextInput;
  }
  return Object.freeze({ status: "maxIterations", code: "REFERENCE_PAGE_MAX_ITERATIONS", iterations: maxIterations });
};
