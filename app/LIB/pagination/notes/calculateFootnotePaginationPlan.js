import { calculatePaginationPlan } from "../layout/calculatePaginationPlan";
import { buildPaginationPageMap } from "../model/buildPaginationPageMap";
import {
  FootnoteLayoutError,
  convergeFootnoteLayout,
  planFootnoteLayout
} from "./planFootnoteLayout";

export class FootnotePaginationIntegrationError extends Error {
  constructor(code, details = {}) {
    super(`Footnote pagination integration failed: ${code}`);
    this.name = "FootnotePaginationIntegrationError";
    this.code = code;
    this.details = details;
  }
}

const fail = (code, details) => {
  throw new FootnotePaginationIntegrationError(code, details);
};

const freezeResult = (result) => Object.freeze(result);

const resolveReferencePage = (plan, reference) => {
  const pages = plan.pages || [];
  const segmentPos = reference?.segmentPos;
  const rawPosition = reference?.pos;
  const blockPos = reference?.blockPos;
  const explicitSegmentMatches = Number.isFinite(segmentPos)
    ? pages.filter((page) =>
      page.segments.some((segment) => segment.pos === segmentPos)
    )
    : [];

  if (explicitSegmentMatches.length === 1) {
    return explicitSegmentMatches[0].pageNumber;
  }
  if (explicitSegmentMatches.length > 1) {
    fail("AMBIGUOUS_FOOTNOTE_REFERENCE_PAGE", {
      noteId: reference?.noteId ?? null,
      segmentPos
    });
  }
  if (Number.isFinite(segmentPos)) {
    fail("UNRESOLVED_FOOTNOTE_REFERENCE_PAGE", {
      noteId: reference?.noteId ?? null,
      segmentPos
    });
  }

  if (Number.isFinite(blockPos) && Number.isFinite(rawPosition)) {
    const candidates = pages.flatMap((page) =>
      page.segments
        .filter((segment) =>
          segment.blockPos === blockPos && segment.pos <= rawPosition
        )
        .map((segment) => ({ pageNumber: page.pageNumber, pos: segment.pos }))
    );
    const greatestPosition = candidates.reduce(
      (greatest, candidate) => Math.max(greatest, candidate.pos),
      Number.NEGATIVE_INFINITY
    );
    const greatestCandidates = candidates.filter(
      (candidate) => candidate.pos === greatestPosition
    );
    const candidatePages = new Set(
      greatestCandidates.map((candidate) => candidate.pageNumber)
    );

    if (candidatePages.size === 1) return [...candidatePages][0];
    if (candidatePages.size > 1) {
      fail("AMBIGUOUS_FOOTNOTE_REFERENCE_PAGE", {
        noteId: reference?.noteId ?? null,
        blockPos,
        position: rawPosition
      });
    }
    fail("UNRESOLVED_FOOTNOTE_REFERENCE_PAGE", {
      noteId: reference?.noteId ?? null,
      blockPos,
      position: rawPosition
    });
  }

  const positionMatches = Number.isFinite(rawPosition)
    ? pages.filter((page) =>
      page.segments.some((segment) => segment.pos === rawPosition)
    )
    : [];
  if (positionMatches.length === 1) return positionMatches[0].pageNumber;
  if (positionMatches.length > 1) {
    fail("AMBIGUOUS_FOOTNOTE_REFERENCE_PAGE", {
      noteId: reference?.noteId ?? null,
      position: rawPosition
    });
  }

  const blockMatches = Number.isFinite(blockPos)
    ? pages.filter((page) => page.blockPositions.includes(blockPos))
    : [];
  if (blockMatches.length === 1) return blockMatches[0].pageNumber;
  if (blockMatches.length > 1) {
    fail("AMBIGUOUS_FOOTNOTE_REFERENCE_PAGE", {
      noteId: reference?.noteId ?? null,
      blockPos
    });
  }

  fail("UNRESOLVED_FOOTNOTE_REFERENCE_PAGE", {
    noteId: reference?.noteId ?? null,
    position: rawPosition,
    segmentPos,
    blockPos
  });
};

const resolveFootnoteReferencePages = (plan, footnotes) =>
  footnotes.reduce((referencePages, footnote) => {
    const reference = footnote?.reference;
    const noteId = reference?.noteId;
    if (!reference || !noteId || footnote?.body?.noteId !== noteId) {
      fail("INVALID_FOOTNOTE_PAIR", { noteId: noteId ?? null });
    }
    referencePages[noteId] = resolveReferencePage(plan, reference);
    return referencePages;
  }, {});

const withResolvedReferencePages = (footnotes, referencePages) =>
  footnotes.map((footnote) => ({
    ...footnote,
    reference: {
      ...footnote.reference,
      pageNumber: referencePages[footnote.reference.noteId]
    },
    body: { ...footnote.body }
  }));

const toMeasuredContentHeights = (plan, supplied = []) => {
  const byPage = new Map();
  if (!Array.isArray(supplied)) fail("INVALID_CONTENT_CAPACITIES");
  supplied.forEach((entry) => {
    const pageNumber = entry?.pageNumber;
    if (byPage.has(pageNumber)) {
      fail("DUPLICATE_CONTENT_PAGE", { pageNumber: pageNumber ?? null });
    }
    byPage.set(pageNumber, { ...entry });
  });
  (plan.pages || []).forEach((page) => {
    if (page.measurementCount > 0) {
      byPage.set(page.pageNumber, {
        pageNumber: page.pageNumber,
        height: page.occupiedHeight
      });
    }
  });
  return [...byPage.values()].sort((left, right) =>
    left.pageNumber - right.pageNumber
  );
};

