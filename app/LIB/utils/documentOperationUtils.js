import { closeHistory, redoDepth, undoDepth } from "@tiptap/pm/history";
import { Selection } from "@tiptap/pm/state";
import { SEMANTIC_ATTRIBUTE_TYPE_SET } from "./semanticAttributes";

/**
 * DocumentOperation v1: 에디터 변경의 공통 로컬 경계
 *
 * C1: 안정적인 문서 루트 호환 경계 유지
 * C2: 엄격한 문단·제목 블록 범위 추가
 * C3: 적용 후 증명·보상·영구 저장 확인을 묶되 대기 중인 로컬 증거는 올리지 않음
 * E1d-D3: 범위 밖 증명과 정확한 스냅샷 보상 계약을 유지하면서 제목 기준 여러 블록 구간 추가
 */
export const DOCUMENT_OPERATION_SCHEMA_VERSION = 1;
export const DOCUMENT_ROOT_STABLE_ID = "document-root";
export const DOCUMENT_OPERATION_TRANSACTION_META_KEY = "dockitDocumentOperation";

export const DOCUMENT_OPERATION_TYPES = Object.freeze({
  FORMAT_TOGGLE: "format-toggle",
  REPLACE_SELECTION: "replace-selection",
  NOTE_MUTATION: "note-mutation",
  ROLLBACK: "operation-rollback",
  SECTION_REPLACE: "section-replace"
});

export const DOCUMENT_OPERATION_SOURCES = Object.freeze({
  AI_APPROVED: "ai-approved",
  AI_DIRECT: "ai-direct",
  MANUAL: "manual"
});

export const DOCUMENT_OPERATION_PERSISTENCE_STATUSES = Object.freeze([
  "pending",
  "durable",
  "failed",
  "recovery-required"
]);

export const DOCUMENT_OPERATION_ERROR_CODES = Object.freeze({
  PRECONDITION_FAILED: "PreconditionFailed",
  REVISION_CONFLICT: "RevisionConflict",
  TARGET_MISMATCH: "TargetMismatch",
  PROTECTED_RANGE_VIOLATION: "ProtectedRangeViolation",
  POSTCONDITION_FAILED: "PostconditionFailed",
  OUT_OF_RANGE_MUTATION: "OutOfRangeMutation",
  RESTORATION_FAILED: "RestorationFailed",
  SCHEMA_VALIDATION_FAILED: "SchemaValidationFailed"
});

export class DocumentOperationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "DocumentOperationError";
    this.code = code;
  }
}

const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort(compareText)
      .reduce((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }
  return value;
};

const canonicalScope = (scope) =>
  Array.isArray(scope) ? [...scope].sort(compareText) : scope;

let documentOperationNonceFallbackSequence = 0;

// 작업·확인 식별자는 컴포넌트를 다시 마운트해도 초기화되면 안 됨
// (플랫폼 CSPRNG를 우선 쓰고, 오래되거나 제한된 브라우저용으로 Math.random을 쓰지 않는 단조 증가 대체값 유지)
export const createDocumentOperationNonce = ({
  crypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined,
  now = Date.now,
  performance =
    typeof globalThis !== "undefined" ? globalThis.performance : undefined,
  processId =
    typeof process !== "undefined" && Number.isInteger(process.pid)
      ? process.pid
      : 0
} = {}) => {
  try {
    if (typeof crypto?.randomUUID === "function") {
      return crypto.randomUUID();
    }

    if (typeof crypto?.getRandomValues === "function") {
      const values = new Uint32Array(4);
      crypto.getRandomValues(values);
      return Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("");
    }
  } catch {
    // 브라우저 crypto 구현이 깨져 있으면 결정적 대체값으로 진행 (예: 제한된 웹뷰)
  }

  documentOperationNonceFallbackSequence += 1;
  let highResolutionTime = 0;
  try {
    highResolutionTime = Number(performance?.now?.()) || 0;
  } catch {
    highResolutionTime = 0;
  }
  const timeOrigin = Number(performance?.timeOrigin) || 0;
  const fallbackParts = [
    Number(now()).toString(36),
    Math.round(timeOrigin * 1000).toString(36),
    Math.round(highResolutionTime * 1000000).toString(36),
    Number(processId).toString(36),
    documentOperationNonceFallbackSequence.toString(36)
  ];
  return `fallback-${fallbackParts.join("-")}`;
};

export const canonicalDocumentOperationInput = (operation = {}) => {
  const candidate = isPlainObject(operation) ? operation : {};
  return JSON.stringify(
    canonicalize({
      actor: candidate.actor,
      baseRevision: candidate.baseRevision,
      idempotencyKey: candidate.idempotencyKey,
      payload: candidate.payload ?? null,
      protectedScope: canonicalScope(candidate.protectedScope),
      requestedScope: canonicalScope(candidate.requestedScope),
      schemaVersion: candidate.schemaVersion,
      source: candidate.source,
      target: candidate.target,
      targetFingerprint: candidate.targetFingerprint,
      type: candidate.type
    })
  );
};

// 32비트 FNV-1a 네 갈래로 짧은 결정적 ID 생성
// (실행기가 결과를 재사용하기 전에 전체 정규 입력도 비교하므로, ID가 겹쳐도 다른 작업을 재실행하지 않음)
const hashCanonicalValue = (value) =>
  [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
    .map((seed, lane) => {
      let hash = seed;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index) + lane;
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    })
    .join("");

export const getDocumentSemanticFingerprint = (document) => {
  const semanticDocument =
    document && typeof document.toJSON === "function" ? document.toJSON() : document;
  return `fp-v1-${hashCanonicalValue(JSON.stringify(canonicalize(semanticDocument ?? null)))}`;
};

