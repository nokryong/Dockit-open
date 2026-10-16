import {
  DOCUMENT_OPERATION_SOURCES,
  DOCUMENT_OPERATION_TYPES,
  DOCUMENT_ROOT_STABLE_ID,
  getDocumentOperationId,
  getDocumentOutputFingerprint,
  getDocumentSemanticFingerprint,
  validateDocumentOperation
} from "./documentOperationUtils";

export const DOCUMENT_OPERATION_ROLLBACK_SNAPSHOT_VERSION = 2;
export const DOCUMENT_OPERATION_ROLLBACK_MAX_RECORDS = 16;
export const DOCUMENT_OPERATION_ROLLBACK_MAX_CONTENT_CHARS = 512 * 1024;
export const DOCUMENT_OPERATION_ROLLBACK_MAX_STORAGE_CHARS = 2 * 1024 * 1024;
export const DOCUMENT_OPERATION_ROLLBACK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const KEY_PREFIX = "dockit:document-operation-rollback:v2";
const RECORD_KEYS = [
  "afterContent",
  "afterContentFingerprint",
  "attemptEventId",
  "attemptSequence",
  "beforeContent",
  "beforeContentFingerprint",
  "createdAt",
  "documentId",
  "expiresAt",
  "originalOperationId",
  "originalOperation",
  "schemaVersion",
  "target",
  "uid"
];
const DELEGATED_RECORD_KEYS = [...RECORD_KEYS, "approvalActor"];
const ENVELOPE_KEYS = ["documentId", "records", "uid", "version"];
const ROOT_TARGET_KEYS = ["kind", "stableId"];
const SECTION_TARGET_KEYS = [
  "kind",
  "nextHeadingBlockId",
  "previousHeadingBlockId",
  "stableId"
];

const isPlainObject = (value) => Boolean(value) && typeof value === "object" &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, keys) => isPlainObject(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
const boundedText = (value, max = 512) =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const safeTime = (value) => Number.isSafeInteger(value) && value >= 0;
const isOwnerActor = (uid, actor) => actor === uid || actor === `user:${uid}`;
const RUNTIME_ACTOR = /^actor-v1-[a-f0-9]{32}$/;

const normalizeJson = (value, seen = new Set(), depth = 0) => {
  if (depth > 64) throw new TypeError("rollback content is too deep");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || seen.has(value)) {
    throw new TypeError("rollback content is not canonical JSON");
  }
  seen.add(value);
  let normalized;
  if (Array.isArray(value)) {
    normalized = value.map((entry) => normalizeJson(entry, seen, depth + 1));
  } else {
    if (!isPlainObject(value)) throw new TypeError("rollback content is not a plain record");
    normalized = Object.fromEntries(
      Object.keys(value).sort().map((key) => [
        key,
        normalizeJson(value[key], seen, depth + 1)
      ])
    );
  }
  seen.delete(value);
  return normalized;
};

const serializeContent = (content) => {
  try {
    const normalized = normalizeJson(content);
    const serialized = JSON.stringify(normalized);
    if (serialized.length > DOCUMENT_OPERATION_ROLLBACK_MAX_CONTENT_CHARS) return null;
    return { normalized, serialized };
  } catch {
    return null;
  }
};

const hashText = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `rollback-v1-${(hash >>> 0).toString(16)}-${value.length}`;
};

export const fingerprintDocumentOperationRollbackContent = (content) => {
  const serialized = serializeContent(content);
  return serialized ? hashText(serialized.serialized) : null;
};

const isHeadingBoundary = (value) => value === null || boundedText(value, 256);

const isRollbackTarget = (target) => {
  if (!isPlainObject(target)) return false;
  if (target.kind === "root") {
    return exact(target, ROOT_TARGET_KEYS) && target.stableId === DOCUMENT_ROOT_STABLE_ID;
  }
  return target.kind === "section-range" &&
    exact(target, SECTION_TARGET_KEYS) &&
    boundedText(target.stableId, 256) &&
    target.stableId !== target.previousHeadingBlockId &&
    target.stableId !== target.nextHeadingBlockId &&
    isHeadingBoundary(target.previousHeadingBlockId) &&
    isHeadingBoundary(target.nextHeadingBlockId);
};

