import { describe, expect, it } from "vitest";
import {
  extendWorkspaceItemSelection,
  getWorkspaceShortcutAction,
  mergeUniqueWorkspaceItems,
  toggleWorkspaceItemSelection
} from "../../app/docs/utils/workspaceSelectionUtils";

const createItem = (id) => ({
  _id: id,
  title: `item-${id}`
});

describe("workspaceSelectionUtils", () => {
  it("toggles a single workspace item in the selection", () => {
    const firstItem = createItem("1");
    const secondItem = createItem("2");

    expect(toggleWorkspaceItemSelection([], firstItem)).toEqual([firstItem]);
    expect(
      toggleWorkspaceItemSelection([firstItem, secondItem], firstItem)
    ).toEqual([secondItem]);
  });

  it("extends a range selection without duplicating existing items", () => {
    const allItems = ["1", "2", "3", "4"].map(createItem);

    expect(
      extendWorkspaceItemSelection({
        selectedItems: [allItems[0]],
        allItems,
        lastSelectedIndex: 0,
        itemIndex: 2
      })
    ).toEqual([allItems[0], allItems[1], allItems[2]]);
  });

  it("merges dragged selections by unique item id", () => {
    const firstItem = createItem("1");
    const secondItem = createItem("2");

    expect(
      mergeUniqueWorkspaceItems([firstItem], [firstItem, secondItem])
    ).toEqual([firstItem, secondItem]);
  });

  it("blocks workspace shortcuts while a modal is open or an input is focused", () => {
    expect(
      getWorkspaceShortcutAction({
        event: {
          key: "a",
          ctrlKey: true,
          metaKey: false,
          target: { tagName: "INPUT" }
        },
        modalsOpen: false,
        contextMenuVisible: false,
        hasSelection: true
      })
    ).toBeNull();

    expect(
      getWorkspaceShortcutAction({
        event: {
          key: "Delete",
          ctrlKey: false,
          metaKey: false,
          target: { tagName: "DIV" }
        },
        modalsOpen: true,
        contextMenuVisible: false,
        hasSelection: true
      })
    ).toBeNull();
  });

  it("maps supported workspace shortcuts to actions", () => {
    expect(
      getWorkspaceShortcutAction({
        event: {
          key: "a",
          ctrlKey: true,
          metaKey: false,
          target: { tagName: "DIV" }
        },
        modalsOpen: false,
        contextMenuVisible: false,
        hasSelection: false
      })
    ).toBe("selectAll");

    expect(
      getWorkspaceShortcutAction({
        event: {
          key: "Escape",
          ctrlKey: false,
          metaKey: false,
          target: { tagName: "DIV" }
        },
        modalsOpen: false,
        contextMenuVisible: false,
        hasSelection: true
      })
    ).toBe("clear");

    expect(
      getWorkspaceShortcutAction({
        event: {
          key: "Delete",
          ctrlKey: false,
          metaKey: false,
          target: { tagName: "DIV" }
        },
        modalsOpen: false,
        contextMenuVisible: false,
        hasSelection: true
      })
    ).toBe("delete");
  });
});