// 에디터 식별 플러그인과 알려진 문단·제목 기본값은 실행용 부속이라 승인된 문서의 의미 출력에 포함하지 않음
// (허용 목록은 노드별로 두어서, 모르는 null 속성이 승인된 출력 계약에서 빠지지 않도록 처리)
const OUTPUT_RUNTIME_IDENTITY_ATTRS = Object.freeze({
  heading: new Set(["blockId", "headingId"]),
  paragraph: new Set(["blockId"])
});
const OUTPUT_NULL_DEFAULT_ATTRS = new Set([
  "docxParagraphSpacingAfter",
  "docxParagraphSpacingBefore",
  "docxParagraphSpacingLine",
  "docxParagraphSpacingLineRule",
  "docxParagraphStyleId",
  "docxParagraphStyleName",
  "docxParagraphTabs",
  "keepLinesTogether",
  "keepWithNext",
  "lineHeight",
  "orphans",
  "pageBreakBefore",
  "widows",
  "wordBreak"
]);
const OUTPUT_SEMANTIC_DEFAULT_ATTRS = new Set([
  "designPreset",
  "semanticKey",
  "semanticRole",
  "semanticTags"
]);
const isEmptySemanticDefault = (attr, value) =>
  OUTPUT_SEMANTIC_DEFAULT_ATTRS.has(attr) &&
  (value == null || (attr === "semanticTags" && Array.isArray(value) && value.length === 0));
const isKnownDocumentOutputDefault = (nodeType, attr, value) =>
  (["heading", "paragraph"].includes(nodeType) &&
    ((value == null && OUTPUT_NULL_DEFAULT_ATTRS.has(attr)) ||
      (attr === "textAlign" && value === "left") ||
      (["indent", "indentLevel"].includes(attr) && value === 0))) ||
  (nodeType === "paragraph" && attr === "fontSize" && value == null) ||
  (SEMANTIC_ATTRIBUTE_TYPE_SET.has(nodeType) &&
    isEmptySemanticDefault(attr, value));

const canonicalizeDocumentOutput = (value) => {
  if (Array.isArray(value)) return value.map(canonicalizeDocumentOutput);
  if (!isPlainObject(value)) return value;
  const result = {};
  Object.keys(value).sort(compareText).forEach((key) => {
    if (key !== "attrs") {
      result[key] = canonicalizeDocumentOutput(value[key]);
      return;
    }
    if (!isPlainObject(value.attrs)) {
      result.attrs = canonicalizeDocumentOutput(value.attrs);
      return;
    }
    const attrs = {};
    const nodeType = typeof value.type === "string" ? value.type : null;
    Object.keys(value.attrs).sort(compareText).forEach((attr) => {
      const attrValue = value.attrs[attr];
      const isRuntimeIdentity = OUTPUT_RUNTIME_IDENTITY_ATTRS[nodeType]?.has(attr) === true;
      const isDefault = isKnownDocumentOutputDefault(nodeType, attr, attrValue);
      if (!isRuntimeIdentity && !isDefault) attrs[attr] = canonicalizeDocumentOutput(attrValue);
    });
    if (Object.keys(attrs).length) result.attrs = attrs;
  });
  return result;
};

export const getDocumentOutputFingerprint = (document) => {
  const documentJson = document && typeof document.toJSON === "function" ? document.toJSON() : document;
  return `fp-v1-${hashCanonicalValue(JSON.stringify(canonicalizeDocumentOutput(documentJson ?? null)))}`;
};

export const getDocumentOperationId = (operation) =>
  `dop-v1-${hashCanonicalValue(canonicalDocumentOperationInput(operation))}`;

const schemaError = (message) =>
  new DocumentOperationError(
    DOCUMENT_OPERATION_ERROR_CODES.SCHEMA_VALIDATION_FAILED,
    message
  );

const assertString = (value, field) => {
  if (typeof value !== "string" || !value.trim()) {
    throw schemaError(`${field} is required`);
  }
};

const assertExactKeys = (value, expectedKeys, field) => {
  if (!isPlainObject(value)) throw schemaError(`${field} must be an object`);
  const actual = Object.keys(value).sort(compareText);
  const expected = [...expectedKeys].sort(compareText);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw schemaError(`${field} has unsupported fields`);
  }
};

const assertScope = (scope, field) => {
  if (
    !Array.isArray(scope) ||
    scope.some((stableId) => typeof stableId !== "string" || !stableId.trim()) ||
    new Set(scope).size !== scope.length
  ) {
    throw schemaError(`${field} must contain unique stable IDs`);
  }
};

