const EDITABLE_TAG_NAMES = new Set(["INPUT", "TEXTAREA", "SELECT"]);

const getItemId = (item) => item?._id;

export const mergeUniqueWorkspaceItems = (...groups) => {
  const mergedItems = [];
  const visitedIds = new Set();

  groups.flat().forEach((item) => {
    const itemId = getItemId(item);

    if (!itemId || visitedIds.has(itemId)) {
      return;
    }

    visitedIds.add(itemId);
    mergedItems.push(item);
  });

  return mergedItems;
};

export const toggleWorkspaceItemSelection = (selectedItems, item) => {
  const itemId = getItemId(item);

  if (!itemId) {
    return selectedItems;
  }

  return selectedItems.some((selectedItem) => getItemId(selectedItem) === itemId)
    ? selectedItems.filter((selectedItem) => getItemId(selectedItem) !== itemId)
    : [...selectedItems, item];
};

export const extendWorkspaceItemSelection = ({
  selectedItems,
  allItems,
  lastSelectedIndex,
  itemIndex
}) => {
  if (
    !Array.isArray(allItems) ||
    lastSelectedIndex === null ||
    itemIndex < 0 ||
    itemIndex >= allItems.length
  ) {
    return selectedItems;
  }

  const startIndex = Math.min(lastSelectedIndex, itemIndex);
  const endIndex = Math.max(lastSelectedIndex, itemIndex);
  const rangeItems = allItems.slice(startIndex, endIndex + 1);

  return mergeUniqueWorkspaceItems(selectedItems, rangeItems);
};

export const isWorkspaceShortcutBlockedTarget = (target) => {
  if (!target || typeof target !== "object") {
    return false;
  }

  const tagName =
    typeof target.tagName === "string" ? target.tagName.toUpperCase() : "";

  if (EDITABLE_TAG_NAMES.has(tagName) || target.isContentEditable) {
    return true;
  }

  if (typeof target.closest !== "function") {
    return false;
  }

  return Boolean(
    target.closest(
      [
        "[contenteditable='true']",
        "[data-workspace-shortcuts='ignore']",
        "[data-modal-root='true']",
        "[role='dialog']",
        "[aria-modal='true']"
      ].join(", ")
    )
  );
};

export const getWorkspaceShortcutAction = ({
  event,
  modalsOpen,
  contextMenuVisible,
  hasSelection
}) => {
  if (
    !event ||
    modalsOpen ||
    contextMenuVisible ||
    isWorkspaceShortcutBlockedTarget(event.target)
  ) {
    return null;
  }

  const key = `${event.key ?? ""}`.toLowerCase();

  if ((event.ctrlKey || event.metaKey) && key === "a") {
    return "selectAll";
  }

  if (key === "escape") {
    return "clear";
  }

  if (key === "delete" && hasSelection) {
    return "delete";
  }

  return null;
};
