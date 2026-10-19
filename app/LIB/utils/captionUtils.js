import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { CellSelection, TableMap } from "@tiptap/pm/tables";

export const CAPTION_BLOCK_TYPE = "captionBlock";
export const CAPTION_TOC_ITEM_TYPE = "captionTocItem";
export const CAPTION_PLACEHOLDER_TEXT = "빈 캡션";
export const OBJECT_ID_SYNC_META = "objectIdSync";
export const CAPTION_SYNC_META = "captionBlockSync";
export const CAPTION_TOC_SYNC_META = "captionTocItemSync";
export const CAPTION_NUMBER_SYNC_META = "captionNumberSync";
export const TOC_TITLE_TEXTS = new Set([
  "목차",
  "그림 목차",
  "이미지 목차",
  "표 목차",
  "차트 목차",
  "도형 목차",
  "다이어그램 목차",
  "캡션 목차"
]);

const TABLE_TARGET_NODE_NAMES = new Set([
  "table",
  "table_row",
  "table_cell",
  "table_header",
  "tableRow",
  "tableCell",
  "tableHeader"
]);

const DIRECT_CAPTION_TARGET_TYPES = new Set([
  "image",
  "table",
  "chartBlock",
  "shapeBlock",
  "diagramBlock"
]);

const CAPTION_TARGET_GROUP_MAP = {
  image: "image",
  shapeBlock: "image",
  diagramBlock: "image",
  table: "table",
  chartBlock: "chartBlock"
};

const CAPTION_TARGET_CONFIG = {
  image: {
    tocTitle: "그림 목차",
    numberLabel: "그림"
  },
  table: {
    tocTitle: "표 목차",
    numberLabel: "표"
  },
  chartBlock: {
    tocTitle: "차트 목차",
    numberLabel: "차트"
  }
};