const validatePayload = (operation) => {
  if (operation.type === DOCUMENT_OPERATION_TYPES.FORMAT_TOGGLE) {
    assertExactKeys(operation.payload, ["mark"], "payload");
    if (operation.payload.mark !== "bold") {
      throw schemaError("format-toggle mark is not supported");
    }
    return;
  }

  if (operation.type === DOCUMENT_OPERATION_TYPES.REPLACE_SELECTION) {
    const isRewrite =
      isPlainObject(operation.payload) && operation.payload.kind === "rewrite";
    const isAiReportOutline =
      isPlainObject(operation.payload) && operation.payload.kind === "ai-report-outline";
    const isAiReportDocument =
      isPlainObject(operation.payload) && operation.payload.kind === "ai-report-document";
    if (isRewrite) {
      assertExactKeys(operation.payload, ["kind"], "payload");
      return;
    }
    if (isAiReportOutline) {
      assertExactKeys(operation.payload, ["documentFingerprint", "kind", "proposalFingerprint"], "payload");
      if (operation.source !== DOCUMENT_OPERATION_SOURCES.AI_APPROVED ||
        operation.target?.stableId !== DOCUMENT_ROOT_STABLE_ID ||
        Object.prototype.hasOwnProperty.call(operation.target ?? {}, "fromOffset")) {
        throw schemaError("ai-report-outline requires an AI-approved document-root target");
      }
      if (/^fp-v1-[a-f0-9]{32}$/.test(operation.payload.proposalFingerprint) &&
        /^fp-v1-[a-f0-9]{32}$/.test(operation.payload.documentFingerprint)) return;
    }
    if (isAiReportDocument) {
      assertExactKeys(operation.payload, ["documentOutputFingerprint", "kind", "proposalFingerprint", "scopeFingerprint", "workingCopyFingerprint"], "payload");
      if (![DOCUMENT_OPERATION_SOURCES.AI_APPROVED,
        DOCUMENT_OPERATION_SOURCES.AI_DIRECT].includes(operation.source) ||
        operation.target?.stableId !== DOCUMENT_ROOT_STABLE_ID ||
        Object.keys(operation.target ?? {}).length !== 1 ||
        !Array.isArray(operation.requestedScope) || operation.requestedScope.length !== 1 ||
        operation.requestedScope[0] !== DOCUMENT_ROOT_STABLE_ID ||
        !Array.isArray(operation.protectedScope) || operation.protectedScope.length !== 0 ||
        !["documentOutputFingerprint", "proposalFingerprint", "scopeFingerprint", "workingCopyFingerprint"].every((field) =>
          /^fp-v1-[a-f0-9]{32}$/.test(operation.payload[field] ?? ""))) {
        throw schemaError("ai-report-document requires an authorized AI document-root target");
      }
      return;
    }
    if (!isRewrite && !isAiReportOutline && !isAiReportDocument) {
      throw schemaError("replace-selection kind is not supported");
    }
    throw schemaError("replace-selection payload is invalid");
  }

  if (operation.type === DOCUMENT_OPERATION_TYPES.NOTE_MUTATION) {
    assertExactKeys(operation.payload, ["action", "kind"], "payload");
    if (![
      "insertNote",
      "updateNoteBody",
      "deleteNote",
      "convertNoteKind"
    ].includes(operation.payload.action)) {
      throw schemaError("note mutation action is not supported");
    }
    if (operation.payload.kind !== null && !["footnote", "endnote"].includes(operation.payload.kind)) {
      throw schemaError("note mutation kind is not supported");
    }
    const requiresKind =
      operation.payload.action === "insertNote" ||
      operation.payload.action === "convertNoteKind";
    if (
      (requiresKind && !["footnote", "endnote"].includes(operation.payload.kind)) ||
      (!requiresKind && operation.payload.kind !== null)
    ) {
      throw schemaError("note mutation action and kind do not match");
    }
    return;
  }

  if (operation.type === DOCUMENT_OPERATION_TYPES.ROLLBACK) {
    assertExactKeys(
      operation.payload,
      ["kind", "originalOperationId", "rollbackSnapshotFingerprint", "targetOutputFingerprint"],
      "payload"
    );
    if (operation.source !== DOCUMENT_OPERATION_SOURCES.MANUAL ||
      operation.payload.kind !== "operation-rollback" ||
      !/^dop-v1-[a-f0-9]{32}$/.test(operation.payload.originalOperationId ?? "") ||
      !/^rollback-snapshot-v2-[a-f0-9]+-[0-9]+$/.test(
        operation.payload.rollbackSnapshotFingerprint ?? ""
      ) ||
      !/^fp-v1-[a-f0-9]{32}$/.test(operation.payload.targetOutputFingerprint ?? "") ||
      isBlockRangeTarget(operation.target) ||
      !Array.isArray(operation.requestedScope) || operation.requestedScope.length !== 1 ||
      operation.requestedScope[0] !== operation.target?.stableId ||
      !Array.isArray(operation.protectedScope) || operation.protectedScope.length !== 0) {
      throw schemaError("operation rollback payload is invalid");
    }
    return;
  }

  if (operation.type === DOCUMENT_OPERATION_TYPES.SECTION_REPLACE) {
    assertExactKeys(
      operation.payload,
      ["kind", "proposalFingerprint", "scopeFingerprint", "sectionOutputFingerprint", "workingCopyFingerprint"],
      "payload"
    );
    if (
      ![
        DOCUMENT_OPERATION_SOURCES.AI_APPROVED,
        DOCUMENT_OPERATION_SOURCES.AI_DIRECT
      ].includes(operation.source) ||
      operation.payload.kind !== "ai-report-section" ||
      !["proposalFingerprint", "scopeFingerprint", "sectionOutputFingerprint", "workingCopyFingerprint"]
        .every((field) => /^fp-v1-[a-f0-9]{32}$/.test(operation.payload[field] ?? "")) ||
      !isPlainObject(operation.target) ||
      !Object.prototype.hasOwnProperty.call(operation.target, "sectionFingerprint") ||
      operation.payload.scopeFingerprint !== operation.target.scopeFingerprint
    ) {
      throw schemaError("section-replace payload is invalid");
    }
    return;
  }

  throw schemaError("operation type is not supported");
};

const isBlockRangeTarget = (target) =>
  isPlainObject(target) && Object.prototype.hasOwnProperty.call(target, "fromOffset");
const isSectionRangeTarget = (target) =>
  isPlainObject(target) && Object.prototype.hasOwnProperty.call(target, "sectionFingerprint");

const validateTarget = (target) => {
  if (isBlockRangeTarget(target)) {
    assertExactKeys(target, ["blockFingerprint", "fromOffset", "stableId", "toOffset"], "target");
    assertString(target.stableId, "target.stableId");
    assertString(target.blockFingerprint, "target.blockFingerprint");
    if (!Number.isInteger(target.fromOffset) || !Number.isInteger(target.toOffset) ||
      target.fromOffset < 0 || target.fromOffset >= target.toOffset) {
      throw schemaError("target offsets are invalid");
    }
    return "block-range";
  }
  if (isSectionRangeTarget(target)) {
    assertExactKeys(target, [
      "baseRevision", "documentFingerprint", "nextHeadingBlockId", "previousHeadingBlockId",
      "protectedBlockIds", "scopeFingerprint", "sectionFingerprint", "stableId"
    ], "target");
    [
      "baseRevision", "documentFingerprint", "scopeFingerprint", "sectionFingerprint", "stableId"
    ].forEach((field) => assertString(target[field], `target.${field}`));
    if (!/^fp-v1-[a-f0-9]{32}$/.test(target.documentFingerprint) ||
      !/^fp-v1-[a-f0-9]{32}$/.test(target.scopeFingerprint) ||
      !/^fp-v1-[a-f0-9]{32}$/.test(target.sectionFingerprint) ||
      ![target.previousHeadingBlockId, target.nextHeadingBlockId].every((value) =>
        value === null || (typeof value === "string" && Boolean(value.trim()))) ||
      !Array.isArray(target.protectedBlockIds) ||
      target.protectedBlockIds.some((value) => typeof value !== "string" || !value.trim()) ||
      new Set(target.protectedBlockIds).size !== target.protectedBlockIds.length) {
      throw schemaError("section target is invalid");
    }
    return "section-range";
  }
  assertExactKeys(target, ["stableId"], "target");
  assertString(target.stableId, "target.stableId");
  return "root";
};

