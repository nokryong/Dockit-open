/* @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { calculatePaginationPlan } from "../../app/LIB/pagination/layout/calculatePaginationPlan";
import {
  activateCanonicalBodyProjection,
  createFootnotePrintProjectionAdapter,
  retryMissingFootnoteContinuationPages,
  selectFootnotePaginationOutcome,
  resolveFootnotePrintReadiness
} from "../../app/LIB/pagination/notes/footnoteScreenPaginationRuntime";
import { createPaginationDecorations } from "../../app/LIB/pagination/render/createPaginationDecorations";

const input = {
  measurements: [{
    pos: 1, blockPos: 1, blockIndex: 0, blockType: "paragraph", kind: "textLine",
    measurementIndex: 0, offsetHeight: 10, marginTop: 0, marginBottom: 0, isBlockStart: true
  }],
  contentAreaHeight: 100,
  pageMetrics: { width: 100, padding: { left: 0, right: 0 } }
};

describe("footnote editor binding adapters", () => {
  it("activates the canonical-body projection only for a complete one-to-one match", () => {
    const host = document.createElement("div");
    const editor = document.createElement("div");
    editor.innerHTML = [
      '<section data-dockit-note-body="true" data-dockit-note-kind="footnote" data-dockit-note-id="n1"></section>',
      '<section data-dockit-note-body="true" data-dockit-note-kind="footnote" data-dockit-note-id="n2"></section>',
      '<section data-dockit-note-body="true" data-dockit-note-kind="footnote" data-dockit-note-id="n3"></section>'
    ].join("");
    host.appendChild(editor);
    const view = { dom: editor };
    const candidate = {
      footnotes: [{ body: { noteId: "n1" } }, { body: { noteId: "n2" } }]
    };

    expect(activateCanonicalBodyProjection({
      view,
      candidate,
      projection: { segments: [{ noteId: "n1" }] }
    })).toBeNull();
    expect(host.hasAttribute("data-dockit-footnote-projection-active")).toBe(false);

    expect(activateCanonicalBodyProjection({
      view,
      candidate,
      projection: { segments: [{ noteId: "n1" }, { noteId: "n3" }] }
    })).toBeNull();
    expect(host.hasAttribute("data-dockit-footnote-projection-active")).toBe(false);

    expect(activateCanonicalBodyProjection({
      view,
      candidate,
      projection: { segments: [{ noteId: "n1" }, { noteId: "n2" }] }
    })).toBe(host);
    expect(host.getAttribute("data-dockit-footnote-projection-active")).toBe("true");
  });

  it("uses the genuine legacy input when integration or projection is incomplete", () => {
    const legacyInput = { ...input, measurements: [...input.measurements, { ...input.measurements[0], pos: 2, measurementIndex: 1 }] };
    const excludedInput = { ...input, measurements: [...input.measurements] };
    const legacyPlan = calculatePaginationPlan(legacyInput);

    [
      { status: "unresolved", code: "FOOTNOTE_PAGE_MEASUREMENT_REQUIRED" },
      { status: "stable", plan: calculatePaginationPlan(excludedInput) }
    ].forEach((footnoteIntegration, index) => {
      const outcome = selectFootnotePaginationOutcome({
        legacyPaginationInput: legacyInput,
        footnotePaginationInput: excludedInput,
        footnoteIntegration,
        footnoteProjection: index === 0 ? { segments: [{}] } : null
      });
      expect(outcome.active).toBe(false);
      expect(outcome.input).toBe(legacyInput);
      expect(outcome.plan).toEqual(legacyPlan);
    });

    const noFootnote = selectFootnotePaginationOutcome({ legacyPaginationInput: legacyInput });
    expect(noFootnote).toEqual({ active: false, input: legacyInput, plan: legacyPlan });
    expect(Object.keys(noFootnote.plan.pageMap)).not.toContain("footnoteLayout");

    const activePlan = calculatePaginationPlan(excludedInput);
    const active = selectFootnotePaginationOutcome({
      legacyPaginationInput: null,
      footnotePaginationInput: excludedInput,
      footnoteIntegration: { status: "stable", plan: activePlan },
      footnoteProjection: { segments: [{}] }
    });
    expect(active).toEqual({
      active: true,
      input: excludedInput,
      plan: activePlan
    });
  });

  it("provides bounded zero-height measurement only for continuation-only pages", () => {
    const footnotes = [{
      reference: { noteId: "note-v1-long", kind: "footnote", pos: 1, order: 1 },
      body: {
        noteId: "note-v1-long", kind: "footnote", measuredHeight: 240,
        fragments: [
          { fragmentIndex: 0, measuredHeight: 80 },
          { fragmentIndex: 1, measuredHeight: 80 },
          { fragmentIndex: 2, measuredHeight: 80 }
        ]
      }
    }];
    const result = retryMissingFootnoteContinuationPages({
      paginationInput: input,
      footnotes,
      maxFootnoteAreaHeight: 100,
      noteAreaOverhead: 0
    });

    expect(result).toMatchObject({ status: "stable" });
    expect(result.plan.footnoteLayout.pages).toHaveLength(3);
    expect(result.plan.footnoteLayout.segments).toMatchObject([
      { pageNumber: 1, continuation: "continues", fragmentStartIndex: 0, fragmentEndIndex: 1 },
      { pageNumber: 2, continuation: "continued", continuationFromPreviousLabel: "각주 계속" },
      { pageNumber: 3, continuation: "continued", continuationFromPreviousLabel: "각주 계속" }
    ]);
  });

  it("mounts only print clones in reserved fillers and adds continuation-only pages", () => {
    const plan = {
      ...calculatePaginationPlan(input),
      totalPages: 3,
      mainFlowTotalPages: 1,
      finalFillerHeight: 20,
      pages: [
        { pageNumber: 1, footnote: { reservedHeight: 40 } },
        { pageNumber: 2, footnote: { reservedHeight: 40 } },
        { pageNumber: 3, footnote: { reservedHeight: 30 } }
      ],
      footnoteLayout: { pages: [
        { pageNumber: 1, reservedHeight: 40 },
        { pageNumber: 2, reservedHeight: 40 },
        { pageNumber: 3, reservedHeight: 30 }
      ] }
    };
    const printClone = document.createElement("section");
    printClone.innerHTML = '<a href="https://example.com">rich link</a>';
    const decorations = createPaginationDecorations({
      doc: { content: { size: 1 }, nodeAt: () => null },
      plan,
      pageMetrics: {
        width: 100,
        pageHeightPx: 100,
        padding: { top: 5, right: 5, bottom: 5, left: 5 }
      },
      gapHeight: 0,
      footnotePrintProjectionAdapter: createFootnotePrintProjectionAdapter({
        projection: { segments: [
          { pageNumber: 1, noteId: "n", segmentIndex: 0, height: 22, printClone },
          { pageNumber: 2, noteId: "n", segmentIndex: 1, height: 22, printClone, continuationFromPreviousLabel: "각주 계속" },
          { pageNumber: 3, noteId: "n", segmentIndex: 2, height: 12, printClone }
        ] }
      })
    });
    const widgets = decorations.map((decoration) => decoration.type.toDOM).filter(Boolean);
    const continuationWidgets = widgets.filter((widget) =>
      widget.classList?.contains("dockit-footnote-print-only-page")
    );
    expect(continuationWidgets).toHaveLength(2);
    expect(
      continuationWidgets.map((widget) =>
        widget.querySelector(".page-content-filler")?.style.height
      )
    ).toEqual(["90px", "90px"]);
    expect(
      continuationWidgets[0].firstElementChild?.classList.contains(
        "tiptap-page-break-structure--header"
      )
    ).toBe(true);
    expect(
      continuationWidgets[0].querySelector(".page-break-boundary")
    ).not.toBeNull();
    expect(
      continuationWidgets[1].querySelector(".page-break-boundary")
    ).toBeNull();
    expect(widgets.map((widget) => widget.querySelector?.(".dockit-footnote-print-projection")).filter(Boolean)).toHaveLength(3);
    expect(
      widgets
        .map((widget) =>
          widget.querySelector?.(".dockit-footnote-print-projection")
            ?.style.width
        )
        .filter(Boolean)
    ).toEqual(["90px", "90px", "90px"]);
    expect(widgets.some((widget) => widget.querySelector?.("a")?.getAttribute("href") === "https://example.com")).toBe(true);
  });

  it("does not duplicate regular pages when no continuation-only boundary exists", () => {
    const plan = {
      ...calculatePaginationPlan(input),
      totalPages: 2,
      finalFillerHeight: 20,
      pages: [
        { pageNumber: 1, footnote: { reservedHeight: 40 } },
        { pageNumber: 2, footnote: { reservedHeight: 30 } }
      ],
      footnoteLayout: {
        pages: [
          { pageNumber: 1, reservedHeight: 40 },
          { pageNumber: 2, reservedHeight: 30 }
        ]
      }
    };
    const printClone = document.createElement("section");
    printClone.textContent = "footnote";
    const decorations = createPaginationDecorations({
      doc: { content: { size: 1 }, nodeAt: () => null },
      plan,
      pageMetrics: {
        width: 100,
        pageHeightPx: 100,
        padding: { top: 5, right: 5, bottom: 5, left: 5 }
      },
      gapHeight: 0,
      footnotePrintProjectionAdapter: createFootnotePrintProjectionAdapter({
        projection: {
          segments: [
            { pageNumber: 1, noteId: "n", segmentIndex: 0, height: 22, printClone },
            { pageNumber: 2, noteId: "n", segmentIndex: 1, height: 12, printClone }
          ]
        }
      })
    });
    const widgets = decorations
      .map((decoration) => decoration.type.toDOM)
      .filter(Boolean);

    expect(
      widgets.filter((widget) =>
        widget.classList?.contains("dockit-footnote-print-only-page")
      )
    ).toHaveLength(0);
    expect(
      widgets
        .map((widget) =>
          widget.querySelector?.(".dockit-footnote-print-projection")
        )
        .filter(Boolean)
    ).toHaveLength(1);
  });

  it("keeps no-footnote decorations unchanged and exposes a blocking print error only on request", () => {
    const plan = calculatePaginationPlan(input);
    const args = { doc: { content: { size: 1 }, nodeAt: () => null }, plan, pageMetrics: input.pageMetrics, gapHeight: 0 };
    const normal = createPaginationDecorations(args);
    const blocked = createPaginationDecorations({ ...args, footnotePrintStatus: "blocked" });
    expect(normal.some((decoration) => decoration.type.toDOM?.classList?.contains("dockit-footnote-print-blocking-error"))).toBe(false);
    expect(blocked.some((decoration) => decoration.type.toDOM?.classList?.contains("dockit-footnote-print-blocking-error"))).toBe(true);
    expect(resolveFootnotePrintReadiness({ hasFootnoteBody: false, activeProjection: false })).toBe("not-required");
    expect(resolveFootnotePrintReadiness({ hasFootnoteBody: true, activeProjection: false })).toBe("blocked");
    expect(resolveFootnotePrintReadiness({ hasFootnoteBody: true, activeProjection: true })).toBe("ready");
  });
});