const createObjectId = () =>
  `object-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createTextNode = (text, marks = []) => ({
  type: "text",
  text,
  ...(marks.length > 0 ? { marks } : {})
});

const normalizeFontSizeValue = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = parseFloat(value);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
};

export const normalizeCaptionTargetType = (typeName) => {
  if (!typeName) return null;

  if (TABLE_TARGET_NODE_NAMES.has(typeName)) {
    return "table";
  }

  return DIRECT_CAPTION_TARGET_TYPES.has(typeName) ? typeName : null;
};

export const normalizeCaptionTargetGroup = (typeName) => {
  const normalizedType = normalizeCaptionTargetType(typeName);

  if (!normalizedType) {
    return null;
  }

  return CAPTION_TARGET_GROUP_MAP[normalizedType] || normalizedType;
};

export const isCaptionTargetType = (typeName) =>
  DIRECT_CAPTION_TARGET_TYPES.has(normalizeCaptionTargetType(typeName));

export const getCaptionTargetConfig = (targetType) =>
  CAPTION_TARGET_CONFIG[normalizeCaptionTargetGroup(targetType)] || null;

export const getCaptionNumberText = (targetType, number) => {
  const config = getCaptionTargetConfig(targetType);

  if (!config || !number) {
    return null;
  }

  return `[${config.numberLabel} ${number}]`;
};

export const isTocTitleText = (text) =>
  TOC_TITLE_TEXTS.has(`${text ?? ""}`.trim());

export const walkNodeChildren = (node, parentPos, callback) => {
  if (!node?.childCount) {
    return true;
  }

  let childPos = parentPos + 1;

  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    const shouldContinue = callback({
      node: child,
      pos: childPos,
      parent: node,
      parentPos,
      index
    });

    if (shouldContinue === false) {
      return false;
    }

    if (child.childCount > 0) {
      const nestedShouldContinue = walkNodeChildren(child, childPos, callback);

      if (nestedShouldContinue === false) {
        return false;
      }
    }

    childPos += child.nodeSize;
  }

  return true;
};

export const getNodeContextAtPos = (doc, targetPos) => {
  let foundContext = null;

  walkNodeChildren(doc, -1, (context) => {
    if (context.pos !== targetPos) {
      return true;
    }

    foundContext = context;
    return false;
  });

  return foundContext;
};

export const findCaptionBlockByTargetId = (doc, targetId) => {
  if (!doc || !targetId) {
    return null;
  }

  let foundContext = null;

  walkNodeChildren(doc, -1, (context) => {
    if (
      context.node.type.name === CAPTION_BLOCK_TYPE &&
      context.node.attrs.targetId === targetId
    ) {
      foundContext = context;
      return false;
    }

    return true;
  });

  return foundContext;
};

export const findCaptionEntryByTargetId = (doc, targetId) =>
  collectCaptionEntries(doc).find((entry) => entry.targetId === targetId) ||
  null;

export const collectUsedObjectIds = (doc) => {
  const usedIds = new Set();

  walkNodeChildren(doc, -1, ({ node }) => {
    const objectId = node.attrs?.objectId;

    if (objectId) {
      usedIds.add(objectId);
    }

    return true;
  });

  return usedIds;
};

export const getUniqueObjectId = (usedIds) => {
  let nextId = createObjectId();

  while (usedIds.has(nextId)) {
    nextId = createObjectId();
  }

  return nextId;
};

export const isCaptionInsertionEnabled = (editorOrState) => {
  const state = editorOrState?.state || editorOrState;

  if (!state?.selection) {
    return false;
  }

  const { selection } = state;

  if (selection instanceof CellSelection) {
    return getWholeTableSelectionPos(selection) !== null;
  }

  const nodeType = normalizeCaptionTargetType(selection.node?.type?.name);

  if (!nodeType) {
    return false;
  }

  return nodeType !== "table" || selection.node?.type?.name === "table";
};

const getWholeTableSelectionPos = (selection) => {
  if (!(selection instanceof CellSelection)) {
    return null;
  }

  for (let depth = selection.$anchorCell.depth; depth > 0; depth -= 1) {
    const node = selection.$anchorCell.node(depth);

    if (node.type.name !== "table") {
      continue;
    }

    const tablePos = selection.$anchorCell.before(depth);
    const tableMap = TableMap.get(node);
    const anchorRelPos = selection.$anchorCell.pos - tablePos - 1;
    const headRelPos = selection.$headCell.pos - tablePos - 1;
    const rect = tableMap.rectBetween(anchorRelPos, headRelPos);

    const isWholeTableSelected =
      rect.left === 0 &&
      rect.top === 0 &&
      rect.right === tableMap.width &&
      rect.bottom === tableMap.height;

    return isWholeTableSelected ? tablePos : null;
  }

  return null;
};

export const getCaptionTargetFromSelection = (editorOrState) => {
  const state = editorOrState?.state || editorOrState;

  if (!state?.selection || !state?.doc) {
    return null;
  }

  const { selection, doc } = state;
  let targetPos = null;

  if (selection.node) {
    const directType = normalizeCaptionTargetType(selection.node.type.name);

    if (
      directType &&
      (directType !== "table" || selection.node.type.name === "table")
    ) {
      targetPos = selection.from;
    }
  }

  if (targetPos === null && selection instanceof CellSelection) {
    targetPos = getWholeTableSelectionPos(selection);
  }

  if (targetPos === null) {
    return null;
  }

  const context = getNodeContextAtPos(doc, targetPos);

  if (!context) {
    return null;
  }

  return {
    ...context,
    type: normalizeCaptionTargetType(context.node.type.name),
    objectId: context.node.attrs?.objectId || null
  };
};

export const getCaptionDisplayAttrs = (captionNode) => {
  const firstParagraph = captionNode?.firstChild;
  let firstTextNode = null;

  firstParagraph?.descendants((childNode) => {
    if (!childNode.isText || !childNode.text?.trim()) {
      return true;
    }

    firstTextNode = childNode;
    return false;
  });

  const textStyleMark = firstTextNode?.marks?.find(
    (mark) => mark.type.name === "textStyle"
  );

  return {
    displayTextAlign: firstParagraph?.attrs?.textAlign || "center",
    displayFontSize:
      normalizeFontSizeValue(textStyleMark?.attrs?.fontSize) ??
      normalizeFontSizeValue(firstParagraph?.attrs?.fontSize) ??
      12,
    displayFontFamily: textStyleMark?.attrs?.fontFamily || null,
    displayColor: textStyleMark?.attrs?.color || null,
    displayFontWeight: firstTextNode?.marks?.some(
      (mark) => mark.type.name === "bold"
    )
      ? "700"
      : null,
    displayFontStyle: firstTextNode?.marks?.some(
      (mark) => mark.type.name === "italic"
    )
      ? "italic"
      : null
  };
};

export const getCaptionTextContent = (captionNode) => {
  const text = captionNode?.textContent?.replace(/\u200B/g, "").trim() || "";

  return text === CAPTION_PLACEHOLDER_TEXT ? "" : text;
};

export const collectCaptionEntries = (doc) => {
  if (!doc) {
    return [];
  }

  let currentSectionIndex = 0;
  const countersByType = {};
  const entries = [];

  walkNodeChildren(doc, -1, (context) => {
    if (
      context.node.type.name === "heading" &&
      Number(context.node.attrs?.level) === 1
    ) {
      currentSectionIndex += 1;
      return true;
    }

    if (context.node.type.name !== CAPTION_BLOCK_TYPE) {
      return true;
    }

    const targetType = normalizeCaptionTargetType(
      context.node.attrs?.targetType
    );
    const targetGroup = normalizeCaptionTargetGroup(targetType);
    const targetId = context.node.attrs?.targetId || null;
    const config = getCaptionTargetConfig(targetGroup);

    if (!targetType || !targetGroup || !targetId || !config) {
      return true;
    }

    const sectionNumber = String(
      currentSectionIndex > 0 ? currentSectionIndex : 0
    );

    if (!countersByType[targetGroup]) {
      countersByType[targetGroup] = new Map();
    }

    const currentSequence =
      (countersByType[targetGroup].get(sectionNumber) || 0) + 1;
    countersByType[targetGroup].set(sectionNumber, currentSequence);

    const number = `${sectionNumber}-${currentSequence}`;

    entries.push({
      ...context,
      targetId,
      targetType,
      targetGroup,
      text: getCaptionTextContent(context.node),
      sectionNumber,
      sequence: currentSequence,
      number,
      numberText: getCaptionNumberText(targetGroup, number),
      tocTitle: config.tocTitle
    });

    return true;
  });

  return entries;
};

export const collectCaptionTargetIdsByType = (doc, targetType) =>
  collectCaptionEntries(doc)
    .filter(
      (entry) => entry.targetGroup === normalizeCaptionTargetGroup(targetType)
    )
    .map((entry) => entry.targetId);

export const createCaptionBlockNode = (schema, attrs) => {
  const captionType = schema?.nodes?.[CAPTION_BLOCK_TYPE];
  const paragraphType = schema?.nodes?.paragraph;
  const placeholderTextNode = schema?.text?.(CAPTION_PLACEHOLDER_TEXT);

  if (!captionType || !paragraphType || !placeholderTextNode) {
    return null;
  }

  return captionType.create(
    attrs,
    paragraphType.create(
      {
        textAlign: "center",
        fontSize: 12
      },
      placeholderTextNode
    )
  );
};

export const createCaptionTocTitleNode = (targetType) => {
  const config = getCaptionTargetConfig(targetType);

  return {
    type: "paragraph",
    content: [createTextNode(config?.tocTitle || "캡션 목차")]
  };
};

export const createCaptionTocEntryNode = (entry) => ({
  type: CAPTION_TOC_ITEM_TYPE,
  attrs: {
    targetId: entry.targetId,
    targetType:
      entry.targetGroup || normalizeCaptionTargetGroup(entry.targetType)
  }
});

export const createCaptionTocNodes = (targetType, entries, options = {}) => {
  const { includeTitle = true } = options;
  const normalizedType = normalizeCaptionTargetGroup(targetType);
  const nodes = entries.map(createCaptionTocEntryNode);

  if (!includeTitle) {
    return nodes;
  }

  return [createCaptionTocTitleNode(normalizedType), ...nodes];
};

export const getCaptionTextSelectionRange = (captionNode, captionPos) => {
  if (!captionNode?.firstChild) {
    const cursorPos = captionPos + 2;

    return {
      from: cursorPos,
      to: cursorPos
    };
  }

  const textStart = captionPos + 2;
  const textEnd = textStart + captionNode.firstChild.content.size;

  return {
    from: textStart,
    to: textEnd
  };
};

export const getCaptionElementByTargetId = (editor, targetId) => {
  if (!editor?.view || !targetId) {
    return null;
  }

  const editorRoot = editor.view.dom;
  const ownerDocument = editorRoot?.ownerDocument;

  if (!editorRoot || !ownerDocument) {
    return null;
  }

  const escapedTargetId =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(targetId)
      : `${targetId}`.replace(/["\\]/g, "\\$&");

  const targetElement = ownerDocument.querySelector(
    `[data-caption-block="true"][data-target-id="${escapedTargetId}"]`
  );

  if (!(targetElement instanceof Element)) {
    return null;
  }

  return editorRoot.contains(targetElement) ? targetElement : null;
};

export const removeCaptionForSelection = (editor) => {
  if (!editor?.state || !editor?.view) {
    return { ok: false, reason: "editor-unavailable" };
  }

  const target = getCaptionTargetFromSelection(editor);

  if (!target || !target.type) {
    return { ok: false, reason: "no-target" };
  }

  const targetNode = editor.state.doc.nodeAt(target.pos);
  const objectId = targetNode?.attrs?.objectId || target.objectId || null;

  if (!objectId) {
    return { ok: false, reason: "caption-missing" };
  }

  const captionContext = findCaptionBlockByTargetId(editor.state.doc, objectId);

  if (!captionContext) {
    return { ok: false, reason: "caption-missing" };
  }

  const captionNode = editor.state.doc.nodeAt(captionContext.pos);

  if (!captionNode || captionNode.type.name !== CAPTION_BLOCK_TYPE) {
    return { ok: false, reason: "caption-missing" };
  }

  const tr = editor.state.tr.delete(
    captionContext.pos,
    captionContext.pos + captionNode.nodeSize
  );
  const mappedTargetPos = tr.mapping.map(target.pos, -1);
  const mappedTargetNode = tr.doc.nodeAt(mappedTargetPos);

  if (
    editor.state.selection.node &&
    mappedTargetNode &&
    mappedTargetNode.type.name === targetNode?.type.name
  ) {
    tr.setSelection(NodeSelection.create(tr.doc, mappedTargetPos));
  }

  tr.scrollIntoView();
  editor.view.dispatch(tr);
  editor.view.focus();

  return {
    ok: true,
    status: "deleted",
    targetType: target.type,
    objectId
  };
};

export const upsertCaptionForSelection = (editor) => {
  if (!editor?.state || !editor?.view) {
    return { ok: false, reason: "editor-unavailable" };
  }

  const target = getCaptionTargetFromSelection(editor);

  if (!target || !target.type) {
    return { ok: false, reason: "no-target" };
  }

  const usedIds = collectUsedObjectIds(editor.state.doc);
  const tr = editor.state.tr;

  let targetPos = target.pos;
  let targetNode = tr.doc.nodeAt(targetPos);

  if (!targetNode) {
    return { ok: false, reason: "target-missing" };
  }

  let objectId = targetNode.attrs?.objectId || null;

  if (!objectId) {
    objectId = getUniqueObjectId(usedIds);
    usedIds.add(objectId);

    tr.setNodeMarkup(targetPos, undefined, {
      ...targetNode.attrs,
      objectId
    });

    targetNode = tr.doc.nodeAt(targetPos);
  }

  if (!targetNode) {
    return { ok: false, reason: "target-update-failed" };
  }

  let captionContext = findCaptionBlockByTargetId(tr.doc, objectId);
  let captionPos = null;
  let status = "created";

  if (captionContext) {
    status = "existing";

    const currentCaptionNode = tr.doc.nodeAt(captionContext.pos);

    if (
      !currentCaptionNode ||
      currentCaptionNode.type.name !== CAPTION_BLOCK_TYPE
    ) {
      return { ok: false, reason: "caption-missing" };
    }

    const shouldMove =
      captionContext.parentPos !== target.parentPos ||
      captionContext.index !== target.index + 1;

    const nextCaptionAttrs = {
      ...currentCaptionNode.attrs,
      targetId: objectId,
      targetType: target.type
    };

    if (shouldMove) {
      tr.delete(
        captionContext.pos,
        captionContext.pos + currentCaptionNode.nodeSize
      );

      const mappedTargetPos = tr.mapping.map(targetPos, -1);
      const mappedTargetNode = tr.doc.nodeAt(mappedTargetPos);

      if (!mappedTargetNode) {
        return { ok: false, reason: "mapped-target-missing" };
      }

      captionPos = mappedTargetPos + mappedTargetNode.nodeSize;
      tr.insert(
        captionPos,
        currentCaptionNode.type.create(
          nextCaptionAttrs,
          currentCaptionNode.content,
          currentCaptionNode.marks
        )
      );
    } else {
      captionPos = captionContext.pos;

      if (
        currentCaptionNode.attrs.targetId !== objectId ||
        currentCaptionNode.attrs.targetType !== target.type
      ) {
        tr.setNodeMarkup(captionPos, undefined, nextCaptionAttrs);
      }
    }
  } else {
    const captionNode = createCaptionBlockNode(editor.state.schema, {
      targetId: objectId,
      targetType: target.type
    });

    if (!captionNode) {
      return { ok: false, reason: "caption-schema-missing" };
    }

    captionPos = targetPos + targetNode.nodeSize;
    tr.insert(captionPos, captionNode);
  }

  const currentCaptionNode = tr.doc.nodeAt(captionPos);

  if (!currentCaptionNode) {
    return { ok: false, reason: "caption-insert-failed" };
  }

  const { from, to } = getCaptionTextSelectionRange(
    currentCaptionNode,
    captionPos
  );
  const shouldSelectAll =
    currentCaptionNode.textContent === CAPTION_PLACEHOLDER_TEXT;

  tr.setSelection(
    TextSelection.create(tr.doc, shouldSelectAll ? from : to, to)
  );
  tr.scrollIntoView();

  editor.view.dispatch(tr);
  editor.view.focus();

  return {
    ok: true,
    status,
    targetType: target.type,
    objectId
  };
};

export const toggleCaptionForSelection = (editor) => {
  if (!editor?.state || !editor?.view) {
    return { ok: false, reason: "editor-unavailable" };
  }

  const target = getCaptionTargetFromSelection(editor);

  if (!target || !target.type) {
    return { ok: false, reason: "no-target" };
  }

  const targetNode = editor.state.doc.nodeAt(target.pos);
  const objectId = targetNode?.attrs?.objectId || target.objectId || null;

  if (objectId && findCaptionBlockByTargetId(editor.state.doc, objectId)) {
    return removeCaptionForSelection(editor);
  }

  return upsertCaptionForSelection(editor);
};