export const validateDocumentOperation = (operation) => {
  assertExactKeys(
    operation,
    [
      "actor",
      "baseRevision",
      "idempotencyKey",
      "payload",
      "protectedScope",
      "requestedScope",
      "schemaVersion",
      "source",
      "target",
      "targetFingerprint",
      "type"
    ],
    "operation"
  );
  if (operation.schemaVersion !== DOCUMENT_OPERATION_SCHEMA_VERSION) {
    throw schemaError("unsupported operation schema");
  }
  ["type", "actor", "source", "idempotencyKey", "baseRevision", "targetFingerprint"].forEach(
    (field) => assertString(operation[field], field)
  );
  if (!Object.values(DOCUMENT_OPERATION_SOURCES).includes(operation.source)) {
    throw schemaError("operation source is not supported");
  }
  validateTarget(operation.target);
  assertScope(operation.requestedScope, "requestedScope");
  assertScope(operation.protectedScope, "protectedScope");
  validatePayload(operation);
  return operation;
};

const freezeResult = (result) =>
  Object.freeze({
    ...result,
    changedStableIds: Object.freeze([...result.changedStableIds])
  });

const SCOPED_BLOCK_TYPES = new Set(["paragraph", "heading"]);
const TARGET_HOLE_NODE = "dockit-operation-target-hole";

const isTextOnlyBlock = (node) => {
  let valid = Boolean(node?.forEach);
  node?.forEach?.((child) => {
    if (!child.isText) valid = false;
  });
  return valid;
};

const replaceTargetContentInJson = (
  value,
  targetStableId,
  replacementContent,
  counter
) => {
  if (!isPlainObject(value)) return value;
  if (
    SCOPED_BLOCK_TYPES.has(value.type) &&
    value.attrs?.blockId === targetStableId
  ) {
    counter.count += 1;
    return { ...value, content: replacementContent };
  }
  if (!Array.isArray(value.content)) return value;
  return {
    ...value,
    content: value.content.map((child) =>
      replaceTargetContentInJson(
        child,
        targetStableId,
        replacementContent,
        counter
      )
    )
  };
};

// C2 증명은 전체 문서 트리에서 선택한 인라인 범위만 가림
// (대상 앞뒤 내용과 속성, 부모·순서 구조, 표, 차트, 도식, 블록 ID 없는 노드까지 나머지 의미 JSON은 모두 비교 대상)
// (고정 식별자는 따로 검증해서 문단 ID 중복·누락 시 실패 처리)
export const captureDocumentOperationSemanticRegions = (
  document,
  target,
  { expectedSuffixSize = null } = {}
) => {
  const stableIds = new Set();
  const targetMatches = [];
  let valid = Boolean(
    document?.descendants &&
      typeof document?.toJSON === "function" &&
      isPlainObject(target)
  );
  document?.descendants?.((node) => {
    if (!SCOPED_BLOCK_TYPES.has(node.type?.name)) return true;
    const stableId = node.attrs?.blockId;
    if (typeof stableId !== "string" || !stableId || stableIds.has(stableId)) {
      valid = false;
      return false;
    }
    stableIds.add(stableId);
    if (stableId === target?.stableId) targetMatches.push(node);
    return true;
  });

  const targetNode = targetMatches.length === 1 ? targetMatches[0] : null;
  const fromOffset = target?.fromOffset;
  const toOffset =
    Number.isInteger(expectedSuffixSize) && targetNode
      ? targetNode.content.size - expectedSuffixSize
      : target?.toOffset;
  if (
    !valid ||
    !targetNode ||
    !isTextOnlyBlock(targetNode) ||
    !Number.isInteger(fromOffset) ||
    !Number.isInteger(toOffset) ||
    fromOffset < 0 ||
    fromOffset > toOffset ||
    toOffset > targetNode.content.size
  ) {
    return { redactedFingerprint: null, suffixSize: null, valid: false };
  }

  const prefix = targetNode.content.cut(0, fromOffset).toJSON() || [];
  const suffix =
    targetNode.content.cut(toOffset, targetNode.content.size).toJSON() || [];
  const replacementContent = [
    ...prefix,
    {
      attrs: { stableId: target.stableId },
      type: TARGET_HOLE_NODE
    },
    ...suffix
  ];
  const counter = { count: 0 };
  const redactedDocument = replaceTargetContentInJson(
    document.toJSON(),
    target.stableId,
    replacementContent,
    counter
  );
  if (counter.count !== 1) {
    return { redactedFingerprint: null, suffixSize: null, valid: false };
  }
  return {
    redactedFingerprint: getDocumentSemanticFingerprint(redactedDocument),
    suffixSize: targetNode.content.size - toOffset,
    valid: true
  };
};

const SECTION_TARGET_HOLE_NODE = "dockit-operation-section-hole";
const SECTION_BLOCK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;
const sectionBoundaryHeading = (node) =>
  node?.type === "heading" && [2, 3].includes(node.attrs?.level);

