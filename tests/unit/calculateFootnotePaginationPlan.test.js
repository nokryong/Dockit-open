import { describe, expect, it } from "vitest";
import { calculatePaginationPlan } from "../../app/LIB/pagination/layout/calculatePaginationPlan";
import {
  calculateFootnotePaginationPlan,
  FootnotePaginationIntegrationError
} from "../../app/LIB/pagination/notes/calculateFootnotePaginationPlan";

const measurement = (pos, height, blockPos = pos) => ({
  pos,
  blockPos,
  blockIndex: pos - 1,
  blockType: "paragraph",
  kind: "textLine",
  measurementIndex: pos - 1,
  offsetHeight: height,
  marginTop: 0,
  marginBottom: 0,
  isBlockStart: true
});

const paginationInput = (measurements, extra = {}) => ({
  measurements,
  contentAreaHeight: 100,
  pageMetrics: { width: 100, padding: { left: 0, right: 0 } },
  ...extra
});

const note = (noteId, pos, order, measuredHeight) => ({
  reference: { noteId, kind: "footnote", pos, order },
  body: { noteId, kind: "footnote", measuredHeight }
});
const fragmentNote = (noteId, pos, order, fragments) => ({
  reference: { noteId, kind: "footnote", pos, order },
  body: {
    noteId,
    kind: "footnote",
    measuredHeight: fragments.reduce((total, fragment) => total + fragment.measuredHeight, 0),
    fragments
  }
});

