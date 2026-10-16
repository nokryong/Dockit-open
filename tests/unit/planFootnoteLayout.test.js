import { describe, expect, it } from "vitest";
import {
  FootnoteLayoutError,
  convergeFootnoteLayout,
  createFootnoteLayoutFingerprint,
  planFootnoteLayout
} from "../../app/LIB/pagination/notes/planFootnoteLayout";

const note = (noteId, pageNumber, order, measuredHeight) => ({
  reference: { noteId, kind: "footnote", pageNumber, order },
  body: { noteId, kind: "footnote", measuredHeight }
});
const fragmentNote = (noteId, pageNumber, order, fragments, extraBody = {}) => ({
  reference: { noteId, kind: "footnote", pageNumber, order },
  body: {
    noteId,
    kind: "footnote",
    measuredHeight: fragments.reduce((total, fragment) => total + fragment.measuredHeight, 0),
    fragments,
    ...extraBody
  }
});
const input = (footnotes, extra = {}) => ({ pageCapacity: 100, footnotes, ...extra });

describe("N4a deterministic footnote layout contract", () => {
  it("orders same-page notes by reference order and reserves their measured heights", () => {
    const plan = planFootnoteLayout(input([
      note("note-v1-second", 1, 2, 20), note("note-v1-first", 1, 1, 10)
    ]));
    expect(plan.pages[0].reservedHeight).toBe(30);
    expect(plan.pages[0].segments.map((entry) => entry.noteId)).toEqual(["note-v1-first", "note-v1-second"]);
  });

  it("returns a deterministic empty immutable plan for zero notes", () => {
    const plan = planFootnoteLayout(input([]));
    expect(plan.pages).toEqual([]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.pages)).toBe(true);
  });

  it("splits oversized bodies into explicit deterministic continuation segments", () => {
    const plan = planFootnoteLayout(input([note("note-v1-long", 1, 1, 240)]));
    expect(plan.pages.map((page) => page.reservedHeight)).toEqual([100, 100, 40]);
    expect(plan.segments.map(({ continuation, segmentIndex, measuredHeight }) => ({ continuation, segmentIndex, measuredHeight }))).toEqual([
      { continuation: "continues", segmentIndex: 0, measuredHeight: 100 },
      { continuation: "continued", segmentIndex: 1, measuredHeight: 100 },
      { continuation: "continued", segmentIndex: 2, measuredHeight: 40 }
    ]);
    expect(plan.segments.map((segment) => ({
      fromPrevious: segment.continuationFromPreviousLabel,
      toNext: segment.continuationToNextLabel
    }))).toEqual([
      { fromPrevious: null, toNext: "다음 페이지에 계속" },
      { fromPrevious: "각주 계속", toNext: "다음 페이지에 계속" },
      { fromPrevious: "각주 계속", toNext: null }
    ]);
  });

  it("keeps scalar segment output exactly free of fragment boundary keys", () => {
    const plan = planFootnoteLayout(input([note("note-v1-scalar", 1, 1, 120)]));
    plan.segments.forEach((segment) => {
      expect(segment).not.toHaveProperty("fragmentStartIndex");
      expect(segment).not.toHaveProperty("fragmentEndIndex");
      expect(segment).not.toHaveProperty("fragmentCount");
    });
  });

  it("partitions fragment bodies into exact contiguous continuation boundaries", () => {
    const plan = planFootnoteLayout(input([
      fragmentNote("note-v1-fragments", 1, 1, [
        { fragmentIndex: 0, measuredHeight: 40 },
        { fragmentIndex: 1, measuredHeight: 30 },
        { fragmentIndex: 2, measuredHeight: 50 },
        { fragmentIndex: 3, measuredHeight: 20 }
      ])
    ]));

    expect(plan.pages.map((page) => page.reservedHeight)).toEqual([70, 70]);
    expect(plan.segments.map((segment) => ({
      fragmentStartIndex: segment.fragmentStartIndex,
      fragmentEndIndex: segment.fragmentEndIndex,
      fragmentCount: segment.fragmentCount,
      measuredHeight: segment.measuredHeight,
      continuation: segment.continuation,
      isContinuation: segment.isContinuation,
      continuesToNextPage: segment.continuesToNextPage
    }))).toEqual([
      {
        fragmentStartIndex: 0,
        fragmentEndIndex: 2,
        fragmentCount: 2,
        measuredHeight: 70,
        continuation: "continues",
        isContinuation: false,
        continuesToNextPage: true
      },
      {
        fragmentStartIndex: 2,
        fragmentEndIndex: 4,
        fragmentCount: 2,
        measuredHeight: 70,
        continuation: "continued",
        isContinuation: true,
        continuesToNextPage: false
      }
    ]);
    expect(plan.segments.flatMap((segment) => Array.from(
      { length: segment.fragmentCount },
      (_, offset) => segment.fragmentStartIndex + offset
    ))).toEqual([0, 1, 2, 3]);
    expect(plan.segments[0]).toMatchObject({
      continuationFromPreviousLabel: null,
      continuationToNextLabel: expect.any(String)
    });
    expect(plan.segments[1]).toMatchObject({
      continuationFromPreviousLabel: expect.any(String),
      continuationToNextLabel: null
    });
  });

  it("moves an indivisible fragment to a fresh page when the current remainder is insufficient", () => {
    const plan = planFootnoteLayout(input([
      note("note-v1-leading", 1, 1, 70),
      fragmentNote("note-v1-after", 1, 2, [
        { fragmentIndex: 0, measuredHeight: 40 },
        { fragmentIndex: 1, measuredHeight: 20 }
      ])
    ]));

    expect(plan.pages.map((page) => page.segments.map((segment) => segment.noteId))).toEqual([
      ["note-v1-leading"], ["note-v1-after"]
    ]);
    expect(plan.pages.map((page) => page.reservedHeight)).toEqual([70, 60]);
    expect(plan.segments[1]).toMatchObject({
      fragmentStartIndex: 0,
      fragmentEndIndex: 2,
      fragmentCount: 2,
      measuredHeight: 60
    });
  });

  it("keeps fractional fragments on one page when they fit within measurement tolerance", () => {
    const plan = planFootnoteLayout(input([
      fragmentNote("note-v1-fractional", 1, 1, [
        { fragmentIndex: 0, measuredHeight: 0.1 },
        { fragmentIndex: 1, measuredHeight: 0.2 }
      ])
    ], {
      pageCapacity: 0.3,
      maxFootnoteAreaHeight: 0.3
    }));

    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0].reservedHeight).toBe(0.3);
    expect(plan.pages[0].availableFootnoteHeight).toBe(0);
    expect(plan.segments).toEqual([
      expect.objectContaining({
        measuredHeight: 0.3,
        fragmentStartIndex: 0,
        fragmentEndIndex: 2,
        fragmentCount: 2,
        continuation: "none",
        isContinuation: false,
        continuesToNextPage: false
      })
    ]);
  });

  it("keeps mixed scalar and fragment notes in semantic reference order", () => {
    const plan = planFootnoteLayout(input([
      note("note-v1-scalar", 1, 2, 40),
      fragmentNote("note-v1-fragment", 1, 1, [
        { fragmentIndex: 0, measuredHeight: 20 },
        { fragmentIndex: 1, measuredHeight: 30 }
      ])
    ]));

    expect(plan.segments.map((segment) => segment.noteId)).toEqual([
      "note-v1-fragment", "note-v1-scalar"
    ]);
    expect(plan.segments[0]).toMatchObject({
      fragmentStartIndex: 0,
      fragmentEndIndex: 2,
      fragmentCount: 2
    });
    expect(plan.segments[1]).not.toHaveProperty("fragmentCount");
  });

  it("reserves measured note chrome once per occupied page", () => {
    const plan = planFootnoteLayout(input(
      [note("note-v1-a", 1, 1, 70)],
      { maxFootnoteAreaHeight: 50, noteAreaOverhead: 10 }
    ));
    expect(plan.pages.map((page) => ({
      body: page.bodyReservedHeight,
      reserved: page.reservedHeight
    }))).toEqual([
      { body: 40, reserved: 50 },
      { body: 30, reserved: 40 }
    ]);
  });

  it("returns reservation-driven main-flow reflow instead of rejecting a full page", () => {
    const plan = planFootnoteLayout(input(
      [note("note-v1-a", 1, 1, 10)],
      { contentHeightsByPage: [{ pageNumber: 1, height: 100 }] }
    ));
    expect(plan.pages[0]).toMatchObject({
      reservedHeight: 10,
      mainFlowCapacity: 90,
      mainFlowOverflowHeight: 10,
      requiresReflow: true
    });
  });

  it("is repeatable and does not mutate caller-owned input", () => {
    const source = input([note("note-v1-a", 1, 1, 75)], { contentHeightsByPage: [{ pageNumber: 1, height: 10 }] });
    const before = JSON.stringify(source);
    const first = planFootnoteLayout(source);
    const second = planFootnoteLayout(source);
    expect(createFootnoteLayoutFingerprint(first)).toBe(createFootnoteLayoutFingerprint(second));
    expect(JSON.stringify(source)).toBe(before);
    expect(Object.isFrozen(first.pages[0])).toBe(true);
    expect(Object.isFrozen(first.pages[0].segments)).toBe(true);
    expect(Object.isFrozen(first.pages[0].segments[0])).toBe(true);
  });

  it("includes only safe fragment boundaries in fingerprints and convergence state", () => {
    const source = input([
      fragmentNote("note-v1-private-fragments", 1, 1, [
        { fragmentIndex: 0, measuredHeight: 40, html: "<em>private</em>", from: 1, to: 2 },
        { fragmentIndex: 1, measuredHeight: 30, paragraphIndex: 4 }
      ])
    ], { contentHeightsByPage: [{ pageNumber: 1, height: 0 }] });
    const before = JSON.stringify(source);
    const first = planFootnoteLayout(source);
    const second = planFootnoteLayout(source);
    const convergence = convergeFootnoteLayout({
      input: source,
      resolveLayout: () => ({})
    });

    expect(createFootnoteLayoutFingerprint(first)).toBe(createFootnoteLayoutFingerprint(second));
    expect(JSON.parse(createFootnoteLayoutFingerprint(first)).pages[0].segments[0].slice(-3)).toEqual([0, 2, 2]);
    expect(createFootnoteLayoutFingerprint(first)).not.toContain("<em>private</em>");
    expect(createFootnoteLayoutFingerprint(first)).not.toContain("paragraphIndex");
    expect(JSON.stringify(source)).toBe(before);
    expect(convergence).toMatchObject({ status: "stable", iterations: 1 });
    expect(JSON.parse(convergence.fingerprint).pages[0].segments[0].slice(-3)).toEqual([0, 2, 2]);
  });

  it("converges after caller-driven reference migration", () => {
    const result = convergeFootnoteLayout({
      input: input(
        [note("note-v1-a", 1, 1, 40)],
        {
          contentHeightsByPage: [
            { pageNumber: 1, height: 0 },
            { pageNumber: 2, height: 0 }
          ]
        }
      ),
      resolveLayout: ({ iteration }) => ({
        referencePages: iteration === 1 ? { "note-v1-a": 2 } : {}
      })
    });
    expect(result.status).toBe("stable");
    expect(result.iterations).toBe(2);
    expect(result.plan.pages.find((page) => page.reservedHeight > 0).pageNumber).toBe(2);
  });

  it("fails closed with cycle and iteration-exhaustion statuses", () => {
    const cycle = convergeFootnoteLayout({
      input: input([note("note-v1-a", 1, 1, 10)]),
      resolveLayout: ({ iteration }) => ({
        referencePages: {
          "note-v1-a": iteration % 2 === 1 ? 2 : 1
        }
      })
    });
    const exhausted = convergeFootnoteLayout({
      input: input([note("note-v1-a", 1, 1, 10)]), maxIterations: 2,
      resolveLayout: ({ iteration }) => ({
        referencePages: { "note-v1-a": iteration + 1 }
      })
    });
    expect(cycle).toMatchObject({ status: "cycle", code: "REFERENCE_PAGE_CYCLE" });
    expect(cycle.plan).toBeUndefined();
    expect(exhausted).toMatchObject({ status: "maxIterations", code: "REFERENCE_PAGE_MAX_ITERATIONS" });
  });

  it("rejects unknown resolver IDs and explicit page-limit overflow", () => {
    expect(() => convergeFootnoteLayout({
      input: input([note("note-v1-a", 1, 1, 10)]),
      resolveLayout: () => ({
        referencePages: { "note-v1-unknown": 2 }
      })
    })).toThrow(expect.objectContaining({
      code: "INVALID_REFERENCE_PAGE_RESOLUTION"
    }));
    expect(() => planFootnoteLayout(input(
      [note("note-v1-long", 1, 1, 250)],
      { maxPages: 2 }
    ))).toThrow(expect.objectContaining({
      code: "FOOTNOTE_PAGE_LIMIT_EXCEEDED"
    }));
  });

  it("requires measured main-flow convergence before exposing a stable plan", () => {
    const source = input(
      [note("note-v1-a", 1, 1, 10)],
      { contentHeightsByPage: [{ pageNumber: 1, height: 100 }] }
    );
    const unresolved = convergeFootnoteLayout({
      input: source,
      resolveLayout: () => ({})
    });
    const stable = convergeFootnoteLayout({
      input: source,
      resolveLayout: ({ iteration }) => ({
        contentHeightsByPage: [{
          pageNumber: 1,
          height: iteration === 1 ? 90 : 90
        }]
      })
    });
    expect(unresolved).toMatchObject({
      status: "unresolved",
      code: "FOOTNOTE_REFLOW_UNRESOLVED"
    });
    expect(unresolved.plan).toBeUndefined();
    expect(stable).toMatchObject({ status: "stable", iterations: 2 });
    expect(stable.plan.pages[0].requiresReflow).toBe(false);
  });

  it("never treats an unmeasured continuation page as an empty stable page", () => {
    const source = input(
      [note("note-v1-a", 1, 1, 60)],
      {
        maxFootnoteAreaHeight: 50,
        contentHeightsByPage: [{ pageNumber: 1, height: 0 }]
      }
    );
    const plan = planFootnoteLayout(source);
    expect(plan.pages[1]).toMatchObject({
      pageNumber: 2,
      contentHeight: null,
      contentHeightMeasured: false,
      requiresMeasurement: true,
      mainFlowOverflowHeight: null,
      requiresReflow: null
    });

    const unresolved = convergeFootnoteLayout({
      input: source,
      resolveLayout: () => ({})
    });
    expect(unresolved).toMatchObject({
      status: "unresolved",
      code: "FOOTNOTE_PAGE_MEASUREMENT_REQUIRED",
      missingPageNumbers: [2]
    });
    expect(unresolved.plan).toBeUndefined();
    expect(Object.isFrozen(unresolved.missingPageNumbers)).toBe(true);

    const stable = convergeFootnoteLayout({
      input: source,
      resolveLayout: () => ({
        contentHeightsByPage: [
          { pageNumber: 1, height: 0 },
          { pageNumber: 2, height: 0 }
        ]
      })
    });
    expect(stable).toMatchObject({ status: "stable", iterations: 2 });
    expect(stable.plan.pages[1]).toMatchObject({
      contentHeightMeasured: true,
      requiresMeasurement: false,
      requiresReflow: false
    });
  });

  it.each([
    ["invalid capacity", input([note("note-v1-a", 1, 1, 10)], { pageCapacity: 0 }), "INVALID_PAGE_CAPACITY"],
    ["invalid note area", input([note("note-v1-a", 1, 1, 10)], { maxFootnoteAreaHeight: 101 }), "INVALID_FOOTNOTE_AREA_CAPACITY"],
    ["invalid note chrome", input([note("note-v1-a", 1, 1, 10)], { noteAreaOverhead: 100 }), "INVALID_FOOTNOTE_AREA_OVERHEAD"],
    ["unsafe id", input([note("unsafe!", 1, 1, 10)]), "INVALID_FOOTNOTE_ID"],
    ["non-footnote kind", { ...input([note("note-v1-a", 1, 1, 10)]), footnotes: [{ ...note("note-v1-a", 1, 1, 10), body: { ...note("note-v1-a", 1, 1, 10).body, kind: "endnote" } }] }, "INVALID_FOOTNOTE_KIND"],
    ["duplicate reference", input([note("note-v1-a", 1, 1, 10), note("note-v1-a", 2, 1, 10)]), "DUPLICATE_FOOTNOTE_REFERENCE"],
    ["duplicate order", input([note("note-v1-a", 1, 1, 10), note("note-v1-b", 1, 1, 10)]), "DUPLICATE_FOOTNOTE_REFERENCE_ORDER"],
    ["invalid content height", input([note("note-v1-a", 1, 1, 10)], { contentHeightsByPage: [{ pageNumber: 1, height: 101 }] }), "INVALID_CONTENT_HEIGHT"],
    ["empty fragments", input([{
      ...fragmentNote("note-v1-fragments", 1, 1, [{ fragmentIndex: 0, measuredHeight: 10 }]),
      body: { noteId: "note-v1-fragments", kind: "footnote", measuredHeight: 10, fragments: [] }
    }]), "INVALID_FOOTNOTE_FRAGMENTS"],
    ["noncontiguous fragment indexes", input([fragmentNote("note-v1-fragments", 1, 1, [
      { fragmentIndex: 0, measuredHeight: 5 }, { fragmentIndex: 2, measuredHeight: 5 }
    ])]), "INVALID_FOOTNOTE_FRAGMENT_INDEX"],
    ["fragment height mismatch", input([{
      ...fragmentNote("note-v1-fragments", 1, 1, [{ fragmentIndex: 0, measuredHeight: 5 }]),
      body: {
        noteId: "note-v1-fragments", kind: "footnote", measuredHeight: 6,
        fragments: [{ fragmentIndex: 0, measuredHeight: 5 }]
      }
    }]), "FOOTNOTE_FRAGMENT_HEIGHT_MISMATCH"],
    ["too-tall fragment", input([fragmentNote("note-v1-fragments", 1, 1, [
      { fragmentIndex: 0, measuredHeight: 60 }
    ])], { maxFootnoteAreaHeight: 50 }), "FOOTNOTE_FRAGMENT_TOO_TALL"]
  ])("rejects %s without a partial plan", (_label, badInput, code) => {
    expect(() => planFootnoteLayout(badInput)).toThrow(FootnoteLayoutError);
    expect(() => planFootnoteLayout(badInput)).toThrow(expect.objectContaining({ code }));
  });
});