export const captureDocumentOperationSectionRegions = (
  document,
  target,
  { verifyProtectedScope = true, verifySectionFingerprint = true } = {}
) => {
  const invalid = {
    from: null,
    redactedFingerprint: null,
    sectionFingerprint: null,
    sectionOutputFingerprint: null,
    to: null,
    valid: false
  };
  if (!document?.toJSON || typeof document?.child !== "function" ||
    !Number.isInteger(document?.childCount) || !isSectionRangeTarget(target)) return invalid;
  const documentJson = document.toJSON();
  if (!isPlainObject(documentJson) || documentJson.type !== "doc" || !Array.isArray(documentJson.content)) return invalid;

  const stableIds = new Set();
  let structurallyValid = true;
  const visit = (node) => {
    if (!isPlainObject(node) || typeof node.type !== "string") {
      structurallyValid = false;
      return;
    }
    if (SCOPED_BLOCK_TYPES.has(node.type)) {
      const stableId = node.attrs?.blockId;
      if (typeof stableId !== "string" || !SECTION_BLOCK_ID_PATTERN.test(stableId) ||
        stableId === DOCUMENT_ROOT_STABLE_ID || stableIds.has(stableId)) {
        structurallyValid = false;
        return;
      }
      stableIds.add(stableId);
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) {
        structurallyValid = false;
        return;
      }
      node.content.forEach(visit);
    }
  };
  documentJson.content.forEach(visit);
  if (!structurallyValid) return invalid;

  const matches = documentJson.content.map((node, index) => ({ node, index })).filter(({ node }) =>
    sectionBoundaryHeading(node) && node.attrs?.blockId === target.stableId);
  if (matches.length !== 1) return invalid;
  const { node: heading, index: fromIndex } = matches[0];
  let toIndex = documentJson.content.length;
  for (let index = fromIndex + 1; index < documentJson.content.length; index += 1) {
    const candidate = documentJson.content[index];
    if (candidate?.type === "heading" && Number.isInteger(candidate.attrs?.level) &&
      candidate.attrs.level <= heading.attrs.level) {
      toIndex = index;
      break;
    }
  }
  const sectionContent = documentJson.content.slice(fromIndex, toIndex);
  const previousHeading = [...documentJson.content.slice(0, fromIndex)].reverse().find(sectionBoundaryHeading);
  const nextHeading = documentJson.content.slice(toIndex).find(sectionBoundaryHeading);
  const previousHeadingBlockId = previousHeading?.attrs?.blockId ?? null;
  const nextHeadingBlockId = nextHeading?.attrs?.blockId ?? null;
  const protectedBlockIds = sectionContent.map((node) => node?.attrs?.blockId)
    .filter((value) => typeof value === "string" && SECTION_BLOCK_ID_PATTERN.test(value));
  const sectionFingerprint = getDocumentSemanticFingerprint(sectionContent);
  if (previousHeadingBlockId !== target.previousHeadingBlockId ||
    nextHeadingBlockId !== target.nextHeadingBlockId ||
    (verifyProtectedScope && JSON.stringify(protectedBlockIds) !== JSON.stringify(target.protectedBlockIds)) ||
    (verifySectionFingerprint && sectionFingerprint !== target.sectionFingerprint)) return invalid;

  let from = 0;
  for (let index = 0; index < fromIndex; index += 1) from += document.child(index).nodeSize;
  let to = from;
  for (let index = fromIndex; index < toIndex; index += 1) to += document.child(index).nodeSize;
  if (from < 0 || to <= from || to > document.content.size) return invalid;
  const redactedDocument = {
    ...documentJson,
    content: [
      ...documentJson.content.slice(0, fromIndex),
      { attrs: { stableId: target.stableId }, type: SECTION_TARGET_HOLE_NODE },
      ...documentJson.content.slice(toIndex)
    ]
  };
  return {
    from,
    nextHeadingBlockId,
    previousHeadingBlockId,
    protectedBlockIds,
    redactedFingerprint: getDocumentSemanticFingerprint(redactedDocument),
    sectionFingerprint,
    sectionOutputFingerprint: getDocumentOutputFingerprint(sectionContent),
    to,
    valid: true
  };
};

const hasUnchangedOutOfRangeRegions = (beforeRegions, afterRegions) =>
  Boolean(
    beforeRegions.valid &&
      afterRegions.valid &&
      beforeRegions.redactedFingerprint === afterRegions.redactedFingerprint
  );

const hasUnchangedOutOfSectionRegions = (beforeRegions, afterRegions) =>
  Boolean(
    beforeRegions?.valid && afterRegions?.valid &&
      beforeRegions.redactedFingerprint === afterRegions.redactedFingerprint
  );

const cloneDocumentSnapshot = (document) => {
  const value = document?.toJSON?.() ?? document;
  return JSON.parse(JSON.stringify(value ?? null));
};

const getEditorHistoryBinding = (editor) => {
  const state = editor?.state;
  if (!Array.isArray(state?.plugins)) return null;
  const plugin = state.plugins.find((candidate) =>
    /^history\$(?:\d+)?$/.test(candidate?.key ?? "") &&
    candidate?.spec?.key &&
    typeof candidate.getState === "function"
  );
  const historyState = plugin?.getState(state);
  if (
    !historyState ||
    !Number.isInteger(historyState.done?.eventCount) ||
    !Number.isInteger(historyState.undone?.eventCount)
  ) {
    return null;
  }
  return {
    key: plugin.spec.key,
    state: historyState
  };
};

export const captureEditorDocumentOperationSnapshot = (editor, document) => {
  const history = getEditorHistoryBinding(editor);
  // ProseMirror 히스토리 상태는 변경 불가 값
  // (이 런타임 참조를 그대로 들고 있어서 보상 때 실행 취소·다시 실행 갈래를 정확히 복원, 직렬화용 복구 형식은 아님)
  return {
    document: (document ?? editor?.state?.doc)?.toJSON?.() ?? document ?? null,
    historyDepth: history?.state.done.eventCount ?? null,
    historyPluginKey: history?.key ?? null,
    historyState: history?.state ?? null,
    redoDepth: history?.state.undone.eventCount ?? null,
    selection: editor?.state?.selection?.toJSON?.() ?? null
  };
};

