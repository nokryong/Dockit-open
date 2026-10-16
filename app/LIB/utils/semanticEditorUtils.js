import {
  SEMANTIC_ATTRIBUTE_TYPE_SET,
  validateSemanticAttributes,
  validateSemanticKey
} from "./semanticAttributes";

const TEXT_CARRIER_TYPES = new Set(["paragraph", "heading"]);
const OBJECT_CARRIER_TYPES = new Set([
  "image",
  "table",
  "chartBlock",
  "shapeBlock",
  "diagramBlock"
]);
const TABLE_CONTEXT_TYPES = new Set([
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "table_row",
  "table_cell",
  "table_header"
]);
const TOC_CONTEXT_TYPES = new Set(["tocItem", "captionTocItem"]);

const TARGET_LABELS = {
  paragraph: "문단",
  heading: "제목",
  image: "이미지",
  table: "표",
  chartBlock: "차트",
  shapeBlock: "도형",
  diagramBlock: "다이어그램"
};

const clampPosition = (doc, position) => {
  const numericPosition = Number(position) || 0;
  const documentSize = Number.isFinite(doc?.content?.size)
    ? doc.content.size
    : numericPosition;
  return Math.max(0, Math.min(numericPosition, documentSize));
};

const getStableIdentity = (node) => {
  if (TEXT_CARRIER_TYPES.has(node.type.name)) {
    if (node.attrs?.blockId) {
      return { attribute: "blockId", value: node.attrs.blockId };
    }
    if (node.type.name === "heading" && node.attrs?.headingId) {
      return { attribute: "headingId", value: node.attrs.headingId };
    }
  }

  if (OBJECT_CARRIER_TYPES.has(node.type.name) && node.attrs?.objectId) {
    return { attribute: "objectId", value: node.attrs.objectId };
  }

  return null;
};

const createTarget = (doc, position) => {
  const node = doc?.nodeAt(position);
  if (!node || !SEMANTIC_ATTRIBUTE_TYPE_SET.has(node.type.name)) return null;
  const identity = getStableIdentity(node);

  return {
    type: node.type.name,
    label: TARGET_LABELS[node.type.name] || "요소",
    position,
    identityAttribute: identity?.attribute || null,
    stableId: identity?.value || null
  };
};

const findAncestor = ($position, acceptedTypes) => {
  if (!$position) return null;
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    const node = $position.node(depth);
    if (acceptedTypes.has(node.type.name)) {
      return { node, position: $position.before(depth) };
    }
  }
  return null;
};

const hasTocAncestor = ($position) => {
  if (!$position) return false;
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    if (TOC_CONTEXT_TYPES.has($position.node(depth).type.name)) return true;
  }
  return false;
};

export const getSemanticEditorTargetSignature = (target) => {
  if (!target) return null;
  if (target.stableId && target.identityAttribute) {
    return `${target.type}:${target.identityAttribute}:${target.stableId}`;
  }
  return `${target.type}:position:${target.position}`;
};

export const resolveSemanticEditorTarget = (doc, target) => {
  if (!doc || !target || !SEMANTIC_ATTRIBUTE_TYPE_SET.has(target.type)) {
    return null;
  }

  if (target.stableId && target.identityAttribute) {
    let match = null;
    doc.descendants((node, position) => {
      if (
        node.type.name === target.type &&
        node.attrs?.[target.identityAttribute] === target.stableId
      ) {
        match = { node, position };
        return false;
      }
      return !match;
    });
    return match;
  }

  const node = doc.nodeAt(target.position);
  return node?.type?.name === target.type
    ? { node, position: target.position }
    : null;
};

