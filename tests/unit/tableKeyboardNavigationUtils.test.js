import { describe, expect, it } from "vitest";
import {
  getNextTableCellPoint,
  getTableCellArrowDirection,
  shouldHandleTableCellArrowEvent
} from "../../app/LIB/utils/tableKeyboardNavigationUtils";

describe("tableKeyboardNavigationUtils", () => {
  describe("getTableCellArrowDirection", () => {
    it("maps arrow keys to table directions", () => {
      expect(getTableCellArrowDirection("ArrowLeft")).toBe("left");
      expect(getTableCellArrowDirection("ArrowRight")).toBe("right");
      expect(getTableCellArrowDirection("ArrowUp")).toBe("up");
      expect(getTableCellArrowDirection("ArrowDown")).toBe("down");
    });

    it("returns null for non-arrow keys", () => {
      expect(getTableCellArrowDirection("Enter")).toBeNull();
    });
  });

  describe("shouldHandleTableCellArrowEvent", () => {
    it("handles plain arrows and shift arrows", () => {
      expect(
        shouldHandleTableCellArrowEvent({
          key: "ArrowRight",
          shiftKey: false,
          ctrlKey: false,
          altKey: false,
          metaKey: false
        })
      ).toBe(true);

      expect(
        shouldHandleTableCellArrowEvent({
          key: "ArrowRight",
          shiftKey: true,
          ctrlKey: false,
          altKey: false,
          metaKey: false
        })
      ).toBe(true);
    });

    it("leaves modified arrows for other table shortcuts or browser behavior", () => {
      expect(
        shouldHandleTableCellArrowEvent({
          key: "ArrowRight",
          shiftKey: false,
          ctrlKey: true,
          altKey: false,
          metaKey: false
        })
      ).toBe(false);

      expect(
        shouldHandleTableCellArrowEvent({
          key: "ArrowLeft",
          shiftKey: false,
          ctrlKey: false,
          altKey: true,
          metaKey: false
        })
      ).toBe(false);
    });
  });

  describe("getNextTableCellPoint", () => {
    const tableSize = { tableWidth: 4, tableHeight: 3 };

    it("moves from a single cell by direction", () => {
      const rect = { left: 1, right: 2, top: 1, bottom: 2 };

      expect(
        getNextTableCellPoint({ rect, direction: "left", ...tableSize })
      ).toEqual({ row: 1, col: 0 });
      expect(
        getNextTableCellPoint({ rect, direction: "right", ...tableSize })
      ).toEqual({ row: 1, col: 2 });
      expect(
        getNextTableCellPoint({ rect, direction: "up", ...tableSize })
      ).toEqual({ row: 0, col: 1 });
      expect(
        getNextTableCellPoint({ rect, direction: "down", ...tableSize })
      ).toEqual({ row: 2, col: 1 });
    });

    it("steps outside merged cell bounds instead of inside the same cell", () => {
      const rect = { left: 1, right: 3, top: 0, bottom: 2 };

      expect(
        getNextTableCellPoint({ rect, direction: "right", ...tableSize })
      ).toEqual({ row: 0, col: 3 });
      expect(
        getNextTableCellPoint({ rect, direction: "down", ...tableSize })
      ).toEqual({ row: 2, col: 1 });
    });

    it("returns null at table edges", () => {
      expect(
        getNextTableCellPoint({
          rect: { left: 0, right: 1, top: 0, bottom: 1 },
          direction: "left",
          ...tableSize
        })
      ).toBeNull();

      expect(
        getNextTableCellPoint({
          rect: { left: 3, right: 4, top: 2, bottom: 3 },
          direction: "down",
          ...tableSize
        })
      ).toBeNull();
    });
  });
});
