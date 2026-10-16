import { describe, expect, it } from "vitest";
import {
  calculateCollapsedNodeHeight,
  calculatePaginationLayout,
  getContentAreaHeight,
  getHorizontalOffsetsFromRects,
  getPageNumberBottomOffset,
  getPageNumberJustify,
  isInjectedPaginationElement,
  parsePixelValue
} from "../../app/LIB/extensions/utils/paginationUtils";

describe("paginationUtils", () => {
  it("parses pixel values safely", () => {
    expect(parsePixelValue("12.5px")).toBe(12.5);
    expect(parsePixelValue("abc")).toBe(0);
  });

  it("detects injected pagination elements by class name", () => {
    const element = {
      classList: {
        contains: (className) => className === "page-gap"
      }
    };

    expect(isInjectedPaginationElement(element)).toBe(true);
    expect(isInjectedPaginationElement(null)).toBe(false);
  });

  it("normalizes horizontal offsets with layout scaling", () => {
    expect(
      getHorizontalOffsetsFromRects({
        rect: { left: 120, right: 300 },
        referenceRect: { left: 100, right: 340, width: 240 },
        rootLayoutWidth: 120
      })
    ).toEqual({
      extraLeft: 10,
      extraRight: 20
    });
  });

  it("computes content area height from page metrics", () => {
    expect(
      getContentAreaHeight({
        pageHeightPx: 1000,
        padding: { top: 80, bottom: 60 }
      })
    ).toBe(860);
  });

  it("resolves page number placement metadata", () => {
    expect(getPageNumberJustify("left")).toBe("flex-start");
    expect(getPageNumberJustify("center")).toBe("center");
    expect(getPageNumberJustify("right")).toBe("flex-end");
    expect(getPageNumberJustify("unknown")).toBe("center");
    expect(
      getPageNumberBottomOffset({
        padding: { bottom: 30 }
      })
    ).toBe(9);
  });

  it("calculates collapsed node height using previous bottom margin", () => {
    expect(
      calculateCollapsedNodeHeight({
        offsetHeight: 100,
        marginTop: 20,
        marginBottom: 10,
        previousMarginBottom: 8
      })
    ).toBe(122);
  });

  it("builds page breaks while preserving page numbers and filler sizes", () => {
    const layout = calculatePaginationLayout(
      [
        {
          pos: 1,
          offsetHeight: 180,
          marginTop: 10,
          marginBottom: 10,
          extraLeft: 0,
          extraRight: 0,
          kind: "block"
        },
        {
          pos: 20,
          offsetHeight: 190,
          marginTop: 10,
          marginBottom: 10,
          extraLeft: 12,
          extraRight: 4,
          kind: "tableRow",
          tableColSpan: 3
        }
      ],
      250
    );

    expect(layout.pageBreaks).toEqual([
      {
        pos: 20,
        fillerHeight: 50,
        marginLeft: -12,
        marginRight: -4,
        kind: "tableRow",
        tableColSpan: 3,
        footerPageNumber: 1
      }
    ]);
    expect(layout.finalFillerHeight).toBe(40);
    expect(layout.totalPages).toBe(2);
  });

  it("does not break before the first oversized block", () => {
    const layout = calculatePaginationLayout(
      [
        {
          pos: 1,
          offsetHeight: 320,
          marginTop: 20,
          marginBottom: 20,
          extraLeft: 0,
          extraRight: 0,
          kind: "block"
        }
      ],
      250
    );

    expect(layout.pageBreaks).toHaveLength(0);
    expect(layout.finalFillerHeight).toBe(0);
    expect(layout.totalPages).toBe(1);
  });

  it("preserves inline line-break kinds when a paragraph or code line crosses a page", () => {
    const layout = calculatePaginationLayout(
      [
        {
          pos: 5,
          offsetHeight: 90,
          marginTop: 10,
          marginBottom: 0,
          extraLeft: 0,
          extraRight: 0,
          kind: "textLine"
        },
        {
          pos: 8,
          offsetHeight: 90,
          marginTop: 0,
          marginBottom: 10,
          extraLeft: 0,
          extraRight: 0,
          kind: "textLine"
        },
        {
          pos: 20,
          offsetHeight: 110,
          marginTop: 10,
          marginBottom: 10,
          extraLeft: 6,
          extraRight: 2,
          kind: "codeLine"
        }
      ],
      180
    );

    expect(layout.pageBreaks).toEqual([
      {
        pos: 8,
        fillerHeight: 80,
        marginLeft: -0,
        marginRight: -0,
        kind: "textLine",
        tableColSpan: undefined,
        footerPageNumber: 1
      },
      {
        pos: 20,
        fillerHeight: 80,
        marginLeft: -6,
        marginRight: -2,
        kind: "codeLine",
        tableColSpan: undefined,
        footerPageNumber: 2
      }
    ]);
    expect(layout.totalPages).toBe(3);
  });
});
