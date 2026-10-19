import { Fragment, Slice } from "@tiptap/pm/model";
import {
  SEMANTIC_ATTRIBUTE_TYPE_SET,
  SEMANTIC_IDENTIFIER_MAX_LENGTH,
  validateSemanticKey
} from "./semanticAttributes";

const BLOCK_ID_TYPES = new Set(["paragraph", "heading"]);
const OBJECT_ID_TYPES = new Set([
  "image",
  "table",
  "chartBlock",
  "shapeBlock",
  "diagramBlock"
]);
const COPY_SUFFIX = /^(.*)~([2-9]\d*|1\d+)$/u;

let fallbackIdSequence = 0;

const createDefaultTechnicalId = (prefix) => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  fallbackIdSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackIdSequence.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const createUniqueTechnicalId = ({ createTechnicalId, prefix, usedIds }) => {
  let attempt = 0;
  let nextId;
  do {
    attempt += 1;
    nextId = createTechnicalId(prefix, attempt);
  } while (!nextId || usedIds.has(nextId));
  usedIds.add(nextId);
  return nextId;
};

const splitCopySuffix = (key) => {
  const match = COPY_SUFFIX.exec(key);
  return match
    ? { base: match[1], nextSuffix: BigInt(match[2]) + 1n }
    : { base: key, nextSuffix: 2n };
};

const fitSemanticCopyCandidate = (base, suffix) => {
  const suffixText = `~${suffix}`;
  const suffixLength = [...suffixText].length;
  const availableBaseLength = SEMANTIC_IDENTIFIER_MAX_LENGTH - suffixLength;
  if (availableBaseLength < 1) return null;
  return `${[...base].slice(0, availableBaseLength).join("")}${suffixText}`;
};

export const createAvailableSemanticCopyKey = (key, usedKeys) => {
  const validated = validateSemanticKey(key);
  if (!validated.valid) return null;
  if (!usedKeys.has(validated.value)) {
    usedKeys.add(validated.value);
    return validated.value;
  }

  const { base, nextSuffix } = splitCopySuffix(validated.value);
  let suffix = nextSuffix;
  while (true) {
    const candidate = fitSemanticCopyCandidate(base, suffix);
    if (!candidate) return null;
    if (!usedKeys.has(candidate)) {
      usedKeys.add(candidate);
      return candidate;
    }
    suffix += 1n;
  }
};

const collectDestinationState = (doc) => {
  const state = {
    blockIds: new Set(),
    headingIds: new Set(),
    objectIds: new Set(),
    semanticKeys: new Set()
  };
  doc?.descendants((node) => {
    if (node.attrs?.blockId) state.blockIds.add(node.attrs.blockId);
    if (node.attrs?.headingId) state.headingIds.add(node.attrs.headingId);
    if (node.attrs?.objectId) state.objectIds.add(node.attrs.objectId);
    if (SEMANTIC_ATTRIBUTE_TYPE_SET.has(node.type.name)) {
      const key = validateSemanticKey(node.attrs?.semanticKey);
      if (key.valid) state.semanticKeys.add(key.value);
    }
    return true;
  });
  return state;
};

const walkFragment = (fragment, visit) => {
  fragment.forEach((node) => {
    visit(node);
    if (node.childCount) walkFragment(node.content, visit);
  });
};

export const remapSemanticCopySlice = (
  slice,
  destinationDoc,
  { createTechnicalId = createDefaultTechnicalId } = {}
) => {
  if (!(slice instanceof Slice) || !destinationDoc) return slice;

  const used = collectDestinationState(destinationDoc);
  const blockIdMap = new Map();
  const headingIdMap = new Map();
  const objectIdMap = new Map();
  const plannedAttrs = [];

  walkFragment(slice.content, (node) => {
    const attrs = { ...node.attrs };
    if (BLOCK_ID_TYPES.has(node.type.name)) {
      const nextId = createUniqueTechnicalId({
        createTechnicalId,
        prefix: "block",
        usedIds: used.blockIds
      });
      if (attrs.blockId) blockIdMap.set(attrs.blockId, nextId);
      attrs.blockId = nextId;
    }
    if (node.type.name === "heading") {
      const nextId = createUniqueTechnicalId({
        createTechnicalId,
        prefix: "heading",
        usedIds: used.headingIds
      });
      if (attrs.headingId) headingIdMap.set(attrs.headingId, nextId);
      attrs.headingId = nextId;
    }
    if (OBJECT_ID_TYPES.has(node.type.name)) {
      const nextId = createUniqueTechnicalId({
        createTechnicalId,
        prefix: "object",
        usedIds: used.objectIds
      });
      if (attrs.objectId) objectIdMap.set(attrs.objectId, nextId);
      attrs.objectId = nextId;
    }
    if (SEMANTIC_ATTRIBUTE_TYPE_SET.has(node.type.name)) {
      const nextKey = createAvailableSemanticCopyKey(
        attrs.semanticKey,
        used.semanticKeys
      );
      if (nextKey) attrs.semanticKey = nextKey;
    }
    plannedAttrs.push(attrs);
  });

  let planIndex = 0;
  const rebuildNode = (node) => {
    const attrs = plannedAttrs[planIndex];
    planIndex += 1;
    if (node.isText) return node;
    if (attrs.targetId) {
      attrs.targetId =
        objectIdMap.get(attrs.targetId) ??
        headingIdMap.get(attrs.targetId) ??
        blockIdMap.get(attrs.targetId) ??
        attrs.targetId;
    }
    if (node.isLeaf) return node.type.create(attrs, null, node.marks);
    const children = [];
    node.content.forEach((child) => children.push(rebuildNode(child)));
    return node.type.create(attrs, Fragment.fromArray(children), node.marks);
  };

  const children = [];
  slice.content.forEach((node) => children.push(rebuildNode(node)));
  return new Slice(Fragment.fromArray(children), slice.openStart, slice.openEnd);
};

export const transformSemanticTransferSlice = (
  slice,
  view,
  { isMove = view?.dragging?.move } = {}
) =>
  isMove
    ? slice
    : remapSemanticCopySlice(slice, view?.state?.doc);
