import { t as uiText } from "../../i18n";
import { isTocTitleText } from "../../utils/captionUtils";
import { isTocEntryNode } from "../../utils/editorContractUtils";

export const DELETE_CONFIRM_TARGETS = {
  table: { get label() { return uiText("표"); } },
  image: { get label() { return uiText("이미지"); } },
  shapeBlock: { get label() { return uiText("도형"); } },
  chartBlock: { get label() { return uiText("차트"); } },
  diagramBlock: { get label() { return uiText("다이어그램"); } },
  tocItem: { get label() { return uiText("목차"); } },
  captionTocItem: { get label() { return uiText("목차"); } }
};

export const DELETE_IMMEDIATE_TARGETS = {
  codeBlock: { get label() { return uiText("코드 블록"); } },
  blockquote: { get label() { return uiText("인용 블록"); } }
};

export const EXCLUDED_ANCESTOR_TYPES = new Set([
  "listItem",
  "taskItem",
  "tableCell",
  "tableHeader",
  "captionBlock",
  "shapeBlock",
  "blockquote",
  "codeBlock"
]);

export const isEmptyParagraph = (node) =>
  node?.type?.name === "paragraph" &&
  node.childCount === 0 &&
  node.textContent.length === 0;

export const isTocTitleParagraph = (node) =>
  node?.type?.name === "paragraph" && isTocTitleText(node.textContent);

export const hasTextAfterCursor = ($from) =>
  $from.parent.isTextblock && $from.parentOffset < $from.parent.content.size;

export const isInsideExcludedAncestor = ($from) => {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const nodeName = $from.node(depth).type.name;

    if (EXCLUDED_ANCESTOR_TYPES.has(nodeName)) {
      return true;
    }
  }

  return false;
};

export const getCurrentBlockContext = ($from) => {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);

    if (!node.isBlock) {
      continue;
    }

    return {
      node,
      depth,
      pos: $from.before(depth)
    };
  }

  return null;
};

export const findNextBlockAfterPos = (doc, afterPos) => {
  let nextBlock = null;

  doc?.descendants((node, pos) => {
    if (nextBlock) {
      return false;
    }

    if (!node.isBlock || pos < afterPos) {
      return true;
    }

    nextBlock = {
      node,
      pos,
      to: pos + node.nodeSize
    };

    return false;
  });

  return nextBlock;
};

export const buildTocDeleteTargetFromTitle = (doc, titleBlock) => {
  let scanPos = titleBlock.pos + titleBlock.node.nodeSize;
  let lastCoveredPos = scanPos;
  let hasEntries = false;

  while (true) {
    const nextBlock = findNextBlockAfterPos(doc, scanPos);

    if (!nextBlock || !isTocEntryNode(nextBlock.node)) {
      break;
    }

    hasEntries = true;
    lastCoveredPos = nextBlock.to;
    scanPos = nextBlock.to;
  }

  if (!hasEntries) {
    return null;
  }

  return {
    from: titleBlock.pos,
    to: lastCoveredPos,
    label: uiText("목차"),
    typeName: "tocSection"
  };
};

export const getForwardDeleteTarget = (state) => {
  const { selection, doc } = state;
  const { $from } = selection;

  if (isInsideExcludedAncestor($from)) {
    return null;
  }

  if (hasTextAfterCursor($from)) {
    return null;
  }

  const currentBlock = getCurrentBlockContext($from);

  if (!currentBlock) {
    return null;
  }

  if (isTocTitleParagraph(currentBlock.node)) {
    const tocTarget = buildTocDeleteTargetFromTitle(doc, currentBlock);

    if (tocTarget) {
      return {
        kind: "confirm",
        ...tocTarget
      };
    }
  }

  const nextBlock = findNextBlockAfterPos(
    doc,
    currentBlock.pos + currentBlock.node.nodeSize
  );

  if (!nextBlock) {
    return isEmptyParagraph(currentBlock.node) ? { kind: "noop" } : null;
  }

  if (isTocTitleParagraph(nextBlock.node)) {
    const tocTarget = buildTocDeleteTargetFromTitle(doc, nextBlock);

    if (tocTarget) {
      return {
        kind: "confirm",
        ...tocTarget
      };
    }
  }

  const deleteTarget = DELETE_CONFIRM_TARGETS[nextBlock.node.type.name];

  if (deleteTarget) {
    return {
      kind: "confirm",
      from: nextBlock.pos,
      to: nextBlock.to,
      label: deleteTarget.label,
      typeName: nextBlock.node.type.name,
      objectId: nextBlock.node.attrs?.objectId || null
    };
  }

  const immediateDeleteTarget = DELETE_IMMEDIATE_TARGETS[nextBlock.node.type.name];

  if (!immediateDeleteTarget) {
    return null;
  }

  return {
    kind: "delete",
    from: nextBlock.pos,
    to: nextBlock.to,
    label: immediateDeleteTarget.label,
    typeName: nextBlock.node.type.name,
    objectId: nextBlock.node.attrs?.objectId || null
  };
};
