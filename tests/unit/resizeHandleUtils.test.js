import { describe, expect, it } from "vitest";
import { getObjectSelectionVisibility } from "../../app/LIB/extensions/utils/resizeHandleUtils";

const createEditor = ({ isEditable = true, isReadOnlyContainer = false } = {}) => ({
  isEditable,
  view: {
    dom: {
      closest: (selector) =>
        selector === ".tiptap-container.is-readonly" && isReadOnlyContainer
          ? {}
          : null
    }
  }
});

describe("resizeHandleUtils", () => {
  describe("getObjectSelectionVisibility", () => {
    it("keeps selection chrome visible while object selection disables text editing", () => {
      expect(
        getObjectSelectionVisibility({
          editor: createEditor({ isEditable: false }),
          selected: true
        })
      ).toEqual({
        canInteract: true,
        showSelectionChrome: true
      });
    });

    it("does not show selection chrome without an active object interaction", () => {
      expect(
        getObjectSelectionVisibility({
          editor: createEditor({ isEditable: true }),
          selected: false
        })
      ).toEqual({
        canInteract: true,
        showSelectionChrome: false
      });
    });

    it("keeps object chrome hidden in read-only document views", () => {
      expect(
        getObjectSelectionVisibility({
          editor: createEditor({
            isEditable: false,
            isReadOnlyContainer: true
          }),
          selected: true
        })
      ).toEqual({
        canInteract: false,
        showSelectionChrome: false
      });
    });
  });
});
