import { describe, expect, it } from "vitest";
import { buildPaginationInput } from "../../app/LIB/pagination/model/buildPaginationInput";
import { getPageMapPage } from "../../app/LIB/pagination/model/buildPaginationPageMap";
import { calculatePaginationPlan } from "../../app/LIB/pagination/layout/calculatePaginationPlan";
import { buildPaginationPageSegmentModel } from "../../app/LIB/pagination/render/buildPaginationPageSegmentModel";
import {
  createEditorStateStub,
  paragraphBoundaryReflowFixture,
  spikePageMetrics
} from "./fixtures/paginationSpikeFixtures";
import { pageMapRegressionFixtures } from "./fixtures/paginationPageMapFixtures";

const buildInputFromFixture = (fixture) =>
  buildPaginationInput({
    editorState: createEditorStateStub(
      fixture.pmDoc,
      fixture.topLevelPositions
    ),
    pageMetrics: spikePageMetrics,
    domModel: fixture.domModel
  });

const summarizePage = (page) => ({
  pageNumber: page.pageNumber,
  startPos: page.startPos,
  endPos: page.endPos,
  startBlockPos: page.startBlockPos,
  endBlockPos: page.endBlockPos,
  breakReason: page.breakReason,
  startsWithContinuation: page.startsWithContinuation,
  endsWithContinuation: page.endsWithContinuation,
  segmentKinds: page.segments.map((segment) => segment.kind),
  mergedRowSegments: page.segments
    .filter((segment) => segment.tableRowHasMergedCells)
    .map((segment) => ({
      pos: segment.pos,
      tableRowGroupId: segment.tableRowGroupId,
      tableRowGroupStartIndex: segment.tableRowGroupStartIndex,
      tableRowGroupEndIndex: segment.tableRowGroupEndIndex
    })),
  tooTallSegments: page.segments
    .filter((segment) => segment.tableRowTooTall)
    .map((segment) => ({
      pos: segment.pos,
      tableRowTooTallKind: segment.tableRowTooTallKind,
      tableRowTooTallGroupId: segment.tableRowTooTallGroupId
    }))
});

const summarizePageBreak = (pageBreak) => ({
  pos: pageBreak.pos,
  kind: pageBreak.kind,
  reason: pageBreak.reason
});

const summarizeBlockPageAssignment = (assignment) => ({
  blockPos: assignment.blockPos,
  startPage: assignment.startPage,
  endPage: assignment.endPage,
  pageCount: assignment.pageCount,
  spansPages: assignment.spansPages
});

describe("pagination PageMap v1", () => {
  it("calculatePaginationPlan 결과에 readonly PageMap을 함께 싣는다", () => {
    const input = buildInputFromFixture(paragraphBoundaryReflowFixture);
    const plan = calculatePaginationPlan(input);
    const pageMap = plan.pageMap;

    expect(pageMap).toMatchObject({
      version: 1,
      totalPages: plan.totalPages,
      pageCount: plan.pages.length
    });
    expect(Object.isFrozen(pageMap)).toBe(true);
    expect(Object.isFrozen(pageMap.pages)).toBe(true);
    expect(Object.isFrozen(pageMap.pages[0])).toBe(true);
    expect(Object.isFrozen(pageMap.pages[0].segments)).toBe(true);
    expect(Object.isFrozen(pageMap.pages[0].segments[0])).toBe(true);
    expect(getPageMapPage(pageMap, 1)).toBe(pageMap.pages[0]);
    expect(pageMap.pages[0]).toMatchObject({
      pageNumber: plan.pages[0].pageNumber,
      startPos: plan.pages[0].startPos,
      endPos: plan.pages[0].endPos,
      startBlockPos: plan.pages[0].startBlockPos,
      endBlockPos: plan.pages[0].endBlockPos,
      breakReason: plan.pages[0].breakReason
    });
  });

  it("page shell segment model은 PageMap을 우선 참조해 기존 page metadata를 유지한다", () => {
    const input = buildInputFromFixture(paragraphBoundaryReflowFixture);
    const plan = calculatePaginationPlan(input);
    const segmentModel = buildPaginationPageSegmentModel({
      input,
      plan: {
        ...plan,
        pages: [],
        blockPageAssignments: []
      },
      pageMap: plan.pageMap,
      pageMetrics: input.pageMetrics,
      gapHeight: 50,
      viewPage: true
    });

    expect(segmentModel.pageMapVersion).toBe(1);
    expect(segmentModel.pages[0]).toMatchObject({
      startPos: plan.pages[0].startPos,
      endPos: plan.pages[0].endPos,
      breakReason: plan.pages[0].breakReason,
      endsWithContinuation: true
    });
    expect(segmentModel.pages[1]).toMatchObject({
      startsWithContinuation: true,
      topLabel: "문단 이어짐 · 블록 2"
    });
    expect(segmentModel.pages[1].contentSegments[0]).toMatchObject({
      renderType: "textLine",
      continuesFromPrevious: true
    });
  });

  it.each(pageMapRegressionFixtures)(
    "$name fixture의 PageMap 핵심 경계를 고정한다",
    (fixture) => {
      const input = buildInputFromFixture(fixture);
      const plan = calculatePaginationPlan(input);
      const pageMap = plan.pageMap;

      expect(pageMap.totalPages).toBe(fixture.expectedPageMap.totalPages);
      expect(pageMap.pages.map(summarizePage)).toEqual(
        fixture.expectedPageMap.pages
      );
      expect(pageMap.pageBreaks.map(summarizePageBreak)).toEqual(
        fixture.expectedPageMap.pageBreaks
      );
      expect(
        pageMap.blockPageAssignments.map(summarizeBlockPageAssignment)
      ).toEqual(fixture.expectedPageMap.blockPageAssignments);
    }
  );
});