export const createDocumentOperationRollbackTarget = (target) => {
  let normalized = null;
  if (isPlainObject(target) && Object.prototype.hasOwnProperty.call(target, "sectionFingerprint")) {
    normalized = {
      kind: "section-range",
      nextHeadingBlockId: target.nextHeadingBlockId ?? null,
      previousHeadingBlockId: target.previousHeadingBlockId ?? null,
      stableId: target.stableId
    };
  } else if (isPlainObject(target) && target.stableId === DOCUMENT_ROOT_STABLE_ID) {
    normalized = { kind: "root", stableId: DOCUMENT_ROOT_STABLE_ID };
  } else if (isRollbackTarget(target)) {
    normalized = { ...target };
  }
  return isRollbackTarget(normalized) ? Object.freeze(normalized) : null;
};

const hasContentShapeForTarget = (target, content) => target.kind === "section-range"
  ? Array.isArray(content)
  : isPlainObject(content) && content.type === "doc" && Array.isArray(content.content);

const operationMatchesContent = ({ afterContent, beforeContent, operation, target }) => {
  try { validateDocumentOperation(operation); } catch { return false; }
  if (![
    DOCUMENT_OPERATION_SOURCES.AI_APPROVED,
    DOCUMENT_OPERATION_SOURCES.AI_DIRECT
  ].includes(operation.source) ||
    JSON.stringify(createDocumentOperationRollbackTarget(operation.target)) !==
      JSON.stringify(target) ||
    getDocumentSemanticFingerprint(beforeContent) !== operation.targetFingerprint) return false;
  const outputFingerprint = getDocumentOutputFingerprint(afterContent);
  if (target.kind === "section-range") {
    return operation.type === DOCUMENT_OPERATION_TYPES.SECTION_REPLACE &&
      operation.payload?.kind === "ai-report-section" &&
      outputFingerprint === operation.payload.sectionOutputFingerprint;
  }
  if (operation.type !== DOCUMENT_OPERATION_TYPES.REPLACE_SELECTION) return false;
  return operation.payload?.kind === "ai-report-outline"
    ? outputFingerprint === operation.payload.documentFingerprint
    : operation.payload?.kind === "ai-report-document" &&
      outputFingerprint === operation.payload.documentOutputFingerprint;
};

const operationMatchesSnapshot = (record) =>
  (Object.prototype.hasOwnProperty.call(record, "approvalActor")
    ? record.originalOperation?.source === DOCUMENT_OPERATION_SOURCES.AI_APPROVED &&
      isOwnerActor(record.uid, record.approvalActor) &&
      RUNTIME_ACTOR.test(record.originalOperation?.actor ?? "") &&
      record.approvalActor !== record.originalOperation?.actor
    : isOwnerActor(record.uid, record.originalOperation?.actor)) &&
  getDocumentOperationId(record.originalOperation) === record.originalOperationId &&
  operationMatchesContent({
    afterContent: record.afterContent,
    beforeContent: record.beforeContent,
    operation: record.originalOperation,
    target: record.target
  });

const isRecord = (record, uid, documentId) => {
  if (!(exact(record, RECORD_KEYS) || exact(record, DELEGATED_RECORD_KEYS)) ||
    record.schemaVersion !== DOCUMENT_OPERATION_ROLLBACK_SNAPSHOT_VERSION ||
    record.uid !== uid || record.documentId !== documentId ||
    !boundedText(record.originalOperationId, 256) ||
    record.attemptEventId !== `${record.originalOperationId}:attempt` ||
    !Number.isSafeInteger(record.attemptSequence) || record.attemptSequence <= 0 ||
    !safeTime(record.createdAt) || !safeTime(record.expiresAt) ||
    record.expiresAt - record.createdAt !== DOCUMENT_OPERATION_ROLLBACK_TTL_MS ||
    !isRollbackTarget(record.target) || !operationMatchesSnapshot(record) ||
    !hasContentShapeForTarget(record.target, record.beforeContent) ||
    !hasContentShapeForTarget(record.target, record.afterContent)) return false;
  const before = serializeContent(record.beforeContent);
  const after = serializeContent(record.afterContent);
  return Boolean(before && after &&
    before.serialized !== after.serialized &&
    record.beforeContentFingerprint === hashText(before.serialized) &&
    record.afterContentFingerprint === hashText(after.serialized));
};

const freezeDeep = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
};

export const createDocumentOperationRollbackSnapshotKey = (uid, documentId) =>
  boundedText(uid) && boundedText(documentId)
    ? `${KEY_PREFIX}:${encodeURIComponent(uid)}:${encodeURIComponent(documentId)}`
    : null;

const getStorage = (storage) => {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
};

