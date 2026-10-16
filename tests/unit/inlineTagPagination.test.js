import { describe, expect, it } from "vitest";
import { calculatePaginationPlan } from "../../app/LIB/pagination/layout/calculatePaginationPlan";

const pageMetrics = {
  width: 120,
  padding: {
    left: 0,
    right: 0
  }
};

const createMeasurement = (overrides) => ({
  pos: overrides.pos,
  blockPos: 0,
  blockType: "paragraph",
  blockIndex: 0,
  measurementIndex: overrides.measurementIndex,
  offsetHeight: overrides.offsetHeight,
  renderWidth: 100,
  marginTop: 0,
  marginBottom: 0,
  extraLeft: 0,
  extraRight: 0,
  kind: "textLine",
  ...overrides
});

const createInlineTagGroup = (overrides) => ({
  inlineTagId: "tag-a",
  inlineTagStartPos: 2,
  inlineTagEndPos: 20,
  inlineTagTextLength: 18,
  inlineTagLineCount: 2,
  inlineTagGroupMeasurementCount: 2,
  inlineTagGroupHeight: 40,
  inlineTagGroupFirstMarginTop: 0,
  inlineTagGroupLastMarginBottom: 0,
  inlineTagGroupTooTall: false,
  ...overrides
});

describe("calculatePaginationPlan inline tag boundaries", () => {
  it("moves a multi-line inline tag to the next page before it can split", () => {
    const plan = calculatePaginationPlan({
      measurements: [
        createMeasurement({
          pos: 1,
          measurementIndex: 0,
          offsetHeight: 70
        }),
        createMeasurement({
          pos: 2,
          measurementIndex: 1,
          offsetHeight: 20,
          inlineTagGroups: [
            createInlineTagGroup({
              inlineTagLineIndex: 0,
              inlineTagIsFirstLine: true,
              inlineTagIsLastLine: false
            })
          ]
        }),
        createMeasurement({
          pos: 3,
          measurementIndex: 2,
          offsetHeight: 20,
          inlineTagGroups: [
            createInlineTagGroup({
              inlineTagLineIndex: 1,
              inlineTagIsFirstLine: false,
              inlineTagIsLastLine: true
            })
          ]
        })
      ],
      contentAreaHeight: 100,
      pageMetrics,
      blocks: [{ pos: 0, index: 0, nodeType: "paragraph" }]
    });

    expect(plan.pageBreaks[0]).toMatchObject({
      pos: 2,
      reason: "inlineTagKeptIntact"
    });
    expect(plan.pages[0].endPos).toBe(1);
    expect(plan.pages[1].startPos).toBe(2);
    expect(plan.totalPages).toBe(2);
  });

  it("falls back to normal line pagination when an inline tag is taller than a page", () => {
    const oversizedGroup = {
      inlineTagLineCount: 3,
      inlineTagGroupMeasurementCount: 3,
      inlineTagGroupHeight: 60,
      inlineTagGroupTooTall: true
    };
    const plan = calculatePaginationPlan({
      measurements: [
        createMeasurement({
          pos: 1,
          measurementIndex: 0,
          offsetHeight: 10
        }),
        createMeasurement({
          pos: 2,
          measurementIndex: 1,
          offsetHeight: 20,
          inlineTagGroups: [
            createInlineTagGroup({
              ...oversizedGroup,
              inlineTagLineIndex: 0,
              inlineTagIsFirstLine: true,
              inlineTagIsLastLine: false
            })
          ]
        }),
        createMeasurement({
          pos: 3,
          measurementIndex: 2,
          offsetHeight: 20,
          inlineTagGroups: [
            createInlineTagGroup({
              ...oversizedGroup,
              inlineTagLineIndex: 1,
              inlineTagIsFirstLine: false,
              inlineTagIsLastLine: false
            })
          ]
        }),
        createMeasurement({
          pos: 4,
          measurementIndex: 3,
          offsetHeight: 20,
          inlineTagGroups: [
            createInlineTagGroup({
              ...oversizedGroup,
              inlineTagLineIndex: 2,
              inlineTagIsFirstLine: false,
              inlineTagIsLastLine: true
            })
          ]
        })
      ],
      contentAreaHeight: 50,
      pageMetrics,
      blocks: [{ pos: 0, index: 0, nodeType: "paragraph" }]
    });

    expect(plan.debugDecisions).not.toContainEqual(
      expect.objectContaining({ reason: "inlineTagKeptIntact" })
    );
    expect(plan.pageBreaks[0]).toMatchObject({
      pos: 4,
      reason: "overflow"
    });
    expect(plan.totalPages).toBe(2);
  });
});
