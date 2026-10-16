/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { buildPaginationInput } from "../../app/LIB/pagination/model/buildPaginationInput";
import { calculatePaginationPlan } from "../../app/LIB/pagination/layout/calculatePaginationPlan";
import {
  createPageBreakWidgetElement,
  createPageBreakHeaderWidgetElement,
  createPaginationSpacerStructure,
  createPaginationDecorations
} from "../../app/LIB/pagination/render/createPaginationDecorations";
import {
  createEditorStateStub,
  keepWithNextFixture,
  listItemSplitFixture,
  mergedTableRowGroupFixture,
  pageBreakBeforeFixture,
  spikePageMetrics,
  tableAllowRowSplitFixture,
  tableHeaderRepeatFixture
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

describe("pagination spike layout", () => {
  it("section/pageSettings 기반 input을 만들고 pageBreakBefore를 실제 break로 반영한다", () => {
    const input = buildInputFromFixture(pageBreakBeforeFixture);
    const plan = calculatePaginationPlan(input);

    expect(input.section.breakType).toBe("nextPage");
    expect(input.pageMetrics.pageHeightPx).toBeCloseTo(
      spikePageMetrics.pageHeightPx,
      1
    );
    expect(input.blocks[1].hints.pageBreakBefore).toBe(true);

    expect(plan.pageBreaks).toHaveLength(1);
    expect(plan.pageBreaks[0]).toMatchObject({
      pos: 20,
      reason: "pageBreakBefore",
      footerPageNumber: 1
    });
    expect(plan.debugDecisions).toContainEqual(
      expect.objectContaining({
        kind: "sectionBreak",
        sectionBreakType: "nextPage"
      })
    );
  });

  it("첫 미주 본문을 본문 다음 새 페이지에서 시작한다", () => {
    const noteId = "note-v1-endnote-next-page";
    const input = buildInputFromFixture({
      pmDoc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "본문" },
              { type: "noteReference", attrs: { noteId, kind: "endnote" } }
            ]
          },
          {
            type: "noteBody",
            attrs: { noteId, kind: "endnote" },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "미주 본문" }]
              }
            ]
          }
        ]
      },
      topLevelPositions: [1, 20],
      domModel: {
        blocks: [
          { pos: 1, type: "paragraph" },
          { pos: 20, type: "noteBody" }
        ],
        measurements: [
          {
            pos: 1,
            blockPos: 1,
            blockType: "paragraph",
            offsetHeight: 40,
            marginTop: 0,
            marginBottom: 0,
            extraLeft: 0,
            extraRight: 0,
            kind: "block"
          },
          {
            pos: 20,
            blockPos: 20,
            blockType: "noteBody",
            offsetHeight: 50,
            marginTop: 0,
            marginBottom: 0,
            extraLeft: 0,
            extraRight: 0,
            kind: "block"
          }
        ]
      }
    });
    const plan = calculatePaginationPlan(input);

    expect(input.blocks[1]).toMatchObject({
      nodeType: "noteBody",
      hints: { pageBreakBefore: true }
    });
    expect(plan.pageBreaks).toContainEqual(expect.objectContaining({
      pos: 20,
      reason: "pageBreakBefore",
      footerPageNumber: 1
    }));
    expect(plan.pages).toHaveLength(2);
    expect(plan.pages[0].blockPositions).toEqual([1]);
    expect(plan.pages[1].blockPositions).toEqual([20]);
  });

  it("keepWithNext가 제목과 다음 문단 묶음을 기준으로 break를 앞당긴다", () => {
    const input = buildInputFromFixture(keepWithNextFixture);
    const plan = calculatePaginationPlan(input);

    expect(input.blocks[1].hints.keepWithNext).toBe(true);
    expect(plan.pageBreaks).toHaveLength(1);
    expect(plan.pageBreaks[0]).toMatchObject({
      pos: 20,
      reason: "keepWithNext"
    });
  });

  it("리스트 아이템은 line 단위로 측정되면 남는 공간을 더 채우고 line 경계에서 나뉜다", () => {
    const input = buildInputFromFixture(listItemSplitFixture);
    const plan = calculatePaginationPlan(input);

    expect(
      input.measurements.filter(
        (measurement) => measurement.kind === "listLine"
      )
    ).toHaveLength(3);
    expect(plan.pageBreaks).toHaveLength(1);
    expect(plan.pageBreaks[0]).toMatchObject({
      pos: 27,
      kind: "listLine",
      reason: "overflow"
    });
  });

  it("병합 셀이 걸친 표 행 묶음은 allowRowSplit=true여도 통째로 다음 페이지로 넘긴다", () => {
    const input = buildInputFromFixture(mergedTableRowGroupFixture);
    const plan = calculatePaginationPlan(input);

    expect(input.blocks[1].hints.allowRowSplit).toBe(true);
    expect(input.measurements[1]).toMatchObject({
      tableRowHasMergedCells: true,
      tableRowGroupStartIndex: 0,
      tableRowGroupEndIndex: 1
    });
    expect(plan.pageBreaks).toHaveLength(1);
    expect(plan.pageBreaks[0]).toMatchObject({
      pos: 30,
      kind: "block",
      reason: "tableMergedCellGroupKeptIntact"
    });
  });

  it("allowRowSplit=true인 표는 현재 spike에서 fallback reason을 남긴다", () => {
    const input = buildInputFromFixture(tableAllowRowSplitFixture);
    const plan = calculatePaginationPlan(input);

    expect(input.blocks[1].hints.allowRowSplit).toBe(true);
    expect(plan.pageBreaks).toHaveLength(1);
    expect(plan.pageBreaks[0]).toMatchObject({
      pos: 39,
      reason: "tableRowSplitRequestedButFallback"
    });
  });

  it("페이지보다 큰 table row는 split 없이 tableRowTooTall fallback reason을 남긴다", () => {
    const pageMetrics = {
      width: 120,
      padding: {
        left: 0,
        right: 0
      }
    };
    const plan = calculatePaginationPlan({
      measurements: [
        {
          pos: 1,
          blockPos: 1,
          blockType: "paragraph",
          blockIndex: 0,
          measurementIndex: 0,
          offsetHeight: 40,
          renderWidth: 100,
          marginTop: 0,
          marginBottom: 0,
          extraLeft: 0,
          extraRight: 0,
          kind: "block"
        },
        {
          pos: 20,
          blockPos: 20,
          blockType: "table",
          blockIndex: 1,
          measurementIndex: 1,
          offsetHeight: 140,
          renderWidth: 100,
          marginTop: 0,
          marginBottom: 0,
          extraLeft: 0,
          extraRight: 0,
          kind: "tableRow",
          tableRowIndex: 0,
          tableColSpan: 2
        },
        {
          pos: 40,
          blockPos: 40,
          blockType: "paragraph",
          blockIndex: 2,
          measurementIndex: 2,
          offsetHeight: 20,
          renderWidth: 100,
          marginTop: 0,
          marginBottom: 0,
          extraLeft: 0,
          extraRight: 0,
          kind: "block"
        }
      ],
      contentAreaHeight: 100,
      pageMetrics,
      blocks: [
        { pos: 1, index: 0, nodeType: "paragraph" },
        { pos: 20, index: 1, nodeType: "table" },
        { pos: 40, index: 2, nodeType: "paragraph" }
      ]
    });

    expect(plan.pageBreaks[0]).toMatchObject({
      pos: 20,
      kind: "block",
      reason: "tableRowTooTall"
    });
    expect(plan.debugDecisions).toContainEqual(
      expect.objectContaining({
        pos: 20,
        reason: "tableRowTooTall",
        fallback: "keepRowIntact"
      })
    );
    expect(plan.pages.map((page) => page.measurementCount)).toEqual([1, 1, 1]);
    expect(plan.pages[1].segments[0]).toMatchObject({
      tableRowTooTall: true,
      tableRowTooTallKind: "row",
      tableRowTooTallMeasuredHeight: 140,
      tableRowTooTallClipHeight: 100
    });
    expect(plan.totalPages).toBe(3);

    const decorations = createPaginationDecorations({
      doc: {
        content: {
          size: 80
        },
        nodeAt(pos) {
          return pos === 20 ? { nodeSize: 5 } : null;
        }
      },
      plan,
      pageMetrics,
      gapHeight: 50
    });
    const rowDecoration = decorations.find(
      (decoration) =>
        decoration.type?.attrs?.["data-table-row-too-tall-reason"] ===
        "tableRowTooTall"
    );

    expect(rowDecoration?.type.attrs).toMatchObject({
      "data-table-row-too-tall-kind": "row",
      "data-table-row-too-tall-clip-height": "100"
    });
    expect(rowDecoration?.type.attrs.class).toContain(
      "tiptap-table-row-too-tall--clipped"
    );
    expect(rowDecoration?.type.attrs.style).toContain(
      "--tiptap-table-row-visible-height: 100px"
    );
  });

  it("페이지보다 큰 병합 row group은 tableRowTooTall로 묶음 유지하고 clip 높이를 나눠 가진다", () => {
    const plan = calculatePaginationPlan({
      measurements: [
        {
          pos: 1,
          blockPos: 1,
          blockType: "paragraph",
          blockIndex: 0,
          measurementIndex: 0,
          offsetHeight: 40,
          renderWidth: 100,
          marginTop: 0,
          marginBottom: 0,
          extraLeft: 0,
          extraRight: 0,
          kind: "block"
        },
        {
          pos: 20,
          blockPos: 20,
          blockType: "table",
          blockIndex: 1,
          measurementIndex: 1,
          offsetHeight: 70,
          renderWidth: 100,
          marginTop: 0,
          marginBottom: 0,
          extraLeft: 0,
          extraRight: 0,
          kind: "tableRow",
          tableRowIndex: 0,
          tableColSpan: 2,
          tableRowHasMergedCells: true,
          tableRowGroupId: "20:0-1",
          tableRowGroupStartIndex: 0,
          tableRowGroupEndIndex: 1,
          tableRowGroupHeight: 130
        },
        {
          pos: 30,
          blockPos: 20,
          blockType: "table",
          blockIndex: 1,
          measurementIndex: 2,
          offsetHeight: 60,
          renderWidth: 100,
          marginTop: 0,
          marginBottom: 0,
          extraLeft: 0,
          extraRight: 0,
          kind: "tableRow",
          tableRowIndex: 1,
          tableColSpan: 2,
          tableRowHasMergedCells: true,
          tableRowGroupId: "20:0-1",
          tableRowGroupStartIndex: 0,
          tableRowGroupEndIndex: 1,
          tableRowGroupHeight: 130
        },
        {
          pos: 50,
          blockPos: 50,
          blockType: "paragraph",
          blockIndex: 2,
          measurementIndex: 3,
          offsetHeight: 20,
          renderWidth: 100,
          marginTop: 0,
          marginBottom: 0,
          extraLeft: 0,
          extraRight: 0,
          kind: "block"
        }
      ],
      contentAreaHeight: 100,
      pageMetrics: {
        width: 120,
        padding: {
          left: 0,
          right: 0
        }
      },
      blocks: [
        { pos: 1, index: 0, nodeType: "paragraph" },
        { pos: 20, index: 1, nodeType: "table" },
        { pos: 50, index: 2, nodeType: "paragraph" }
      ]
    });

    expect(plan.pageBreaks[0]).toMatchObject({
      pos: 20,
      kind: "block",
      reason: "tableRowTooTall"
    });
    expect(plan.debugDecisions).toContainEqual(
      expect.objectContaining({
        pos: 20,
        reason: "tableRowTooTall",
        tooTallKind: "group",
        tableRowGroupId: "20:0-1",
        measuredHeight: 130
      })
    );
    expect(plan.pages.map((page) => page.measurementCount)).toEqual([1, 2, 1]);
    expect(plan.pages[1].segments).toMatchObject([
      {
        pos: 20,
        tableRowTooTall: true,
        tableRowTooTallKind: "group",
        tableRowTooTallGroupId: "20:0-1",
        tableRowTooTallMeasuredHeight: 130,
        tableRowTooTallClipHeight: 100
      },
      {
        pos: 30,
        tableRowTooTall: true,
        tableRowTooTallKind: "group",
        tableRowTooTallGroupId: "20:0-1",
        tableRowTooTallMeasuredHeight: 130,
        tableRowTooTallClipHeight: 30
      }
    ]);
  });

  it("pageBreakBefore와 keepWithNext 계산 결과는 render layer 축소 후에도 유지된다", () => {
    const input = buildInputFromFixture(pageBreakBeforeFixture);
    const plan = calculatePaginationPlan(input);
    const widget = createPageBreakWidgetElement({
      pageMetrics: input.pageMetrics,
      gapHeight: 50,
      fillerHeight: plan.pageBreaks[0].fillerHeight,
      marginLeft: plan.pageBreaks[0].marginLeft,
      marginRight: plan.pageBreaks[0].marginRight,
      kind: plan.pageBreaks[0].kind,
      tableColSpan: plan.pageBreaks[0].tableColSpan,
      includeHeader: false,
      structureClassName: "tiptap-page-break-structure--end"
    });
    const headerWidget = createPageBreakHeaderWidgetElement({
      pageMetrics: input.pageMetrics,
      marginLeft: plan.pageBreaks[0].marginLeft,
      marginRight: plan.pageBreaks[0].marginRight,
      kind: plan.pageBreaks[0].kind,
      tableColSpan: plan.pageBreaks[0].tableColSpan
    });
    const decorations = createPaginationDecorations({
      doc: {
        content: {
          size: 100
        }
      },
      plan,
      pageMetrics: input.pageMetrics,
      gapHeight: 50
    });

    expect(widget.querySelector(".page-gap")).not.toBeNull();
    expect(widget.querySelector(".page-number")).toBeNull();
    expect(widget.querySelector(".page-footer-spacer")).not.toBeNull();
    expect(widget.querySelector(".page-break-boundary")).not.toBeNull();
    expect(widget.querySelector(".page-header-spacer")).toBeNull();
    expect(
      widget.classList.contains("tiptap-page-break-structure--end")
    ).toBe(true);
    expect(headerWidget.querySelector(".page-footer-spacer")).toBeNull();
    expect(headerWidget.querySelector(".page-break-boundary")).toBeNull();
    expect(headerWidget.querySelector(".page-header-spacer")).not.toBeNull();
    expect(
      headerWidget.classList.contains("tiptap-page-break-structure--header")
    ).toBe(true);
    expect(decorations).toHaveLength(4);
  });

  it("print footer는 page number만 들고, page break는 별도 boundary가 담당한다", () => {
    const widget = createPageBreakWidgetElement({
      pageMetrics: spikePageMetrics,
      gapHeight: 50,
      fillerHeight: 24,
      marginLeft: 0,
      marginRight: 0,
      kind: "block",
      pageNumber: 2,
      pageNumberPosition: "right"
    });
    const footer = widget.querySelector(".page-footer-spacer");
    const boundary = widget.querySelector(".page-break-boundary");

    expect(footer?.getAttribute("data-print-break-after")).toBeNull();
    expect(footer?.getAttribute("data-page-number-position")).toBe("right");
    expect(footer?.getAttribute("data-page-number")).toBe("- 2 -");
    expect(boundary).not.toBeNull();
    expect(boundary?.classList.contains("page-break-boundary--terminal")).toBe(
      false
    );
  });

  it("table page break widget은 tr/td 자체 border와 배경을 만들지 않는다", () => {
    const widget = createPageBreakWidgetElement({
      pageMetrics: spikePageMetrics,
      gapHeight: 50,
      fillerHeight: 24,
      marginLeft: 0,
      marginRight: 0,
      kind: "tableRow",
      tableColSpan: 3,
      pageNumber: 2,
      pageNumberPosition: "center"
    });
    const cell = widget.querySelector(".tiptap-table-page-break-cell");

    expect(widget.tagName).toBe("TR");
    expect(cell?.tagName).toBe("TD");
    expect(cell?.colSpan).toBe(3);
    expect(widget.style.getPropertyValue("border")).toBe("0px");
    expect(widget.style.getPropertyPriority("border")).toBe("important");
    expect(cell?.style.getPropertyValue("border")).toBe("0px");
    expect(cell?.style.getPropertyPriority("border")).toBe("important");
    expect(cell?.style.getPropertyValue("background-color")).toBe(
      "transparent"
    );
    expect(cell?.style.getPropertyValue("height")).toBe("0px");
  });

  it("textLine page break도 end/header widget을 분리한 block 구조를 쓴다", () => {
    const endWidget = createPageBreakWidgetElement({
      pageMetrics: spikePageMetrics,
      gapHeight: 50,
      fillerHeight: 24,
      marginLeft: 0,
      marginRight: 0,
      kind: "textLine",
      pageNumber: 2,
      pageNumberPosition: "center",
      includeHeader: false,
      includePageBreakBoundary: true,
      structureClassName: "tiptap-page-break-structure--end"
    });
    const headerWidget = createPageBreakHeaderWidgetElement({
      pageMetrics: spikePageMetrics,
      marginLeft: 0,
      marginRight: 0,
      kind: "textLine"
    });
    const decorations = createPaginationDecorations({
      doc: {
        content: {
          size: 100
        }
      },
      plan: {
        pageBreaks: [
          {
            pos: 20,
            fillerHeight: 24,
            marginLeft: 0,
            marginRight: 0,
            kind: "textLine",
            footerPageNumber: 1
          }
        ],
        blockPageAssignments: [],
        finalFillerHeight: 18,
        totalPages: 2
      },
      pageMetrics: spikePageMetrics,
      gapHeight: 50
    });

    expect(endWidget.classList.contains("tiptap-inline-page-break")).toBe(false);
    expect(
      endWidget.classList.contains("tiptap-page-break-structure--end")
    ).toBe(true);
    expect(endWidget.querySelector(".page-footer-spacer")).not.toBeNull();
    expect(endWidget.querySelector(".page-break-boundary")).not.toBeNull();
    expect(endWidget.querySelector(".page-header-spacer")).toBeNull();
    expect(headerWidget.querySelector(".page-content-filler")).toBeNull();
    expect(headerWidget.querySelector(".page-footer-spacer")).toBeNull();
    expect(headerWidget.querySelector(".page-header-spacer")).not.toBeNull();
    expect(
      headerWidget.classList.contains("tiptap-page-break-structure--header")
    ).toBe(true);
    expect(decorations).toHaveLength(4);
  });

  it("screen footnote 예약 높이를 page break와 final filler에 포함한다", () => {
    const decorations = createPaginationDecorations({
      doc: {
        content: { size: 100 },
        nodeAt: () => null
      },
      plan: {
        pageBreaks: [{
          pos: 20,
          fillerHeight: 24,
          marginLeft: 0,
          marginRight: 0,
          kind: "textLine",
          footerPageNumber: 1
        }],
        blockPageAssignments: [],
        finalFillerHeight: 18,
        totalPages: 2,
        pages: [
          { pageNumber: 1, footnote: { reservedHeight: 30 } },
          { pageNumber: 2, footnote: { reservedHeight: 20 } }
        ],
        footnoteLayout: {
          pages: [
            { pageNumber: 1, reservedHeight: 30 },
            { pageNumber: 2, reservedHeight: 20 }
          ]
        }
      },
      pageMetrics: spikePageMetrics,
      gapHeight: 50
    });
    const widgetElements = decorations
      .map((decoration) => decoration.type?.toDOM)
      .filter((element) => element instanceof HTMLElement);
    const breakWidget = widgetElements.find((element) =>
      element.classList.contains("tiptap-page-break-structure--end")
    );
    const finalWidget = widgetElements.find((element) =>
      element.classList.contains("tiptap-page-break-structure--final")
    );

    expect(breakWidget?.querySelector(".page-content-filler")?.style.height)
      .toBe("54px");
    expect(finalWidget?.querySelector(".page-content-filler")?.style.height)
      .toBe("38px");
  });

  it("문서 시작 spacer와 마지막 footer는 빈 페이지를 만들지 않도록 구성된다", () => {
    const initialSpacer = createPaginationSpacerStructure({
      headerHeight: spikePageMetrics.padding.top,
      printHeaderHeight: spikePageMetrics.padding.top,
      includeContentFiller: false,
      includeFooter: false
    });
    const finalSpacer = createPaginationSpacerStructure({
      fillerHeight: 18,
      footerHeight: spikePageMetrics.padding.bottom,
      printFooterHeight: spikePageMetrics.padding.bottom,
      includeHeader: false,
      includePageBreakBoundary: false,
      footerBreakAfter: false,
      footerPageNumber: 3,
      pageNumberPosition: "center"
    });
    const finalFooter = finalSpacer.querySelector(".page-footer-spacer");
    const finalBoundary = finalSpacer.querySelector(".page-break-boundary");

    expect(initialSpacer.querySelector(".page-footer-spacer")).toBeNull();
    expect(
      initialSpacer.classList.contains("tiptap-page-break-structure--start")
    ).toBe(false);
    expect(finalFooter?.getAttribute("data-page-number")).toBe("- 3 -");
    expect(finalBoundary).toBeNull();
  });

  it("start/final spacer도 print 구조 식별 클래스를 가진다", () => {
    const initialSpacer = createPaginationSpacerStructure({
      headerHeight: spikePageMetrics.padding.top,
      printHeaderHeight: spikePageMetrics.padding.top,
      includeContentFiller: false,
      includeFooter: false,
      structureClassName: "tiptap-page-break-structure--start"
    });
    const finalSpacer = createPaginationSpacerStructure({
      fillerHeight: 18,
      footerHeight: spikePageMetrics.padding.bottom,
      printFooterHeight: spikePageMetrics.padding.bottom,
      includeHeader: false,
      includePageBreakBoundary: false,
      footerBreakAfter: false,
      footerPageNumber: 3,
      pageNumberPosition: "center",
      structureClassName: "tiptap-page-break-structure--final"
    });

    expect(
      initialSpacer.classList.contains("tiptap-page-break-structure--start")
    ).toBe(true);
    expect(
      finalSpacer.classList.contains("tiptap-page-break-structure--final")
    ).toBe(true);
  });

  it("headerRowRepeat 힌트가 있어도 이번 phase에서는 반복 헤더를 실제 break metadata로 쓰지 않는다", () => {
    const input = buildInputFromFixture(tableHeaderRepeatFixture);
    const plan = calculatePaginationPlan(input);

    expect(input.blocks[1].hints.headerRowRepeat).toBe(true);
    expect(plan.pageBreaks).toHaveLength(1);
    expect(plan.pageBreaks[0]).toMatchObject({
      pos: 39,
      reason: "tableRowKeptIntact",
      repeatedHeaderHeight: 0,
      repeatedHeaderHtml: ""
    });
  });
});
