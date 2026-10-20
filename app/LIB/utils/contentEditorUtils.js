import { isTocTitleText } from "./captionUtils";
import {
  isDoubleClickPanelObjectType,
  isTextEditBlockingObjectType,
  READ_ONLY_INERT_OBJECT_SELECTOR
} from "./editorContractUtils";

export const TABLE_SELECTION_TYPES = new Set([
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "table_row",
  "table_cell",
  "table_header"
]);

export const isTextRangeSelection = ({
  isEmpty,
  hasNodeSelection,
  isCellSelection
}) => !isEmpty && !hasNodeSelection && !isCellSelection;

export const shouldPreserveSelectedObject = (activeElementTagName) =>
  activeElementTagName === "INPUT" || activeElementTagName === "SELECT";

export const resolveSelectionObjectAction = ({
  isEditable,
  targetInfo,
  hasTextRangeSelection,
  activeElementTagName,
  previousSelectedObject
}) => {
  if (!isEditable) {
    return { action: "clear" };
  }

  if (!targetInfo) {
    if (shouldPreserveSelectedObject(activeElementTagName)) {
      return { action: "keep", value: previousSelectedObject ?? null };
    }

    return { action: "clear" };
  }

  const typeName = targetInfo.type;

  if (TABLE_SELECTION_TYPES.has(typeName) && hasTextRangeSelection) {
    return { action: "clear" };
  }

  if (isDoubleClickPanelObjectType(typeName)) {
    const isSameObject =
      previousSelectedObject &&
      previousSelectedObject.from === targetInfo.from;

    return isSameObject
      ? { action: "keep", value: previousSelectedObject }
      : { action: "clear" };
  }

  return { action: "select", value: targetInfo };
};

export const isReadOnlyObjectTarget = (target, rootElement) => {
  if (
    !target ||
    typeof target.closest !== "function" ||
    !rootElement ||
    typeof rootElement.contains !== "function"
  ) {
    return false;
  }

  const matchedElement = target.closest(READ_ONLY_INERT_OBJECT_SELECTOR);
  return Boolean(matchedElement && rootElement.contains(matchedElement));
};

export const shouldHandleReadOnlyObjectPointer = ({
  isEditable,
  hasEditorDom,
  isTargetingReadOnlyObject
}) => !isEditable && hasEditorDom && isTargetingReadOnlyObject;

export const shouldBlockTextEditing = ({
  isEditable,
  selectedObjectType
}) => isEditable && isTextEditBlockingObjectType(selectedObjectType);

const TEXT_SELECTION_COLLAPSE_EXCLUDED_TAGS = new Set([
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA"
]);

export const shouldCollapseTextSelectionOnMouseDown = ({
  isEditable,
  hasEditorDom,
  isPrimaryButton,
  hasModifierKey,
  selectionEmpty,
  hasNodeSelection,
  isCellSelection,
  clickPos,
  selectionFrom,
  selectionTo,
  targetTagName
}) => {
  if (!isEditable || !hasEditorDom || !isPrimaryButton || hasModifierKey) {
    return false;
  }

  if (selectionEmpty || hasNodeSelection || isCellSelection) {
    return false;
  }

  const normalizedTargetTagName =
    typeof targetTagName === "string" ? targetTagName.toUpperCase() : "";

  if (TEXT_SELECTION_COLLAPSE_EXCLUDED_TAGS.has(normalizedTargetTagName)) {
    return false;
  }

  if (!Number.isFinite(clickPos)) {
    return false;
  }

  return clickPos >= selectionFrom && clickPos <= selectionTo;
};

export const getHoveredAnchorWithinEditor = (eventTarget, editorDom) => {
  if (
    !eventTarget ||
    typeof eventTarget.closest !== "function" ||
    !editorDom ||
    typeof editorDom.contains !== "function"
  ) {
    return null;
  }

  const anchorElement = eventTarget.closest("a[href]");

  if (!anchorElement || !editorDom.contains(anchorElement)) {
    return null;
  }

  return anchorElement;
};

export const shouldHideHoveredLinkPreview = ({
  anchorElement,
  relatedTarget,
  activeHoveredAnchor
}) => {
  if (!anchorElement || activeHoveredAnchor !== anchorElement) {
    return false;
  }

  if (
    relatedTarget &&
    typeof anchorElement.contains === "function" &&
    anchorElement.contains(relatedTarget)
  ) {
    return false;
  }

  return true;
};

const withAlpha = (color, alpha) => {
  if (typeof color !== "string") return color;

  const normalized = color.trim();

  if (normalized.startsWith("#")) {
    let hex = normalized.slice(1);

    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((char) => char + char)
        .join("");
    }

    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }

  if (normalized.startsWith("rgb(")) {
    return normalized.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }

  return color;
};

const isTocTitleParagraph = (node) =>
  node?.type?.name === "paragraph" && isTocTitleText(node.textContent);

const resolveActivePageNumber = (paginationSegmentModel, position) => {
  const pages = paginationSegmentModel?.pages || [];

  if (pages.length === 0 || !Number.isFinite(position)) {
    return 1;
  }

  const explicitMatch = pages.find((page) => {
    if (!Number.isFinite(page.startPos) || !Number.isFinite(page.endPos)) {
      return false;
    }

    return position >= page.startPos && position <= Math.max(page.startPos, page.endPos);
  });

  if (explicitMatch) {
    return explicitMatch.pageNumber;
  }

  const closestPreviousPage = [...pages]
    .reverse()
    .find((page) => Number.isFinite(page.startPos) && page.startPos <= position);

  return closestPreviousPage?.pageNumber || 1;
};

const resolveDeleteRangeFromObjectId = (doc, target) => {
  if (!doc || !target?.objectId) {
    return null;
  }

  let resolvedRange = null;

  doc.descendants((node, pos) => {
    if (resolvedRange) {
      return false;
    }

    if (
      node.type.name === target.typeName &&
      node.attrs?.objectId === target.objectId
    ) {
      resolvedRange = {
        from: pos,
        to: pos + node.nodeSize
      };
      return false;
    }

    return true;
  });

  return resolvedRange;
};

export { withAlpha, isTocTitleParagraph, resolveActivePageNumber, resolveDeleteRangeFromObjectId };