const parseEnvelope = (raw, uid, documentId) => {
  if (!raw || raw.length > DOCUMENT_OPERATION_ROLLBACK_MAX_STORAGE_CHARS) return null;
  try {
    const envelope = JSON.parse(raw);
    if (!exact(envelope, ENVELOPE_KEYS) ||
      envelope.version !== DOCUMENT_OPERATION_ROLLBACK_SNAPSHOT_VERSION ||
      envelope.uid !== uid || envelope.documentId !== documentId ||
      !Array.isArray(envelope.records) ||
      envelope.records.length > DOCUMENT_OPERATION_ROLLBACK_MAX_RECORDS ||
      !envelope.records.every((record) => isRecord(record, uid, documentId))) return null;
    const operationIds = envelope.records.map(({ originalOperationId }) => originalOperationId);
    const attemptIds = envelope.records.map(({ attemptEventId }) => attemptEventId);
    if (new Set(operationIds).size !== operationIds.length ||
      new Set(attemptIds).size !== attemptIds.length ||
      envelope.records.some((record, index) =>
        index > 0 && record.attemptSequence <= envelope.records[index - 1].attemptSequence
      )) return null;
    return envelope;
  } catch {
    return null;
  }
};

const readState = (uid, documentId, storage) => {
  const key = createDocumentOperationRollbackSnapshotKey(uid, documentId);
  const target = getStorage(storage);
  if (!key || !target) return { envelope: null, key, status: "unavailable", target };
  try {
    const raw = target.getItem(key);
    if (!raw) return { envelope: null, key, status: "missing", target };
    const envelope = parseEnvelope(raw, uid, documentId);
    return { envelope, key, status: envelope ? "valid" : "corrupt", target };
  } catch {
    return { envelope: null, key, status: "unavailable", target };
  }
};

const snapshotDefinition = (record) => JSON.stringify({
  afterContent: record.afterContent,
  afterContentFingerprint: record.afterContentFingerprint,
  attemptEventId: record.attemptEventId,
  attemptSequence: record.attemptSequence,
  beforeContent: record.beforeContent,
  beforeContentFingerprint: record.beforeContentFingerprint,
  documentId: record.documentId,
  originalOperation: record.originalOperation,
  originalOperationId: record.originalOperationId,
  schemaVersion: record.schemaVersion,
  target: record.target,
  uid: record.uid,
  ...(Object.prototype.hasOwnProperty.call(record, "approvalActor")
    ? { approvalActor: record.approvalActor }
    : {})
});

export const fingerprintDocumentOperationRollbackSnapshot = (snapshot) => {
  if (!snapshot || !isRecord(snapshot, snapshot.uid, snapshot.documentId)) return null;
  return hashText(snapshotDefinition(snapshot)).replace(
    "rollback-v1-",
    "rollback-snapshot-v2-"
  );
};

export const createDocumentOperationRollbackSnapshotCandidate = ({
  afterContent,
  beforeContent,
  operation,
  target = operation?.target
} = {}) => {
  const rollbackTarget = createDocumentOperationRollbackTarget(target);
  const before = serializeContent(beforeContent);
  const after = serializeContent(afterContent);
  if (!rollbackTarget || !before || !after || before.serialized === after.serialized ||
    !operationMatchesContent({
      afterContent: after.normalized,
      beforeContent: before.normalized,
      operation,
      target: rollbackTarget
    })) return null;
  return freezeDeep({
    afterContent: after.normalized,
    beforeContent: before.normalized,
    target: rollbackTarget
  });
};