export const restoreEditorDocumentOperationSnapshot = (editor, snapshot) => {
  if (
    !editor ||
    !snapshot?.document ||
    !Number.isInteger(snapshot.historyDepth) ||
    !Number.isInteger(snapshot.redoDepth) ||
    !snapshot.historyPluginKey ||
    !snapshot.historyState
  ) {
    return false;
  }

  const snapshotFingerprint = getDocumentSemanticFingerprint(snapshot.document);
  const history = getEditorHistoryBinding(editor);
  if (
    !history ||
    history.key !== snapshot.historyPluginKey ||
    snapshot.historyState.done?.eventCount !== snapshot.historyDepth ||
    snapshot.historyState.undone?.eventCount !== snapshot.redoDepth ||
    snapshot.historyState.constructor !== history.state.constructor
  ) {
    return false;
  }

  try {
    const restoredDocument = editor.schema.nodeFromJSON(snapshot.document);
    // 일반 setContent는 새 실행 취소 이벤트를 만들어 다시 실행 기록을 지움
    // (대신 히스토리 플러그인의 트랜잭션 메타데이터로 적용 전 상태를 그대로 되돌리고, 이 문서 교체는 히스토리 밖에서 처리)
    const transaction = editor.state.tr
      .replaceWith(0, editor.state.doc.content.size, restoredDocument.content)
      .setMeta("addToHistory", false)
      .setMeta("preventUpdate", false)
      .setMeta(snapshot.historyPluginKey, {
        historyState: snapshot.historyState
      });
    if (snapshot.selection) {
      transaction.setSelection(Selection.fromJSON(transaction.doc, snapshot.selection));
    }
    editor.view.dispatch(transaction);
  } catch {
    return false;
  }

  const restoredHistory = getEditorHistoryBinding(editor);
  return Boolean(
    restoredHistory?.state === snapshot.historyState &&
      undoDepth(editor.state) === snapshot.historyDepth &&
      redoDepth(editor.state) === snapshot.redoDepth &&
      getDocumentSemanticFingerprint(editor.state.doc) === snapshotFingerprint &&
      JSON.stringify(editor.state.selection.toJSON()) === JSON.stringify(snapshot.selection)
  );
};

export const buildDocumentOperationTransactionMetadata = ({
  operation,
  operationId
}) => {
  const targetRange = isBlockRangeTarget(operation.target)
    ? Object.freeze({
        fromOffset: operation.target.fromOffset,
        toOffset: operation.target.toOffset
      })
    : isSectionRangeTarget(operation.target)
      ? Object.freeze({ kind: "section" })
      : null;

  return Object.freeze({
    actor: operation.actor,
    baseRevision: operation.baseRevision,
    operationId,
    operationType: operation.type,
    schemaVersion: DOCUMENT_OPERATION_SCHEMA_VERSION,
    source: operation.source,
    targetFingerprint: operation.targetFingerprint,
    targetRange,
    targetStableId: operation.target.stableId,
    type: "document-operation"
  });
};

export const attachDocumentOperationTransactionMetadataToTransaction = (
  transaction,
  operationContext
) => {
  if (!transaction || typeof transaction.setMeta !== "function") {
    throw new DocumentOperationError(DOCUMENT_OPERATION_ERROR_CODES.SCHEMA_VALIDATION_FAILED);
  }
  closeHistory(transaction);
  transaction.setMeta(
    DOCUMENT_OPERATION_TRANSACTION_META_KEY,
    buildDocumentOperationTransactionMetadata(operationContext)
  );
  return transaction;
};

export const attachDocumentOperationTransactionMetadata = (chain, operationContext) =>
  chain.command(({ tr }) => {
    attachDocumentOperationTransactionMetadataToTransaction(tr, operationContext);
    return true;
  });

