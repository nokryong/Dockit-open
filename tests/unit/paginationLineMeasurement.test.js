import { describe, expect, it } from "vitest";
import {
  mergeTextRectFragmentsIntoLines,
  resolveMeasuredLineSlots
} from "../../app/LIB/pagination/model/collectDomMeasurements";

describe("pagination line measurement", () => {
  it("line-height가 커지면 measured line slot도 그 높이를 반영한다", () => {
    const slots = resolveMeasuredLineSlots({
      rawLineFragments: [
        {
          top: 100,
          bottom: 118,
          left: 10,
          right: 110
        },
        {
          top: 140,
          bottom: 158,
          left: 10,
          right: 90
        }
      ],
      containerRect: {
        top: 90,
        bottom: 170
      },
      lineHeight: 40
    });

    expect(slots).toHaveLength(2);
    expect(slots[0].bottom - slots[0].top).toBeGreaterThanOrEqual(40);
    expect(slots[1].bottom - slots[1].top).toBeGreaterThanOrEqual(40);
    expect(slots[0].bottom).toBeLessThanOrEqual(slots[1].top);
  });

  it("페이지 사이의 큰 spacer gap을 한 줄 높이로 오인하지 않는다", () => {
    const slots = resolveMeasuredLineSlots({
      rawLineFragments: [
        {
          top: 100,
          bottom: 118,
          left: 10,
          right: 210
        },
        {
          top: 420,
          bottom: 438,
          left: 10,
          right: 160
        }
      ],
      containerRect: {
        top: 90,
        bottom: 450
      },
      lineHeight: 40
    });

    expect(slots).toHaveLength(2);
    expect(slots[0].bottom - slots[0].top).toBeLessThanOrEqual(42);
    expect(slots[1].bottom - slots[1].top).toBeLessThanOrEqual(42);
    expect(slots[1].top).toBeGreaterThanOrEqual(398);
    expect(slots[0].bottom).toBeLessThanOrEqual(140);
  });

  it("한 줄 안의 mixed font-size rect는 하나의 줄로 합치고 가장 큰 높이를 유지한다", () => {
    const lines = mergeTextRectFragmentsIntoLines([
      {
        top: 100,
        bottom: 116,
        left: 10,
        right: 80,
        lineHeight: 24,
        fontSize: 16
      },
      {
        top: 92,
        bottom: 128,
        left: 82,
        right: 140,
        lineHeight: 40,
        fontSize: 28
      }
    ]);

    expect(lines).toHaveLength(1);
    expect(lines[0].top).toBe(92);
    expect(lines[0].bottom).toBe(128);
    expect(lines[0].lineHeight).toBe(40);
    expect(lines[0].fontSize).toBe(28);
  });
});