describe("N4b1b pure fragment-aware footnote PageMap integration", () => {
  it("keeps the no-capacity calculate plan's legacy page and PageMap shapes", () => {
    const plan = calculatePaginationPlan(paginationInput([
      measurement(1, 40), measurement(2, 40)
    ]));
    const absentOptionalPlan = calculatePaginationPlan({
      ...paginationInput([measurement(1, 40), measurement(2, 40)]),
      pageMainFlowByPage: undefined
    });

    expect(Object.keys(plan.pages[0]).sort()).toEqual([
      "blockCount", "blockPositions", "breakPos", "breakReason", "endBlockPos",
      "endBlockType", "endKind", "endMeasurementIndex", "endPos",
      "endsWithContinuation", "measurementCount", "occupiedHeight", "pageNumber",
      "remainingHeight", "segments", "startBlockPos", "startBlockType", "startKind",
      "startMeasurementIndex", "startPos", "startsWithContinuation"
    ]);
    expect(Object.keys(plan.pageMap.pages[0]).sort()).toEqual(
      Object.keys(plan.pages[0]).sort()
    );
    expect(plan.pages[0]).not.toHaveProperty("mainFlowCapacity");
    expect(plan.pages[0]).not.toHaveProperty("reservedHeight");
    expect(plan.pageMap).not.toHaveProperty("footnoteLayout");
    expect(absentOptionalPlan).toEqual(plan);
  });

  it("uses a supplied page capacity to create the later deterministic break", () => {
    const plan = calculatePaginationPlan({
      ...paginationInput([measurement(1, 60), measurement(2, 40)]),
      pageMainFlowByPage: [{
        pageNumber: 1,
        mainFlowCapacity: 70,
        reservedHeight: 30
      }]
    });

    expect(plan.pageBreaks).toEqual([expect.objectContaining({ pos: 2, reason: "overflow" })]);
    expect(plan.pages[0]).toMatchObject({
      mainFlowCapacity: 70,
      reservedHeight: 30,
      remainingHeight: 10
    });
    expect(plan.pageMap.pages[0]).toMatchObject({
      mainFlowCapacity: 70,
      reservedHeight: 30
    });
  });

  it.each([
    [{ pageNumber: 1 }, "MISSING_PAGE_MAIN_FLOW_CAPACITY"],
    [{ pageNumber: 1, mainFlowCapacity: 0 }, "INVALID_PAGE_MAIN_FLOW_CAPACITY"],
    [{ pageNumber: 1, mainFlowCapacity: 101 }, "INVALID_PAGE_MAIN_FLOW_CAPACITY"],
    [{ pageNumber: 1, reservedHeight: -1 }, "INVALID_PAGE_MAIN_FLOW_RESERVATION"],
    [{ pageNumber: 1, mainFlowCapacity: 70, reservedHeight: 29 }, "INCONSISTENT_PAGE_MAIN_FLOW_CAPACITY"]
  ])("rejects invalid deterministic page capacity input: %s", (entry, code) => {
    expect(() => calculatePaginationPlan({
      ...paginationInput([measurement(1, 20)]),
      pageMainFlowByPage: [entry]
    })).toThrow(expect.objectContaining({ code }));

    const integration = calculateFootnotePaginationPlan({
      paginationInput: {
        ...paginationInput([measurement(1, 20)]),
        pageMainFlowByPage: [entry]
      },
      footnotes: [note("note-v1-capacity", 1, 1, 10)]
    });
    expect(integration).toMatchObject({ status: "invalid", code });
    expect(integration.plan).toBeUndefined();
  });

  it("rejects malformed page-capacity containers instead of treating them as empty", () => {
    [42, false, "", new Date(0)].forEach((pageMainFlowByPage) => {
      expect(() => calculatePaginationPlan({
        ...paginationInput([measurement(1, 20)]),
        pageMainFlowByPage
      })).toThrow(expect.objectContaining({
        code: "INVALID_PAGE_MAIN_FLOW_CAPACITIES"
      }));
    });

    const integration = calculateFootnotePaginationPlan({
      paginationInput: {
        ...paginationInput([measurement(1, 20)]),
        pageMainFlowByPage: 42
      },
      footnotes: [note("note-v1-capacity-container", 1, 1, 10)]
    });
    expect(integration).toMatchObject({
      status: "invalid",
      code: "INVALID_PAGE_MAIN_FLOW_CAPACITIES"
    });
    expect(integration.plan).toBeUndefined();
  });

  it("reflows a reference onto a new page and converges with stable metadata", () => {
    const source = {
      paginationInput: paginationInput([measurement(1, 50), measurement(2, 40)]),
      footnotes: [
        note("note-v1-anchor", 1, 1, 20),
        note("note-v1-moves", 2, 2, 20)
      ]
    };
    const before = JSON.stringify(source);
    const result = calculateFootnotePaginationPlan(source);

    expect(result).toMatchObject({ status: "stable", iterations: 2 });
    expect(result.plan.pages[1].footnote).toMatchObject({
      pageNumber: 2,
      reservedHeight: 20,
      segments: [expect.objectContaining({ noteId: "note-v1-moves", referencePage: 2 })]
    });
    expect(result.plan.footnoteLayout.pages[0].reservedHeight).toBe(20);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("keeps same-page notes in semantic reference order", () => {
    const result = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([measurement(1, 20), measurement(2, 20)]),
      footnotes: [
        note("note-v1-second", 2, 2, 20),
        note("note-v1-first", 1, 1, 10)
      ]
    });

    expect(result.status).toBe("stable");
    expect(result.plan.pages[0].footnote.segments.map((segment) => segment.noteId)).toEqual([
      "note-v1-first", "note-v1-second"
    ]);
  });

  it("attaches labeled continuation pages only after their content measurements are supplied", () => {
    const result = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([measurement(1, 20)]),
      footnotes: [note("note-v1-long", 1, 1, 120)],
      maxFootnoteAreaHeight: 50,
      contentHeightsByPage: [
        { pageNumber: 1, height: 20 },
        { pageNumber: 2, height: 0 },
        { pageNumber: 3, height: 0 }
      ]
    });

    expect(result.status).toBe("stable");
    expect(result.plan.pages).toHaveLength(3);
    expect(result.plan.totalPages).toBe(3);
    expect(result.plan.mainFlowTotalPages).toBe(1);
    expect(result.plan.pageMap).toMatchObject({
      totalPages: 3,
      pageCount: 3,
      mainFlowTotalPages: 1
    });
    expect(result.plan.finalFillerHeight).toBe(30);
    expect(result.plan.pages[1]).toMatchObject({
      pageNumber: 2,
      startPos: null,
      endPos: null,
      measurementCount: 0,
      occupiedHeight: 0,
      remainingHeight: 50,
      breakReason: null,
      mainFlowCapacity: 50,
      reservedHeight: 50
    });
    expect(Object.keys(result.plan.pages[1]).sort()).toEqual(
      Object.keys(result.plan.pages[0]).sort()
    );
    expect(result.plan.footnoteLayout.pages.map((page) => page.reservedHeight)).toEqual([50, 50, 20]);
    expect(result.plan.pages[1].footnote.segments[0]).toMatchObject({
      continuationFromPreviousLabel: expect.any(String),
      continuationToNextLabel: expect.any(String)
    });
    expect(result.plan.pages[2].footnote.segments[0]).toMatchObject({
      continuationFromPreviousLabel: expect.any(String),
      continuationToNextLabel: null
    });
  });

  it("resolves a raw position to the latest segment on its multi-page block", () => {
    const result = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([
        measurement(1, 60, 1), measurement(2, 50, 1)
      ]),
      footnotes: [{
        reference: {
          noteId: "note-v1-multipage",
          kind: "footnote",
          blockPos: 1,
          pos: 2,
          order: 1
        },
        body: {
          noteId: "note-v1-multipage",
          kind: "footnote",
          measuredHeight: 10
        }
      }]
    });

    expect(result).toMatchObject({ status: "stable" });
    expect(result.plan.pages[1].footnote.segments[0]).toMatchObject({
      noteId: "note-v1-multipage",
      referencePage: 2
    });
  });

  it("does not let stale supplied content height mask a measured main-flow overflow", () => {
    const result = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([measurement(1, 90)]),
      footnotes: [note("note-v1-stale-height", 1, 1, 20)],
      contentHeightsByPage: [{ pageNumber: 1, height: 20 }]
    });

    expect(result).toMatchObject({
      status: "unresolved",
      code: "FOOTNOTE_REFLOW_UNRESOLVED"
    });
    expect(result.plan).toBeUndefined();
  });

  it("rejects duplicate supplied content-page measurements without a plan", () => {
    const result = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([measurement(1, 20)]),
      footnotes: [note("note-v1-duplicate-content", 1, 1, 10)],
      contentHeightsByPage: [
        { pageNumber: 2, height: 0 },
        { pageNumber: 2, height: 0 }
      ]
    });

    expect(result).toMatchObject({
      status: "invalid",
      code: "DUPLICATE_CONTENT_PAGE"
    });
    expect(result.plan).toBeUndefined();
  });

  it("fails closed for missing continuation measurement, max convergence, and invalid pairs or references", () => {
    const missingMeasurement = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([measurement(1, 20)]),
      footnotes: [note("note-v1-missing-page", 1, 1, 60)],
      maxFootnoteAreaHeight: 50
    });
    const cyclic = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([measurement(1, 60), measurement(2, 40)]),
      footnotes: [note("note-v1-cycle", 2, 1, 20)]
    });
    const maxIterations = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([measurement(1, 60), measurement(2, 40)]),
      footnotes: [note("note-v1-max", 2, 1, 20)],
      maxIterations: 1
    });
    const badPair = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([measurement(1, 20)]),
      footnotes: [{
        reference: { noteId: "note-v1-pair", kind: "footnote", pos: 1, order: 1 },
        body: { noteId: "note-v1-other", kind: "footnote", measuredHeight: 10 }
      }]
    });
    const unresolved = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([measurement(1, 20)]),
      footnotes: [note("note-v1-unresolved", 999, 1, 10)]
    });
    const ambiguousSegment = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([
        measurement(1, 60, 1), measurement(1, 60, 1)
      ]),
      footnotes: [{
        reference: {
          noteId: "note-v1-ambiguous",
          kind: "footnote",
          segmentPos: 1,
          order: 1
        },
        body: {
          noteId: "note-v1-ambiguous",
          kind: "footnote",
          measuredHeight: 10
        }
      }]
    });
    const unresolvedSegment = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([measurement(1, 20)]),
      footnotes: [{
        reference: {
          noteId: "note-v1-unresolved-segment",
          kind: "footnote",
          segmentPos: 999,
          order: 1
        },
        body: {
          noteId: "note-v1-unresolved-segment",
          kind: "footnote",
          measuredHeight: 10
        }
      }]
    });

    expect(missingMeasurement).toMatchObject({
      status: "unresolved",
      code: "FOOTNOTE_PAGE_MEASUREMENT_REQUIRED"
    });
    expect(maxIterations).toMatchObject({
      status: "maxIterations",
      code: "REFERENCE_PAGE_MAX_ITERATIONS"
    });
    expect(cyclic).toMatchObject({
      status: "cycle",
      code: "REFERENCE_PAGE_CYCLE"
    });
    [
      missingMeasurement, cyclic, maxIterations, badPair, unresolved,
      ambiguousSegment, unresolvedSegment
    ].forEach((result) => {
      expect(result.plan).toBeUndefined();
    });
    expect(badPair).toMatchObject({ status: "invalid", code: "INVALID_FOOTNOTE_PAIR" });
    expect(unresolved).toMatchObject({
      status: "invalid",
      code: "UNRESOLVED_FOOTNOTE_REFERENCE_PAGE"
    });
    expect(ambiguousSegment).toMatchObject({
      status: "invalid",
      code: "AMBIGUOUS_FOOTNOTE_REFERENCE_PAGE"
    });
    expect(unresolvedSegment).toMatchObject({
      status: "invalid",
      code: "UNRESOLVED_FOOTNOTE_REFERENCE_PAGE"
    });
    expect(FootnotePaginationIntegrationError).toBeTypeOf("function");
  });

  it("recomputes table-too-tall metadata after a capacity-driven page transition", () => {
    const tableRow = {
      ...measurement(2, 80),
      kind: "tableRow",
      tableRowHasMergedCells: false,
      tableRowIndex: 0
    };
    const plan = calculatePaginationPlan({
      ...paginationInput([measurement(1, 40), tableRow]),
      pageMainFlowByPage: [
        { pageNumber: 1, mainFlowCapacity: 50, reservedHeight: 50 },
        { pageNumber: 2, mainFlowCapacity: 100, reservedHeight: 0 }
      ]
    });

    expect(plan.pageBreaks[0]).toMatchObject({ reason: "tableRowTooTall" });
    expect(plan.pages[1].segments[0]).toMatchObject({
      tableRowTooTall: false,
      tableRowTooTallKind: null
    });
    expect(plan.debugDecisions).not.toContainEqual(
      expect.objectContaining({ reason: "tableRowTooTall", pageNumber: 2 })
    );
  });

  it("freezes optional footnote PageMap data without adding it to ordinary plans", () => {
    const result = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([measurement(1, 20)]),
      footnotes: [note("note-v1-frozen", 1, 1, 10)]
    });
    const pageMap = result.plan.pageMap;

    expect(Object.isFrozen(pageMap.footnoteLayout)).toBe(true);
    expect(Object.isFrozen(pageMap.footnoteLayout.pages[0])).toBe(true);
    expect(Object.isFrozen(pageMap.pages[0].footnote)).toBe(true);
    expect(Object.isFrozen(pageMap.pages[0].footnote.segments)).toBe(true);
  });

  it("never echoes transient fragment payload into layout or PageMap segments", () => {
    const result = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([measurement(1, 20)]),
      footnotes: [fragmentNote("note-v1-safe-fragments", 1, 1, [
        {
          fragmentIndex: 0,
          measuredHeight: 10,
          paragraphIndex: 3,
          from: 4,
          to: 9,
          html: "<strong>secret</strong>"
        },
        { fragmentIndex: 1, measuredHeight: 10, html: "<i>hidden</i>" }
      ])]
    });
    const safeSegments = [
      ...result.plan.footnoteLayout.segments,
      ...result.plan.pages[0].footnote.segments,
      ...result.plan.pageMap.footnoteLayout.segments,
      ...result.plan.pageMap.pages[0].footnote.segments
    ];

    expect(result).toMatchObject({ status: "stable" });
    safeSegments.forEach((segment) => {
      ["html", "text", "from", "to", "paragraphIndex"].forEach((key) => {
        expect(segment).not.toHaveProperty(key);
      });
      expect(segment).toMatchObject({
        fragmentStartIndex: 0,
        fragmentEndIndex: 2,
        fragmentCount: 2,
        measuredHeight: 20
      });
    });
  });

  it("propagates a fractional exact-fit fragment segment without a false continuation page", () => {
    const result = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([measurement(1, 0.1)], {
        contentAreaHeight: 1
      }),
      footnotes: [fragmentNote("note-v1-fractional", 1, 1, [
        { fragmentIndex: 0, measuredHeight: 0.1 },
        { fragmentIndex: 1, measuredHeight: 0.2 }
      ])],
      maxFootnoteAreaHeight: 0.3
    });

    expect(result).toMatchObject({ status: "stable" });
    expect(result.plan.footnoteLayout.pages).toHaveLength(1);
    expect(result.plan.pageMap.footnoteLayout.pages).toHaveLength(1);
    expect(result.plan.pageMap.pages[0].footnote).toMatchObject({
      reservedHeight: 0.3,
      segments: [expect.objectContaining({
        measuredHeight: 0.3,
        fragmentStartIndex: 0,
        fragmentEndIndex: 2,
        fragmentCount: 2,
        continuation: "none",
        isContinuation: false,
        continuesToNextPage: false
      })]
    });
  });

  it.each([
    ["malformed fragments", {
      measuredHeight: 10,
      fragments: []
    }, {}, "INVALID_FOOTNOTE_FRAGMENTS"],
    ["malformed fragment record", {
      measuredHeight: 10,
      fragments: [null]
    }, {}, "INVALID_FOOTNOTE_FRAGMENT"],
    ["invalid fragment height", {
      measuredHeight: 10,
      fragments: [{ fragmentIndex: 0, measuredHeight: 0 }]
    }, {}, "INVALID_FOOTNOTE_FRAGMENT_HEIGHT"],
    ["noncontiguous indexes", {
      measuredHeight: 10,
      fragments: [
        { fragmentIndex: 0, measuredHeight: 5 },
        { fragmentIndex: 2, measuredHeight: 5 }
      ]
    }, {}, "INVALID_FOOTNOTE_FRAGMENT_INDEX"],
    ["height mismatch", {
      measuredHeight: 6,
      fragments: [{ fragmentIndex: 0, measuredHeight: 5 }]
    }, {}, "FOOTNOTE_FRAGMENT_HEIGHT_MISMATCH"],
    ["too-tall fragment", {
      measuredHeight: 60,
      fragments: [{ fragmentIndex: 0, measuredHeight: 60 }]
    }, { maxFootnoteAreaHeight: 50 }, "FOOTNOTE_FRAGMENT_TOO_TALL"]
  ])("fails closed through the bridge for %s", (_label, body, options, code) => {
    const result = calculateFootnotePaginationPlan({
      paginationInput: paginationInput([measurement(1, 20)]),
      footnotes: [{
        reference: { noteId: "note-v1-invalid-fragments", kind: "footnote", pos: 1, order: 1 },
        body: { noteId: "note-v1-invalid-fragments", kind: "footnote", ...body }
      }],
      ...options
    });

    expect(result).toMatchObject({ status: "invalid", code });
    expect(result.plan).toBeUndefined();
  });
});
