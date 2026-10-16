/* @vitest-environment jsdom */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPaginationInput } from "../../app/LIB/pagination/model/buildPaginationInput";
import { calculatePaginationPlan } from "../../app/LIB/pagination/layout/calculatePaginationPlan";
import { createPaginationDecorations } from "../../app/LIB/pagination/render/createPaginationDecorations";
import { buildPaginationPageSegmentModel } from "../../app/LIB/pagination/render/buildPaginationPageSegmentModel";
import {
  createEditorStateStub,
  listItemSplitFixture,
  mergedTableRowGroupFixture,
  paragraphBoundaryReflowFixture,
  spikePageMetrics
} from "./fixtures/paginationSpikeFixtures";

const buildInputFromFixture = (fixture) =>
  buildPaginationInput({
    editorState: createEditorStateStub(
      fixture.pmDoc,
      fixture.topLevelPositions
    ),
    pageMetrics: spikePageMetrics,
    domModel: fixture.domModel
  });

const createDocStub = (input) => ({
  content: {
    size: 500
  },
  nodeAt(pos) {
    const block = input.blocks.find((candidate) => candidate.pos === pos);

    if (!block) {
      return null;
    }

    return {
      nodeSize: block.nodeSize || 10
    };
  }
});

describe("pagination page-segment model", () => {
  it("문단 line split은 page continuation metadata를 남긴다", () => {
    const input = buildInputFromFixture(paragraphBoundaryReflowFixture);
    const plan = calculatePaginationPlan(input);
    const segmentModel = buildPaginationPageSegmentModel({
      input,
      plan,
      pageMetrics: input.pageMetrics,
      gapHeight: 50,
      viewPage: true
    });

    expect(plan.pageBreaks[0]).toMatchObject({
      pos: 35,
      kind: "textLine",
      reason: "overflow"
    });
    expect(plan.pages[0]).toMatchObject({
      pageNumber: 1,
      startBlockPos: 1,
      endBlockPos: 30,
      endsWithContinuation: true
    });
    expect(plan.pages[1]).toMatchObject({
      pageNumber: 2,
      startBlockPos: 30,
      startsWithContinuation: true
    });
    expect(segmentModel.pages[1]).toMatchObject({
      topLabel: "문단 이어짐 · 블록 2"
    });
    expect(segmentModel.pages[0].contentSegments.at(-1)).toMatchObject({
      continuesToNext: true
    });
    expect(segmentModel.pages[1].contentSegments[0]).toMatchObject({
      continuesFromPrevious: true,
      renderType: "textLine"
    });
  });

  it("리스트 line fill 결과는 page-segment model에도 continuation으로 반영된다", () => {
    const input = buildInputFromFixture(listItemSplitFixture);
    const plan = calculatePaginationPlan(input);
    const segmentModel = buildPaginationPageSegmentModel({
      input,
      plan,
      pageMetrics: input.pageMetrics,
      gapHeight: 50,
      viewPage: true
    });

    expect(plan.pages[0]).toMatchObject({
      pageNumber: 1,
      endBlockPos: 20,
      endsWithContinuation: true
    });
    expect(plan.pages[1]).toMatchObject({
      pageNumber: 2,
      startBlockPos: 20,
      startsWithContinuation: true
    });
    expect(segmentModel.pages[1]).toMatchObject({
      topLabel: "리스트 이어짐 · 블록 2"
    });
    expect(segmentModel.pages[0].bottomLabel).toBe("리스트 다음 페이지로 이어짐");
    expect(
      segmentModel.pages[0].contentSegments.find(
        (segment) => segment.renderType === "listLine"
      )
    ).toMatchObject({
      renderType: "listLine",
      showListMarker: true
    });
    expect(
      segmentModel.pages[1].contentSegments.find(
        (segment) => segment.renderType === "listLine"
      )
    ).toMatchObject({
      continuesFromPrevious: true,
      showListMarker: false
    });
  });

  it("병합 셀 row group은 통째로 넘기고 block page assignment도 단일 페이지로 유지한다", () => {
    const input = buildInputFromFixture(mergedTableRowGroupFixture);
    const plan = calculatePaginationPlan(input);
    const segmentModel = buildPaginationPageSegmentModel({
      input,
      plan,
      pageMetrics: input.pageMetrics,
      gapHeight: 50,
      viewPage: true
    });

    const tableAssignment = plan.blockPageAssignments.find(
      (assignment) => assignment.blockPos === 30
    );

    expect(plan.pageBreaks[0]).toMatchObject({
      pos: 30,
      kind: "block",
      reason: "tableMergedCellGroupKeptIntact"
    });
    expect(tableAssignment).toMatchObject({
      startPage: 2,
      endPage: 2,
      spansPages: false
    });
    expect(segmentModel.pages[1].contentSegments[0]).toMatchObject({
      renderType: "tableRow",
      isMergedTableRow: true,
      showMergedGroupBadge: true
    });
  });

  it("render decoration은 top-level block에 page metadata attrs를 붙인다", () => {
    const input = buildInputFromFixture(paragraphBoundaryReflowFixture);
    const plan = calculatePaginationPlan(input);
    const decorations = createPaginationDecorations({
      doc: createDocStub(input),
      plan,
      pageMetrics: input.pageMetrics,
      gapHeight: 50
    });
    const blockDecorations = decorations.filter(
      (decoration) => decoration.type?.attrs?.["data-pagination-start-page"]
    );

    expect(blockDecorations).toHaveLength(2);
    expect(blockDecorations[1].type.attrs).toMatchObject({
      "data-pagination-start-page": "1",
      "data-pagination-end-page": "2",
      "data-pagination-page-count": "2"
    });
  });

  it("page segment assignment는 페이지 내부 local top 순서를 유지한다", () => {
    const input = buildInputFromFixture(paragraphBoundaryReflowFixture);
    const plan = calculatePaginationPlan(input);
    const segmentModel = buildPaginationPageSegmentModel({
      input,
      plan,
      pageMetrics: input.pageMetrics,
      gapHeight: 50,
      viewPage: true
    });

    expect(plan.pages[0].segments.map((segment) => segment.pageLocalTop)).toEqual(
      [...plan.pages[0].segments.map((segment) => segment.pageLocalTop)].sort(
        (left, right) => left - right
      )
    );
    expect(plan.pages[1].segments[0].pageLocalTop).toBeGreaterThanOrEqual(0);
    expect(segmentModel.pages[0]).toMatchObject({
      contentRenderMode: "mirrorSlice",
      contentOffsetTop: spikePageMetrics.padding.top,
      contentOffsetLeft: spikePageMetrics.padding.left
    });
    expect(segmentModel.pages[1]).toMatchObject({
      contentOffsetTop:
        spikePageMetrics.pageHeightPx + 50 + spikePageMetrics.padding.top,
      contentOffsetLeft: spikePageMetrics.padding.left
    });
  });

  it("stable footnote reservation을 page-bottom frame metadata로 전달한다", () => {
    const input = buildInputFromFixture(paragraphBoundaryReflowFixture);
    const plan = calculatePaginationPlan(input);
    const pageMap = {
      ...plan.pageMap,
      footnoteLayout: {
        pages: [{
          pageNumber: 1,
          reservedHeight: 30,
          noteAreaOverhead: 18,
          bodyReservedHeight: 12,
          segments: [{ noteId: "note-v1-page", measuredHeight: 12 }]
        }],
        segments: []
      }
    };
    const segmentModel = buildPaginationPageSegmentModel({
      input,
      plan,
      pageMap,
      pageMetrics: input.pageMetrics,
      viewPage: true
    });

    expect(segmentModel.pages[0]).toMatchObject({
      footnoteReservedHeight: 30,
      footnoteChromeHeight: 18,
      footnoteBodyHeight: 12,
      mainFlowFrameHeight: segmentModel.contentAreaHeight - 30
    });
  });

  it("print css는 shell overlay를 숨기고 structural spacer 기반 break를 유지한다", () => {
    const css = fs.readFileSync(
      path.resolve(process.cwd(), "app/LIB/css/print-mode.css"),
      "utf8"
    );

    expect(css).toContain(".tiptap-page-shell-layer");
    expect(css).toContain("break-after: page !important");
    expect(css).toContain(".tiptap-pagination-aware-block");
    expect(css).toContain(".tiptap-table-row-too-tall");
    expect(css).toContain("--tiptap-table-row-visible-height");
    expect(css).toContain(
      '> .dockit-note-body[data-dockit-note-kind="footnote"]'
    );
    expect(css).toContain("position: static !important");
  });
});
