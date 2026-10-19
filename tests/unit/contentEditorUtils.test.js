import { describe, expect, it, vi } from "vitest";
import {
  getHoveredAnchorWithinEditor,
  isReadOnlyObjectTarget,
  isTextRangeSelection,
  resolveSelectionObjectAction,
  shouldBlockTextEditing,
  shouldCollapseTextSelectionOnMouseDown,
  shouldHideHoveredLinkPreview,
  shouldHandleReadOnlyObjectPointer,
  shouldPreserveSelectedObject
} from "../../app/LIB/utils/contentEditorUtils";

describe("contentEditorUtils", () => {
  describe("isTextRangeSelection", () => {
    it("returns true for plain text range selection", () => {
      expect(
        isTextRangeSelection({
          isEmpty: false,
          hasNodeSelection: false,
          isCellSelection: false
        })
      ).toBe(true);
    });

    it("returns false for node selection or cell selection", () => {
      expect(
        isTextRangeSelection({
          isEmpty: false,
          hasNodeSelection: true,
          isCellSelection: false
        })
      ).toBe(false);

      expect(
        isTextRangeSelection({
          isEmpty: false,
          hasNodeSelection: false,
          isCellSelection: true
        })
      ).toBe(false);
    });
  });

  describe("resolveSelectionObjectAction", () => {
    it("clears selection in read-only mode", () => {
      expect(
        resolveSelectionObjectAction({
          isEditable: false,
          targetInfo: { type: "chartBlock", from: 10 },
          hasTextRangeSelection: false,
          activeElementTagName: "DIV",
          previousSelectedObject: { from: 10 }
        })
      ).toEqual({ action: "clear" });
    });

    it("keeps previous object while focus is in input/select", () => {
      const previousSelectedObject = { type: "shapeBlock", from: 12 };

      expect(
        resolveSelectionObjectAction({
          isEditable: true,
          targetInfo: null,
          hasTextRangeSelection: false,
          activeElementTagName: "INPUT",
          previousSelectedObject
        })
      ).toEqual({ action: "keep", value: previousSelectedObject });
    });

    it("clears object selection when table text range is active", () => {
      expect(
        resolveSelectionObjectAction({
          isEditable: true,
          targetInfo: { type: "table", from: 20 },
          hasTextRangeSelection: true,
          activeElementTagName: "DIV",
          previousSelectedObject: null
        })
      ).toEqual({ action: "clear" });

      expect(
        resolveSelectionObjectAction({
          isEditable: true,
          targetInfo: { type: "tableCell", from: 22 },
          hasTextRangeSelection: true,
          activeElementTagName: "DIV",
          previousSelectedObject: null
        })
      ).toEqual({ action: "clear" });
    });

    it("requires double click types to be explicitly selected first", () => {
      expect(
        resolveSelectionObjectAction({
          isEditable: true,
          targetInfo: { type: "image", from: 30 },
          hasTextRangeSelection: false,
          activeElementTagName: "DIV",
          previousSelectedObject: null
        })
      ).toEqual({ action: "clear" });
    });

    it("keeps the same double click object selected", () => {
      const previousSelectedObject = { type: "shapeBlock", from: 40 };

      expect(
        resolveSelectionObjectAction({
          isEditable: true,
          targetInfo: { type: "shapeBlock", from: 40 },
          hasTextRangeSelection: false,
          activeElementTagName: "DIV",
          previousSelectedObject
        })
      ).toEqual({ action: "keep", value: previousSelectedObject });
    });

    it("selects immediate panel objects directly", () => {
      const targetInfo = { type: "chartBlock", from: 50, to: 60 };

      expect(
        resolveSelectionObjectAction({
          isEditable: true,
          targetInfo,
          hasTextRangeSelection: false,
          activeElementTagName: "DIV",
          previousSelectedObject: null
        })
      ).toEqual({ action: "select", value: targetInfo });
    });
  });

  describe("read-only object targeting", () => {
    it("matches read-only objects only when the root contains the match", () => {
      const matchedElement = {};
      const target = {
        closest: vi.fn(() => matchedElement)
      };
      const rootElement = {
        contains: vi.fn((node) => node === matchedElement)
      };

      expect(isReadOnlyObjectTarget(target, rootElement)).toBe(true);
      expect(target.closest).toHaveBeenCalled();
    });

    it("returns false when target cannot be resolved to an inert object", () => {
      const target = {
        closest: vi.fn(() => null)
      };
      const rootElement = {
        contains: vi.fn(() => false)
      };

      expect(isReadOnlyObjectTarget(target, rootElement)).toBe(false);
    });

    it("keeps shape containers outside the inert read-only object selector", () => {
      const target = {
        closest: vi.fn((selector) =>
          selector.includes(".shape-block-container") ? {} : null
        )
      };
      const rootElement = {
        contains: vi.fn(() => true)
      };

      expect(isReadOnlyObjectTarget(target, rootElement)).toBe(false);
    });

    it("intercepts pointer events only for read-only inert objects", () => {
      expect(
        shouldHandleReadOnlyObjectPointer({
          isEditable: false,
          hasEditorDom: true,
          isTargetingReadOnlyObject: true
        })
      ).toBe(true);

      expect(
        shouldHandleReadOnlyObjectPointer({
          isEditable: true,
          hasEditorDom: true,
          isTargetingReadOnlyObject: true
        })
      ).toBe(false);
    });

    it("does not intercept read-only text targets such as tables or shape text", () => {
      expect(
        shouldHandleReadOnlyObjectPointer({
          isEditable: false,
          hasEditorDom: true,
          isTargetingReadOnlyObject: false
        })
      ).toBe(false);
    });
  });

  describe("hovered link preview policy", () => {
    it("returns hovered anchor only when it belongs to the editor", () => {
      const anchorElement = {};
      const eventTarget = {
        closest: vi.fn(() => anchorElement)
      };
      const editorDom = {
        contains: vi.fn((node) => node === anchorElement)
      };

      expect(getHoveredAnchorWithinEditor(eventTarget, editorDom)).toBe(
        anchorElement
      );
      expect(getHoveredAnchorWithinEditor(null, editorDom)).toBeNull();
    });

    it("hides hovered preview only when leaving the active anchor", () => {
      const anchorElement = {
        contains: vi.fn((node) => node === "inside")
      };

      expect(
        shouldHideHoveredLinkPreview({
          anchorElement,
          relatedTarget: null,
          activeHoveredAnchor: anchorElement
        })
      ).toBe(true);

      expect(
        shouldHideHoveredLinkPreview({
          anchorElement,
          relatedTarget: "inside",
          activeHoveredAnchor: anchorElement
        })
      ).toBe(false);

      expect(
        shouldHideHoveredLinkPreview({
          anchorElement,
          relatedTarget: null,
          activeHoveredAnchor: {}
        })
      ).toBe(false);
    });
  });

  describe("text editing blocking", () => {
    it("blocks text editing only for configured object types", () => {
      expect(
        shouldBlockTextEditing({
          isEditable: true,
          selectedObjectType: "image"
        })
      ).toBe(true);

      expect(
        shouldBlockTextEditing({
          isEditable: true,
          selectedObjectType: "chartBlock"
        })
      ).toBe(false);
    });

    it("preserves object selection only for input/select elements", () => {
      expect(shouldPreserveSelectedObject("INPUT")).toBe(true);
      expect(shouldPreserveSelectedObject("SELECT")).toBe(true);
      expect(shouldPreserveSelectedObject("DIV")).toBe(false);
    });
  });

  describe("text selection collapse policy", () => {
    const baseEvent = {
      isEditable: true,
      hasEditorDom: true,
      isPrimaryButton: true,
      hasModifierKey: false,
      selectionEmpty: false,
      hasNodeSelection: false,
      isCellSelection: false,
      clickPos: 12,
      selectionFrom: 10,
      selectionTo: 20,
      targetTagName: "SPAN"
    };

    it("collapses a plain text range when the click lands inside it", () => {
      expect(shouldCollapseTextSelectionOnMouseDown(baseEvent)).toBe(true);
    });

    it("does not collapse when the click is outside the selected range", () => {
      expect(
        shouldCollapseTextSelectionOnMouseDown({
          ...baseEvent,
          clickPos: 21
        })
      ).toBe(false);
    });

    it("does not collapse object or cell selections", () => {
      expect(
        shouldCollapseTextSelectionOnMouseDown({
          ...baseEvent,
          hasNodeSelection: true
        })
      ).toBe(false);

      expect(
        shouldCollapseTextSelectionOnMouseDown({
          ...baseEvent,
          isCellSelection: true
        })
      ).toBe(false);
    });

    it("does not collapse modified clicks or form controls", () => {
      expect(
        shouldCollapseTextSelectionOnMouseDown({
          ...baseEvent,
          hasModifierKey: true
        })
      ).toBe(false);

      expect(
        shouldCollapseTextSelectionOnMouseDown({
          ...baseEvent,
          targetTagName: "input"
        })
      ).toBe(false);
    });
  });
});