export const captureDocumentOperationRollbackSnapshot = ({
  uid,
  documentId,
  operation,
  approvalActor,
  attemptEvent,
  target,
  beforeContent,
  afterContent,
  storage,
  now = Date.now()
} = {}) => {
  let operationId = null;
  try {
    validateDocumentOperation(operation);
    operationId = getDocumentOperationId(operation);
  } catch {
    return null;
  }
  const delegatedApproval = approvalActor !== undefined;
  if (
    delegatedApproval
      ? !isOwnerActor(uid, approvalActor) ||
        !RUNTIME_ACTOR.test(operation.actor ?? "") ||
        approvalActor === operation.actor
      : !isOwnerActor(uid, operation.actor)
  ) {
    return null;
  }
  const rollbackTarget = createDocumentOperationRollbackTarget(target);
  const before = serializeContent(beforeContent);
  const after = serializeContent(afterContent);
  if (!boundedText(uid) || !boundedText(documentId) || !boundedText(operationId, 256) ||
    !rollbackTarget || !before || !after || before.serialized === after.serialized ||
    !safeTime(now) || !Number.isSafeInteger(now + DOCUMENT_OPERATION_ROLLBACK_TTL_MS) ||
    !isPlainObject(attemptEvent) || attemptEvent.kind !== "attempt" ||
    attemptEvent.operationId !== operationId ||
    attemptEvent.eventId !== `${operationId}:attempt` ||
    !Number.isSafeInteger(attemptEvent.sequence) || attemptEvent.sequence <= 0) return null;

  const record = {
    afterContent: after.normalized,
    afterContentFingerprint: hashText(after.serialized),
    attemptEventId: attemptEvent.eventId,
    attemptSequence: attemptEvent.sequence,
    beforeContent: before.normalized,
    beforeContentFingerprint: hashText(before.serialized),
    createdAt: now,
    documentId,
    expiresAt: now + DOCUMENT_OPERATION_ROLLBACK_TTL_MS,
    originalOperation: normalizeJson(operation),
    originalOperationId: operationId,
    schemaVersion: DOCUMENT_OPERATION_ROLLBACK_SNAPSHOT_VERSION,
    target: rollbackTarget,
    uid,
    ...(delegatedApproval ? { approvalActor } : {})
  };
  if (!isRecord(record, uid, documentId)) return null;
  const state = readState(uid, documentId, storage);
  if (!state.key || !state.target || !["missing", "valid"].includes(state.status)) return null;
  const existing = state.envelope?.records.find(
    ({ originalOperationId }) => originalOperationId === operationId
  );
  if (existing) {
    return snapshotDefinition(existing) === snapshotDefinition(record)
      ? freezeDeep(existing)
      : null;
  }
  const records = (state.envelope?.records || []).filter(({ expiresAt }) => expiresAt > now);
  if (records.length >= DOCUMENT_OPERATION_ROLLBACK_MAX_RECORDS ||
    records.at(-1)?.attemptSequence >= record.attemptSequence) return null;
  const envelope = {
    documentId,
    records: [...records, record],
    uid,
    version: DOCUMENT_OPERATION_ROLLBACK_SNAPSHOT_VERSION
  };
  const serializedEnvelope = JSON.stringify(envelope);
  if (serializedEnvelope.length > DOCUMENT_OPERATION_ROLLBACK_MAX_STORAGE_CHARS) return null;
  try {
    state.target.setItem(state.key, serializedEnvelope);
    return freezeDeep(record);
  } catch {
    return null;
  }
};

export const inspectDocumentOperationRollbackSnapshots = (uid, documentId, storage) => {
  const state = readState(uid, documentId, storage);
  return Object.freeze({
    snapshots: Object.freeze((state.envelope?.records || []).map((record) => freezeDeep(record))),
    status: state.status
  });
};

export const readDocumentOperationRollbackSnapshot = (
  uid,
  documentId,
  operationId,
  storage
) => inspectDocumentOperationRollbackSnapshots(uid, documentId, storage)
  .snapshots.find((snapshot) => snapshot.originalOperationId === operationId) || null;

export const resolveDocumentOperationRollbackSnapshot = ({
  snapshot,
  currentContent,
  now = Date.now()
} = {}) => {
  if (!snapshot || !isRecord(snapshot, snapshot.uid, snapshot.documentId) || !safeTime(now)) {
    return Object.freeze({ snapshot: null, status: "invalid" });
  }
  if (now >= snapshot.expiresAt) {
    return Object.freeze({ snapshot: null, status: "expired" });
  }
  if (!hasContentShapeForTarget(snapshot.target, currentContent)) {
    return Object.freeze({ snapshot: null, status: "invalid" });
  }
  const current = serializeContent(currentContent);
  if (!current) return Object.freeze({ snapshot: null, status: "invalid" });
  const after = serializeContent(snapshot.afterContent);
  const before = serializeContent(snapshot.beforeContent);
  if (current.serialized === after.serialized) {
    return Object.freeze({ snapshot, status: "ready" });
  }
  return Object.freeze({
    snapshot: null,
    status: current.serialized === before.serialized ? "already-rolled-back" : "stale"
  });
};

export const removeDocumentOperationRollbackSnapshot = (
  uid,
  documentId,
  operationId,
  storage
) => {
  const state = readState(uid, documentId, storage);
  if (state.status === "missing") return true;
  if (state.status !== "valid" || !state.key || !state.target) return false;
  const records = state.envelope.records.filter(
    (record) => record.originalOperationId !== operationId
  );
  if (records.length === state.envelope.records.length) return true;
  try {
    if (records.length === 0) state.target.removeItem(state.key);
    else state.target.setItem(state.key, JSON.stringify({ ...state.envelope, records }));
    return true;
  } catch {
    return false;
  }
};