const toPageMainFlowByPage = (footnoteLayout) =>
  footnoteLayout.pages.map((page) => ({
    pageNumber: page.pageNumber,
    mainFlowCapacity: page.mainFlowCapacity,
    reservedHeight: page.reservedHeight
  }));

const createFootnoteOnlyPage = (footnote) => ({
  pageNumber: footnote.pageNumber,
  startPos: null,
  endPos: null,
  startMeasurementIndex: null,
  endMeasurementIndex: null,
  startBlockPos: null,
  endBlockPos: null,
  startBlockType: null,
  endBlockType: null,
  startKind: null,
  endKind: null,
  measurementCount: 0,
  segments: [],
  blockPositions: [],
  blockCount: 0,
  occupiedHeight: 0,
  remainingHeight: footnote.mainFlowCapacity,
  breakReason: null,
  breakPos: null,
  startsWithContinuation: false,
  endsWithContinuation: false,
  mainFlowCapacity: footnote.mainFlowCapacity,
  reservedHeight: footnote.reservedHeight,
  footnote
});

const attachFootnoteLayout = (paginationPlan, footnoteLayout) => {
  const footnotePages = new Map(
    footnoteLayout.pages.map((page) => [page.pageNumber, page])
  );
  const mainFlowTotalPages = paginationPlan.totalPages;
  const pages = paginationPlan.pages.map((page) => {
    const footnote = footnotePages.get(page.pageNumber);
    return footnote ? { ...page, footnote } : page;
  });
  const footnoteOnlyPages = footnoteLayout.pages.filter(
    (footnote) => footnote.pageNumber > mainFlowTotalPages
  );
  const combinedPages = [
    ...pages,
    ...footnoteOnlyPages.map(createFootnoteOnlyPage)
  ];
  const hasFootnoteOnlyPages = footnoteOnlyPages.length > 0;
  const plan = {
    ...paginationPlan,
    totalPages: combinedPages.length,
    pages: combinedPages,
    footnoteLayout,
    ...(hasFootnoteOnlyPages ? { mainFlowTotalPages } : {})
  };

  return {
    ...plan,
    pageMap: buildPaginationPageMap(plan)
  };
};

const invalidResult = (error) =>
  freezeResult({
    status: "invalid",
    code: error?.code || "INVALID_FOOTNOTE_PAGINATION_INPUT",
    details: Object.freeze({ ...(error?.details || {}) })
  });

/**
 * N4b1a PageMap 순수 연결 함수
 * (의미 단위 주석 측정값과 블록·세그먼트 위치만 받고 DOM·에디터·렌더러·인쇄 상태는 읽지 않음, 불안정한 결과에는 페이지 계획을 넣지 않음)
 */
export const calculateFootnotePaginationPlan = ({
  paginationInput,
  footnotes = [],
  contentHeightsByPage = [],
  pageCapacity = paginationInput?.contentAreaHeight,
  maxFootnoteAreaHeight,
  noteAreaOverhead,
  maxPages,
  maxIterations
} = {}) => {
  try {
    if (!paginationInput || !Array.isArray(footnotes)) {
      fail("INVALID_FOOTNOTE_PAGINATION_INPUT");
    }

    const initialPaginationPlan = calculatePaginationPlan(paginationInput);
    const initialReferencePages = resolveFootnoteReferencePages(
      initialPaginationPlan,
      footnotes
    );
    const footnoteInput = {
      pageCapacity,
      ...(maxFootnoteAreaHeight === undefined ? {} : { maxFootnoteAreaHeight }),
      ...(noteAreaOverhead === undefined ? {} : { noteAreaOverhead }),
      ...(maxPages === undefined ? {} : { maxPages }),
      contentHeightsByPage: toMeasuredContentHeights(
        initialPaginationPlan,
        contentHeightsByPage
      ),
      footnotes: withResolvedReferencePages(footnotes, initialReferencePages)
    };

    // 주석이 없는 경우는 일반 PageMap 계획과 똑같이 처리
    if (footnotes.length === 0) {
      planFootnoteLayout(footnoteInput);
      return freezeResult({
        status: "stable",
        iterations: 0,
        plan: initialPaginationPlan
      });
    }

    let stablePaginationPlan = null;
    const convergence = convergeFootnoteLayout({
      input: footnoteInput,
      ...(maxIterations === undefined ? {} : { maxIterations }),
      resolveLayout: ({ plan }) => {
        const paginationPlan = calculatePaginationPlan({
          ...paginationInput,
          pageMainFlowByPage: toPageMainFlowByPage(plan)
        });
        stablePaginationPlan = paginationPlan;
        return {
          referencePages: resolveFootnoteReferencePages(
            paginationPlan,
            footnotes
          ),
          contentHeightsByPage: toMeasuredContentHeights(
            paginationPlan,
            contentHeightsByPage
          )
        };
      }
    });

    if (convergence.status !== "stable") {
      return freezeResult({
        status: convergence.status,
        code: convergence.code,
        ...(convergence.iterations === undefined
          ? {}
          : { iterations: convergence.iterations }),
        ...(convergence.missingPageNumbers === undefined
          ? {}
          : { missingPageNumbers: convergence.missingPageNumbers }),
        ...(convergence.cycleLength === undefined
          ? {}
          : { cycleLength: convergence.cycleLength })
      });
    }

    return freezeResult({
      status: "stable",
      iterations: convergence.iterations,
      plan: attachFootnoteLayout(stablePaginationPlan, convergence.plan),
      footnoteLayout: convergence.plan
    });
  } catch (error) {
    if (
      error instanceof FootnoteLayoutError ||
      error instanceof FootnotePaginationIntegrationError ||
      error instanceof TypeError
    ) {
      return invalidResult(error);
    }
    throw error;
  }
};

export const integrateFootnotePaginationPlan = calculateFootnotePaginationPlan;