export const getTextSemanticEditorTarget = (state) => {
  const { doc, selection } = state || {};
  if (!doc || !selection || selection.node || hasTocAncestor(selection.$from)) {
    return null;
  }

  const fromCarrier = findAncestor(selection.$from, TEXT_CARRIER_TYPES);
  if (!fromCarrier) return null;

  const endpoint = selection.empty
    ? selection.$from
    : doc.resolve(clampPosition(doc, Math.max(selection.from, selection.to - 1)));
  if (hasTocAncestor(endpoint)) return null;
  const toCarrier = findAncestor(endpoint, TEXT_CARRIER_TYPES);

  if (!toCarrier || toCarrier.position !== fromCarrier.position) return null;
  return createTarget(doc, fromCarrier.position);
};

const findTableTarget = (doc, $position) => {
  const table = findAncestor($position, new Set(["table"]));
  return table ? createTarget(doc, table.position) : null;
};

export const getObjectSemanticEditorTarget = (state, selectedObject) => {
  const doc = state?.doc;
  if (!doc || !selectedObject) return null;

  const selectedType =
    selectedObject.type || selectedObject.node?.type?.name || null;
  const selectedPosition = clampPosition(doc, selectedObject.from);
  const directTarget = createTarget(doc, selectedPosition);

  if (
    directTarget &&
    (OBJECT_CARRIER_TYPES.has(directTarget.type) || directTarget.type === "table")
  ) {
    return directTarget;
  }

  if (!TABLE_CONTEXT_TYPES.has(selectedType)) return null;

  const selectionTableTarget = findTableTarget(doc, state.selection?.$from);
  if (selectionTableTarget) return selectionTableTarget;

  const resolvedPosition = doc.resolve(
    clampPosition(doc, selectedPosition + (doc.nodeAt(selectedPosition) ? 1 : 0))
  );
  return findTableTarget(doc, resolvedPosition);
};

const hasDuplicateSemanticKey = (doc, targetPosition, semanticKey) => {
  if (!semanticKey) return false;
  let duplicate = false;
  doc.descendants((node, position) => {
    const existing = validateSemanticKey(node.attrs?.semanticKey);
    if (
      position !== targetPosition &&
      SEMANTIC_ATTRIBUTE_TYPE_SET.has(node.type.name) &&
      existing.valid &&
      existing.value === semanticKey
    ) {
      duplicate = true;
      return false;
    }
    return !duplicate;
  });
  return duplicate;
};

export const validateSemanticEditorDraft = (doc, target, draft = {}) => {
  const resolved = resolveSemanticEditorTarget(doc, target);
  if (!resolved) {
    return { valid: false, code: "target_missing", value: null };
  }

  const validation = validateSemanticAttributes({
    semanticKey: draft.semanticKey,
    semanticRole: draft.semanticRole,
    semanticTags: resolved.node.attrs?.semanticTags
  });
  if (!validation.valid) return validation;

  if (
    hasDuplicateSemanticKey(
      doc,
      resolved.position,
      validation.value.semanticKey
    )
  ) {
    return {
      valid: false,
      code: "semanticKey_duplicate",
      value: validation.value
    };
  }

  return {
    valid: true,
    code: null,
    value: {
      semanticKey: validation.value.semanticKey,
      semanticRole: validation.value.semanticRole
    },
    resolved
  };
};

export const getSemanticEditorErrorMessage = (code) => {
  switch (code) {
    case "semanticKey_duplicate":
      return "이 고유 이름은 문서 안에서 이미 사용 중입니다.";
    case "semanticKey_too_long":
      return "고유 이름은 128자 이내로 입력해 주세요.";
    case "semanticKey_invalid_identifier":
      return "고유 이름은 문자나 숫자로 시작하고, 문자·숫자·점·밑줄·하이픈만 사용할 수 있습니다.";
    case "semanticRole_too_long":
      return "역할은 128자 이내로 입력해 주세요.";
    case "semanticRole_invalid_identifier":
      return "역할은 문자나 숫자로 시작하고, 문자·숫자·점·밑줄·하이픈만 사용할 수 있습니다.";
    case "target_missing":
      return "편집할 요소를 찾지 못했습니다. 요소를 다시 선택해 주세요.";
    default:
      return "의미 정보를 확인한 뒤 다시 시도해 주세요.";
  }
};