export const createDocumentOperationExecutor = ({
  getDocument,
  getRevision,
  getPersistenceStatus = () => "pending",
  resolveBlockRange,
  captureDocument = cloneDocumentSnapshot,
  restoreDocument
} = {}) => {
  const resultsByOperationId = new Map();
  let history = [];

  const execute = (operation, apply) => {
    const canonicalInput = canonicalDocumentOperationInput(operation);
    const operationId = getDocumentOperationId(operation);
    const baseEntry = {
      actor: operation?.actor ?? null,
      changedStableIds: [],
      operationId,
      operationType: operation?.type ?? null,
      source: operation?.source ?? null,
      targetStableId: operation?.target?.stableId ?? null
    };
    let beforeFingerprint = getDocumentSemanticFingerprint(getDocument?.());

    try {
      validateDocumentOperation(operation);
      const duplicate = resultsByOperationId.get(operationId);
      if (duplicate) {
        if (duplicate.canonicalInput !== canonicalInput) {
          throw schemaError("operation ID collision");
        }
        return duplicate.result;
      }

      const beforeDocument = getDocument?.();
      beforeFingerprint = getDocumentSemanticFingerprint(beforeDocument);
      const requiresRootOutputProof = [
        "ai-report-outline",
        "ai-report-document",
        "operation-rollback"
      ].includes(operation?.payload?.kind);
      const beforeOutputFingerprint =
        requiresRootOutputProof
          ? getDocumentOutputFingerprint(beforeDocument)
          : null;
      const targetKind = validateTarget(operation.target);
      const beforeSnapshot = captureDocument(beforeDocument);
      let approvedOutlineBaseRevision = null;
      const beforeRegions =
        targetKind === "block-range"
          ? captureDocumentOperationSemanticRegions(beforeDocument, operation.target)
          : targetKind === "section-range"
            ? captureDocumentOperationSectionRegions(beforeDocument, operation.target)
            : null;
      let resolvedRange = null;
      if (targetKind === "root") {
        const currentRevision = getRevision?.(beforeDocument);
        if (operation.payload?.kind === "ai-report-outline") {
          approvedOutlineBaseRevision = currentRevision;
        }
        if (currentRevision !== operation.baseRevision) {
          throw new DocumentOperationError(DOCUMENT_OPERATION_ERROR_CODES.REVISION_CONFLICT);
        }
        if (beforeFingerprint !== operation.targetFingerprint) {
          throw new DocumentOperationError(DOCUMENT_OPERATION_ERROR_CODES.TARGET_MISMATCH);
        }
      } else if (targetKind === "block-range") {
        // C2는 문서 전체가 아니라 의미 블록만 검증
        // (지정한 블록 앞의 편집 때문에 범위가 낡지 않도록 처리)
        if (operation.baseRevision !== operation.target.blockFingerprint) {
          throw new DocumentOperationError(DOCUMENT_OPERATION_ERROR_CODES.REVISION_CONFLICT);
        }
        if (operation.targetFingerprint !== operation.target.blockFingerprint) {
          throw new DocumentOperationError(DOCUMENT_OPERATION_ERROR_CODES.TARGET_MISMATCH);
        }
        resolvedRange = resolveBlockRange?.(beforeDocument, operation.target) ?? null;
        if (!resolvedRange) {
          throw new DocumentOperationError(DOCUMENT_OPERATION_ERROR_CODES.TARGET_MISMATCH);
        }
        if (!beforeRegions?.valid) {
          throw new DocumentOperationError(DOCUMENT_OPERATION_ERROR_CODES.TARGET_MISMATCH);
        }
      } else {
        if (operation.baseRevision !== operation.target.baseRevision) {
          throw new DocumentOperationError(DOCUMENT_OPERATION_ERROR_CODES.REVISION_CONFLICT);
        }
        if (operation.payload?.kind === "ai-report-section" &&
          beforeFingerprint !== operation.target.documentFingerprint) {
          throw new DocumentOperationError(DOCUMENT_OPERATION_ERROR_CODES.REVISION_CONFLICT);
        }
        if (operation.targetFingerprint !== operation.target.sectionFingerprint || !beforeRegions?.valid) {
          throw new DocumentOperationError(DOCUMENT_OPERATION_ERROR_CODES.TARGET_MISMATCH);
        }
        resolvedRange = {
          from: beforeRegions.from,
          nextHeadingBlockId: beforeRegions.nextHeadingBlockId,
          previousHeadingBlockId: beforeRegions.previousHeadingBlockId,
          sectionFingerprint: beforeRegions.sectionFingerprint,
          to: beforeRegions.to
        };
      }
      if (!operation.requestedScope.includes(operation.target.stableId)) {
        throw new DocumentOperationError(DOCUMENT_OPERATION_ERROR_CODES.PRECONDITION_FAILED);
      }
      if (operation.protectedScope.includes(operation.target.stableId)) {
        throw new DocumentOperationError(
          DOCUMENT_OPERATION_ERROR_CODES.PROTECTED_RANGE_VIOLATION
        );
      }

      const persistenceStatus = getPersistenceStatus(operation) || "pending";
      if (!DOCUMENT_OPERATION_PERSISTENCE_STATUSES.includes(persistenceStatus)) {
        throw schemaError("persistence status is invalid");
      }

      const restoreAfterInvalidMutation = (errorCode) => {
        let restored = false;
        try {
          const restoreResult = restoreDocument?.(beforeSnapshot);
          const restoredDocument = getDocument?.();
          restored = restoreResult === true &&
            getDocumentSemanticFingerprint(restoredDocument) === beforeFingerprint &&
            (operation.payload?.kind !== "ai-report-outline" ||
              getRevision?.(restoredDocument) === approvedOutlineBaseRevision);
        } catch {
          restored = false;
        }
        if (!restored) {
          return new DocumentOperationError(
            DOCUMENT_OPERATION_ERROR_CODES.RESTORATION_FAILED
          );
        }
        const error = new DocumentOperationError(errorCode);
        error.restorationVerified = true;
        return error;
      };

      let applied = false;
      const approvedOutlineStateChanged = () => {
        if (operation.payload?.kind !== "ai-report-outline") return false;
        try { return getRevision?.(getDocument?.()) !== approvedOutlineBaseRevision; } catch { return true; }
      };
      try {
        applied =
          typeof apply === "function" && apply({ operation, operationId, resolvedRange });
      } catch (applyError) {
        if (getDocumentSemanticFingerprint(getDocument?.()) !== beforeFingerprint ||
          approvedOutlineStateChanged()) {
          throw restoreAfterInvalidMutation(
            DOCUMENT_OPERATION_ERROR_CODES.POSTCONDITION_FAILED
          );
        }
        throw applyError;
      }
      if (applied !== true) {
        if (getDocumentSemanticFingerprint(getDocument?.()) !== beforeFingerprint ||
          approvedOutlineStateChanged()) {
          throw restoreAfterInvalidMutation(
            DOCUMENT_OPERATION_ERROR_CODES.POSTCONDITION_FAILED
          );
        }
        throw new DocumentOperationError(DOCUMENT_OPERATION_ERROR_CODES.PRECONDITION_FAILED);
      }

      const afterDocument = getDocument?.();
      const afterFingerprint = getDocumentSemanticFingerprint(afterDocument);
      const afterRegions =
        targetKind === "block-range"
          ? captureDocumentOperationSemanticRegions(afterDocument, operation.target, {
              expectedSuffixSize: beforeRegions.suffixSize
            })
          : targetKind === "section-range"
            ? captureDocumentOperationSectionRegions(afterDocument, operation.target, {
                verifyProtectedScope: false,
                verifySectionFingerprint: false
              })
            : null;
      const targetChanged = afterFingerprint !== beforeFingerprint;
      const afterOutputFingerprint = requiresRootOutputProof
        ? getDocumentOutputFingerprint(afterDocument)
        : null;
      let approvedOutlineRevisionAdvanced = true;
      if (operation.payload?.kind === "ai-report-outline") {
        try {
          const afterRevision = getRevision?.(afterDocument);
          approvedOutlineRevisionAdvanced =
            typeof afterRevision === "string" &&
            Boolean(afterRevision.trim()) &&
            afterRevision !== approvedOutlineBaseRevision;
        } catch {
          approvedOutlineRevisionAdvanced = false;
        }
      }
      const approvedOutputMatches = operation.payload?.kind === "ai-report-outline"
        ? (afterOutputFingerprint === operation.payload.documentFingerprint &&
          afterOutputFingerprint !== beforeOutputFingerprint && approvedOutlineRevisionAdvanced)
        : operation.payload?.kind === "ai-report-document"
          ? (afterOutputFingerprint === operation.payload.documentOutputFingerprint &&
            afterOutputFingerprint !== beforeOutputFingerprint)
          : true;
      const approvedSectionOutputMatches = operation.payload?.kind !== "ai-report-section" ||
        (afterRegions?.valid &&
          afterRegions.sectionOutputFingerprint === operation.payload.sectionOutputFingerprint &&
          afterRegions.sectionOutputFingerprint !== beforeRegions.sectionOutputFingerprint);
      const approvedRollbackOutputMatches = operation.payload?.kind !== "operation-rollback" ||
        (targetKind === "root"
          ? afterOutputFingerprint === operation.payload.targetOutputFingerprint &&
            afterOutputFingerprint !== beforeOutputFingerprint
          : targetKind === "section-range" && afterRegions?.valid &&
            afterRegions.sectionOutputFingerprint === operation.payload.targetOutputFingerprint &&
            afterRegions.sectionOutputFingerprint !== beforeRegions.sectionOutputFingerprint);
      const outOfRangeUnchanged =
        targetKind === "root" ||
        (targetKind === "block-range"
          ? hasUnchangedOutOfRangeRegions(beforeRegions, afterRegions)
          : hasUnchangedOutOfSectionRegions(beforeRegions, afterRegions));
      if (!targetChanged || !outOfRangeUnchanged || !approvedOutputMatches ||
        !approvedSectionOutputMatches || !approvedRollbackOutputMatches) {
        throw restoreAfterInvalidMutation(
          !targetChanged || !approvedOutputMatches || !approvedSectionOutputMatches ||
            !approvedRollbackOutputMatches
            ? DOCUMENT_OPERATION_ERROR_CODES.POSTCONDITION_FAILED
            : DOCUMENT_OPERATION_ERROR_CODES.OUT_OF_RANGE_MUTATION
        );
      }

      const result = freezeResult({
        ...baseEntry,
        afterFingerprint,
        beforeFingerprint,
        changedStableIds: [operation.target.stableId],
        error: null,
        ok: true,
        persistenceStatus,
        result: "applied"
      });
      history = [...history, result];
      resultsByOperationId.set(operationId, { canonicalInput, result });
      return result;
    } catch (error) {
      const result = freezeResult({
        ...baseEntry,
        afterFingerprint: getDocumentSemanticFingerprint(getDocument?.()),
        beforeFingerprint,
        compensation:
          error?.restorationVerified === true
            ? Object.freeze({
                originalOperationId: operationId,
                reason: error.code,
                restorationVerified: true
              })
            : null,
        error: error?.code || DOCUMENT_OPERATION_ERROR_CODES.SCHEMA_VALIDATION_FAILED,
        ok: false,
        persistenceStatus: "pending",
        result: "rejected"
      });
      history = [...history, result];
      if (!resultsByOperationId.has(operationId)) {
        resultsByOperationId.set(operationId, { canonicalInput, result });
      }
      return result;
    }
  };

  return {
    execute,
    getHistory: () => [...history]
  };
};

export const createDocumentRootOperation = ({
  actor,
  baseRevision,
  idempotencyKey,
  payload,
  protectedScope = [],
  source,
  targetFingerprint,
  type
}) => ({
  actor,
  baseRevision,
  idempotencyKey,
  payload,
  protectedScope,
  requestedScope: [DOCUMENT_ROOT_STABLE_ID],
  schemaVersion: DOCUMENT_OPERATION_SCHEMA_VERSION,
  source,
  target: { stableId: DOCUMENT_ROOT_STABLE_ID },
  targetFingerprint,
  type
});

export const createDocumentBlockRangeOperation = ({
  actor,
  baseRevision,
  idempotencyKey,
  payload,
  protectedScope = [],
  source,
  target,
  type
}) => ({
  actor,
  baseRevision,
  idempotencyKey,
  payload,
  protectedScope,
  requestedScope: [target.stableId],
  schemaVersion: DOCUMENT_OPERATION_SCHEMA_VERSION,
  source,
  target: {
    blockFingerprint: target.blockFingerprint,
    fromOffset: target.fromOffset,
    stableId: target.stableId,
    toOffset: target.toOffset
  },
  // C2 대상 지문은 문서 전체 해시가 아니라 고정 블록 지문
  targetFingerprint: target.blockFingerprint,
  type
});

export const createDocumentSectionOperation = ({
  actor,
  baseRevision,
  idempotencyKey,
  payload,
  protectedScope = [],
  source,
  target,
  type = DOCUMENT_OPERATION_TYPES.SECTION_REPLACE
}) => ({
  actor,
  baseRevision,
  idempotencyKey,
  payload,
  protectedScope,
  requestedScope: [target.stableId],
  schemaVersion: DOCUMENT_OPERATION_SCHEMA_VERSION,
  source,
  target: {
    baseRevision: target.baseRevision,
    documentFingerprint: target.documentFingerprint,
    nextHeadingBlockId: target.nextHeadingBlockId,
    previousHeadingBlockId: target.previousHeadingBlockId,
    protectedBlockIds: [...target.protectedBlockIds],
    scopeFingerprint: target.scopeFingerprint,
    sectionFingerprint: target.sectionFingerprint,
    stableId: target.stableId
  },
  targetFingerprint: target.sectionFingerprint,
  type
});
