// C3a stores only operation audit metadata. Document content, selection text,
// prompts, provider output, and mutation payloads are deliberately excluded.
export const DOCUMENT_OPERATION_JOURNAL_VERSION = 1;
export const DOCUMENT_OPERATION_JOURNAL_MAX_EVENTS = 96;

const KEY_PREFIX = "dockit:document-operation:v1";
const PERSISTENCE_STATUSES = new Set([
  "pending",
  "durable",
  "failed",
  "recovery-required"
]);
const TRANSITION_STATUSES = new Set([
  "durable",
  "failed",
  "recovery-required"
]);
const COMPENSATION_REASONS = new Set([
  "OutOfRangeMutation",
  "PostconditionFailed"
]);

const ATTEMPT_KEYS = [
  "actor",
  "documentId",
  "eventId",
  "kind",
  "occurredAt",
  "operationId",
  "persistenceStatus",
  "schemaVersion",
  "sequence",
  "source",
  "targetFingerprint",
  "targetStableId",
  "type",
  "uid"
];
const APPLIED_KEYS = [
  "actor",
  "afterFingerprint",
  "beforeFingerprint",
  "documentId",
  "eventId",
  "kind",
  "occurredAt",
  "operationId",
  "persistenceStatus",
  "schemaVersion",
  "sequence",
  "source",
  "targetStableId",
  "type",
  "uid"
];
const REJECTED_KEYS = [
  "actor",
  "afterFingerprint",
  "beforeFingerprint",
  "documentId",
  "error",
  "eventId",
  "kind",
  "occurredAt",
  "operationId",
  "persistenceStatus",
  "schemaVersion",
  "sequence",
  "source",
  "targetStableId",
  "type",
  "uid"
];
const TRANSITION_KEYS = [
  "acknowledgementId",
  "coveredThroughSequence",
  "documentId",
  "eventId",
  "kind",
  "occurredAt",
  "operationId",
  "persistenceStatus",
  "sequence",
  "uid"
];
const COMPENSATION_KEYS = [
  "documentId",
  "eventId",
  "kind",
  "occurredAt",
  "operationId",
  "originalOperationId",
  "persistenceStatus",
  "reason",
  "restorationVerified",
  "schemaVersion",
  "sequence",
  "uid"
];

const compareText = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;
const isText = (value) => typeof value === "string" && value.length > 0;
const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (value, expectedKeys) =>
  isPlainObject(value) &&
  JSON.stringify(Object.keys(value).sort(compareText)) ===
    JSON.stringify([...expectedKeys].sort(compareText));

export const createDocumentOperationJournalKey = (uid, documentId) =>
  uid && documentId
    ? `${KEY_PREFIX}:${encodeURIComponent(uid)}:${encodeURIComponent(documentId)}`
    : null;

const getStorage = (storage) => {
  if (storage) return storage;
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const hasCommonEventContract = (event, uid, documentId) =>
  event.uid === uid &&
  event.documentId === documentId &&
  Number.isInteger(event.sequence) &&
  event.sequence > 0 &&
  isText(event.eventId) &&
  isText(event.operationId) &&
  Number.isFinite(event.occurredAt) &&
  PERSISTENCE_STATUSES.has(event.persistenceStatus);

const isValidEvent = (event, uid, documentId) => {
  if (!isPlainObject(event) || !hasCommonEventContract(event, uid, documentId)) {
    return false;
  }

  if (event.kind === "attempt") {
    return (
      hasExactKeys(event, ATTEMPT_KEYS) &&
      event.schemaVersion === DOCUMENT_OPERATION_JOURNAL_VERSION &&
      event.persistenceStatus === "pending" &&
      isText(event.actor) &&
      isText(event.source) &&
      isText(event.type) &&
      isText(event.targetStableId) &&
      isText(event.targetFingerprint)
    );
  }

  if (event.kind === "applied") {
    return (
      hasExactKeys(event, APPLIED_KEYS) &&
      event.schemaVersion === DOCUMENT_OPERATION_JOURNAL_VERSION &&
      event.persistenceStatus === "pending" &&
      isText(event.actor) &&
      isText(event.source) &&
      isText(event.type) &&
      isText(event.targetStableId) &&
      isText(event.beforeFingerprint) &&
      isText(event.afterFingerprint)
    );
  }

  if (event.kind === "rejected") {
    return (
      hasExactKeys(event, REJECTED_KEYS) &&
      event.schemaVersion === DOCUMENT_OPERATION_JOURNAL_VERSION &&
      event.persistenceStatus === "failed" &&
      isText(event.actor) &&
      isText(event.source) &&
      isText(event.type) &&
      isText(event.targetStableId) &&
      isText(event.beforeFingerprint) &&
      isText(event.afterFingerprint) &&
      isText(event.error)
    );
  }

  if (event.kind === "compensation") {
    return (
      hasExactKeys(event, COMPENSATION_KEYS) &&
      event.schemaVersion === DOCUMENT_OPERATION_JOURNAL_VERSION &&
      event.persistenceStatus === "failed" &&
      isText(event.originalOperationId) &&
      COMPENSATION_REASONS.has(event.reason) &&
      event.restorationVerified === true
    );
  }

  return (
    event.kind === "transition" &&
    hasExactKeys(event, TRANSITION_KEYS) &&
    TRANSITION_STATUSES.has(event.persistenceStatus) &&
    isText(event.acknowledgementId) &&
    Number.isInteger(event.coveredThroughSequence) &&
    event.coveredThroughSequence > 0
  );
};

const readJournalState = (uid, documentId, storage) => {
  const key = createDocumentOperationJournalKey(uid, documentId);
  const target = getStorage(storage);
  if (!key || !target) {
    return { key, target, journal: null, valid: false, storageStatus: "unavailable" };
  }

  try {
    const raw = target.getItem(key);
    if (!raw) return { key, target, journal: null, valid: true, storageStatus: "missing" };

    const journal = JSON.parse(raw);
    const events = journal?.events;
    const eventIds = Array.isArray(events)
      ? events.map((event) => event?.eventId)
      : [];
    const isValid =
      hasExactKeys(journal, ["documentId", "events", "uid", "version"]) &&
      journal.version === DOCUMENT_OPERATION_JOURNAL_VERSION &&
      journal.uid === uid &&
      journal.documentId === documentId &&
      Array.isArray(events) &&
      events.length <= DOCUMENT_OPERATION_JOURNAL_MAX_EVENTS &&
      new Set(eventIds).size === eventIds.length &&
      events.every(
        (event, index) =>
          isValidEvent(event, uid, documentId) &&
          (index === 0 || event.sequence > events[index - 1].sequence)
      ) &&
      hasValidOperationHistories(events);

    return {
      key,
      target,
      journal: isValid ? journal : null,
      valid: isValid,
      storageStatus: isValid ? "valid" : "corrupt"
    };
  } catch {
    return { key, target, journal: null, valid: false, storageStatus: "unavailable" };
  }
};

// A valid event shape is not enough on reopen: an append-only sequence must
// also be a history the C3a state machine could have produced. In particular,
// an attempt is never durable evidence by itself.
const hasValidOperationHistories = (events) => {
  const compensationEvents = events.filter((event) => event.kind === "compensation");
  const groups = new Map();
  events.filter((event) => event.kind !== "compensation").forEach((event) => {
    const group = groups.get(event.operationId) || [];
    group.push(event);
    groups.set(event.operationId, group);
  });

  const operationsValid = [...groups.values()].every((history) => {
    const [attempt, ...following] = history;
    if (
      attempt?.kind !== "attempt" ||
      attempt.eventId !== `${attempt.operationId}:attempt`
    ) return false;

    let result = null;
    let status = "unresolved-attempt";
    const acknowledgementIds = new Set();
    for (const event of following) {
      if (event.kind === "attempt") return false;
      if (event.kind === "applied" || event.kind === "rejected") {
        if (
          result ||
          (status !== "unresolved-attempt" &&
            status !== "recovery-required") ||
          event.eventId !== `${event.operationId}:${event.kind}` ||
          event.actor !== attempt.actor ||
          event.schemaVersion !== attempt.schemaVersion ||
          event.source !== attempt.source ||
          event.targetStableId !== attempt.targetStableId ||
          event.type !== attempt.type
        ) return false;
        result = event.kind;
        status =
          event.kind === "rejected"
            ? "failed"
            : status === "recovery-required"
            ? "recovery-required"
            : "applied-pending";
        continue;
      }
      if (event.kind !== "transition" || acknowledgementIds.has(event.acknowledgementId)) {
        return false;
      }
      acknowledgementIds.add(event.acknowledgementId);
      const sourceSequence = result ? history.find((candidate) => candidate.kind === result)?.sequence : attempt.sequence;
      if (
        event.eventId !==
          `${event.operationId}:ack:${event.acknowledgementId}:${event.persistenceStatus}` ||
        event.coveredThroughSequence < sourceSequence ||
        event.coveredThroughSequence >= event.sequence ||
        result === "rejected"
      ) return false;
      if (!result) {
        if (event.persistenceStatus !== "recovery-required" || status !== "unresolved-attempt") return false;
        status = "recovery-required";
        continue;
      }
      if (
        status === "durable-evidence" ||
        (status === "recovery-required" && event.persistenceStatus === "recovery-required") ||
        (status === "failed" && event.persistenceStatus === "failed")
      ) return false;
      status =
        event.persistenceStatus === "durable"
          ? "durable-evidence"
          : event.persistenceStatus;
    }
    return true;
  });
  if (!operationsValid) return false;

  const compensationIds = new Set();
  return compensationEvents.every((event) => {
    const original = groups.get(event.originalOperationId);
    const rejected = original?.find((candidate) => candidate.kind === "rejected");
    const originalLastSequence = Math.max(...(original || []).map((candidate) => candidate.sequence));
    if (
      !rejected ||
      rejected.error !== event.reason ||
      rejected.beforeFingerprint !== rejected.afterFingerprint ||
      event.occurredAt < rejected.occurredAt ||
      event.operationId !== `comp-v1-${event.originalOperationId}` ||
      event.eventId !== `${event.operationId}:rollback` ||
      event.sequence <= originalLastSequence ||
      compensationIds.has(event.operationId)
    ) return false;
    compensationIds.add(event.operationId);
    return true;
  });
};

const canEvictOperationEvents = (events, allEvents) => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.kind === "transition") {
      return event.persistenceStatus === "durable";
    }
  }
  const rejected = events.find((event) => event.kind === "rejected");
  return Boolean(
    rejected &&
      rejected.beforeFingerprint === rejected.afterFingerprint &&
      allEvents.some(
        (event) =>
          event.kind === "compensation" &&
          event.originalOperationId === rejected.operationId &&
          event.reason === rejected.error &&
          event.restorationVerified === true
      )
  );
};

const compactJournalEvents = (events) => {
  let retainedEvents = [...events];
  const operationIds = [
    ...new Set(
      events
        .filter((event) => event.kind !== "compensation")
        .map((event) => event.operationId)
    )
  ];

  for (const operationId of operationIds) {
    if (retainedEvents.length <= DOCUMENT_OPERATION_JOURNAL_MAX_EVENTS) break;
    const operationEvents = retainedEvents.filter(
      (event) => event.operationId === operationId
    );
    if (!canEvictOperationEvents(operationEvents, retainedEvents)) continue;
    retainedEvents = retainedEvents.filter(
      (event) =>
        event.operationId !== operationId &&
        event.originalOperationId !== operationId
    );
  }

  return retainedEvents.length <= DOCUMENT_OPERATION_JOURNAL_MAX_EVENTS
    ? retainedEvents
    : null;
};

const writeEvents = (state, uid, documentId, events) => {
  if (!state.key || !state.target || !state.valid) return false;
  const retainedEvents = compactJournalEvents(events);
  const eventIds = retainedEvents?.map((event) => event.eventId) || [];
  if (
    !retainedEvents ||
    new Set(eventIds).size !== eventIds.length ||
    !retainedEvents.every(
      (event, index) =>
        isValidEvent(event, uid, documentId) &&
        (index === 0 || event.sequence > retainedEvents[index - 1].sequence)
    ) ||
    !hasValidOperationHistories(retainedEvents)
  ) {
    return false;
  }

  try {
    state.target.setItem(
      state.key,
      JSON.stringify({
        version: DOCUMENT_OPERATION_JOURNAL_VERSION,
        uid,
        documentId,
        events: retainedEvents
      })
    );
    return true;
  } catch {
    return false;
  }
};

const nextSequence = (events) => (events.at(-1)?.sequence || 0) + 1;

export const getDocumentOperationJournalCursor = (
  uid,
  documentId,
  storage
) =>
  readJournalState(uid, documentId, storage).journal?.events.at(-1)
    ?.sequence || 0;

export const appendDocumentOperationAttempt = ({
  uid,
  documentId,
  operation,
  operationId,
  storage,
  now = Date.now()
}) => {
  if (!isText(operationId)) return false;

  const state = readJournalState(uid, documentId, storage);
  if (!state.valid) return false;
  const events = state.journal?.events || [];
  const existing = events.find(
    (event) => event.kind === "attempt" && event.operationId === operationId
  );
  if (existing) return true;

  const event = {
    actor: operation?.actor,
    documentId,
    eventId: `${operationId}:attempt`,
    kind: "attempt",
    occurredAt: now,
    operationId,
    persistenceStatus: "pending",
    schemaVersion: operation?.schemaVersion,
    sequence: nextSequence(events),
    source: operation?.source,
    targetFingerprint: operation?.targetFingerprint,
    targetStableId: operation?.target?.stableId,
    type: operation?.type,
    uid
  };
  if (!isValidEvent(event, uid, documentId)) return false;

  return writeEvents(state, uid, documentId, [...events, event]);
};

export const appendAppliedDocumentOperation = ({
  uid,
  documentId,
  operation,
  result,
  storage,
  now = Date.now()
}) => {
  if (!result?.ok || !isText(result.operationId)) return false;

  const state = readJournalState(uid, documentId, storage);
  if (!state.valid) return false;
  const events = state.journal?.events || [];
  if (
    events.some(
      (event) =>
        event.kind === "applied" && event.operationId === result.operationId
    )
  ) {
    return true;
  }
  if (
    !events.some(
      (event) =>
        event.kind === "attempt" && event.operationId === result.operationId
    )
  ) {
    return false;
  }

  const event = {
    actor: operation?.actor,
    afterFingerprint: result.afterFingerprint,
    beforeFingerprint: result.beforeFingerprint,
    documentId,
    eventId: `${result.operationId}:applied`,
    kind: "applied",
    occurredAt: now,
    operationId: result.operationId,
    persistenceStatus: "pending",
    schemaVersion: operation?.schemaVersion,
    sequence: nextSequence(events),
    source: operation?.source,
    targetStableId: operation?.target?.stableId,
    type: operation?.type,
    uid
  };
  if (!isValidEvent(event, uid, documentId)) return false;

  return writeEvents(state, uid, documentId, [...events, event]);
};

export const appendRejectedDocumentOperation = ({
  uid,
  documentId,
  operation,
  result,
  storage,
  now = Date.now()
}) => {
  if (result?.ok !== false || !isText(result.operationId)) return false;

  const state = readJournalState(uid, documentId, storage);
  if (!state.valid) return false;
  const events = state.journal?.events || [];
  if (
    events.some(
      (event) =>
        event.kind === "rejected" && event.operationId === result.operationId
    )
  ) {
    return true;
  }
  if (
    !events.some(
      (event) =>
        event.kind === "attempt" && event.operationId === result.operationId
    )
  ) {
    return false;
  }

  const event = {
    actor: operation?.actor,
    afterFingerprint: result.afterFingerprint,
    beforeFingerprint: result.beforeFingerprint,
    documentId,
    error: result.error,
    eventId: `${result.operationId}:rejected`,
    kind: "rejected",
    occurredAt: now,
    operationId: result.operationId,
    persistenceStatus: "failed",
    schemaVersion: operation?.schemaVersion,
    sequence: nextSequence(events),
    source: operation?.source,
    targetStableId: operation?.target?.stableId,
    type: operation?.type,
    uid
  };
  if (!isValidEvent(event, uid, documentId)) return false;

  return writeEvents(state, uid, documentId, [...events, event]);
};

// Compensation is a separate immutable record. It can only follow a rejected
// original operation whose document restoration was independently verified.
// No content snapshot or mutation payload is serialized here.
export const appendCompensatingDocumentOperation = ({
  uid,
  documentId,
  compensation,
  storage,
  now = Date.now()
}) => {
  if (
    !isText(compensation?.originalOperationId) ||
    !COMPENSATION_REASONS.has(compensation?.reason) ||
    compensation?.restorationVerified !== true
  ) return false;

  const state = readJournalState(uid, documentId, storage);
  if (!state.valid) return false;
  const events = state.journal?.events || [];
  const originalEvents = events.filter(
    (event) => event.operationId === compensation.originalOperationId
  );
  const rejected = originalEvents.find((event) => event.kind === "rejected");
  if (
    !rejected ||
    rejected.error !== compensation.reason ||
    rejected.beforeFingerprint !== rejected.afterFingerprint ||
    now < rejected.occurredAt
  ) return false;
  const operationId = `comp-v1-${compensation.originalOperationId}`;
  if (events.some((event) => event.kind === "compensation" && event.operationId === operationId)) {
    return true;
  }

  const event = {
    documentId,
    eventId: `${operationId}:rollback`,
    kind: "compensation",
    occurredAt: now,
    operationId,
    originalOperationId: compensation.originalOperationId,
    persistenceStatus: "failed",
    reason: compensation.reason,
    restorationVerified: true,
    schemaVersion: DOCUMENT_OPERATION_JOURNAL_VERSION,
    sequence: nextSequence(events),
    uid
  };
  if (!isValidEvent(event, uid, documentId)) return false;
  return writeEvents(state, uid, documentId, [...events, event]);
};

export const appendDocumentOperationResult = ({
  uid,
  documentId,
  operation,
  result,
  storage,
  now
}) => {
  const appendResult =
    result?.ok === true
      ? appendAppliedDocumentOperation
      : result?.ok === false
        ? appendRejectedDocumentOperation
        : null;
  if (!appendResult) return false;

  const resultAppended = appendResult({
    uid,
    documentId,
    operation,
    result,
    storage,
    ...(Number.isFinite(now) ? { now } : {})
  });
  if (!resultAppended) return false;
  return !result?.compensation || appendCompensatingDocumentOperation({
    uid,
    documentId,
    compensation: result.compensation,
    storage,
    ...(Number.isFinite(now) ? { now: now + 1 } : {})
  });
};

const createResultRetryKey = (uid, documentId, operationId) =>
  JSON.stringify([uid, documentId, operationId]);

// A result can fail to append after the editor mutation already succeeded.
// Keep that metadata in component memory only and retry it before a later
// content checkpoint. The queue is scoped and is never serialized.
export const enqueueDocumentOperationResultRetry = (
  retryQueue,
  { uid, documentId, operation, result } = {}
) => {
  if (
    !(retryQueue instanceof Map) ||
    !isText(uid) ||
    !isText(documentId) ||
    !isText(result?.operationId) ||
    (result?.ok !== true && result?.ok !== false)
  ) {
    return false;
  }

  retryQueue.set(createResultRetryKey(uid, documentId, result.operationId), {
    uid,
    documentId,
    operation,
    result
  });
  return true;
};

export const flushDocumentOperationResultRetries = ({
  retryQueue,
  uid,
  documentId,
  storage
} = {}) => {
  if (!(retryQueue instanceof Map) || !isText(uid) || !isText(documentId)) {
    return { flushed: 0, pending: 0 };
  }

  let flushed = 0;
  for (const [key, entry] of retryQueue.entries()) {
    if (entry.uid !== uid || entry.documentId !== documentId) continue;
    if (
      appendDocumentOperationResult({
        uid,
        documentId,
        operation: entry.operation,
        result: entry.result,
        storage
      })
    ) {
      retryQueue.delete(key);
      flushed += 1;
    }
  }

  const pending = [...retryQueue.values()].filter(
    (entry) => entry.uid === uid && entry.documentId === documentId
  ).length;
  return { flushed, pending };
};

const latestPersistenceStatus = (events, operationId) => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.operationId !== operationId) continue;
    if (event.kind === "transition") return event.persistenceStatus;
    if (event.kind === "applied") return "pending";
  }
  return null;
};

export const transitionDocumentOperationsThrough = ({
  uid,
  documentId,
  coveredThroughSequence,
  acknowledgementId,
  persistenceStatus,
  storage,
  now = Date.now()
}) => {
  if (
    !Number.isInteger(coveredThroughSequence) ||
    coveredThroughSequence < 1 ||
    !isText(acknowledgementId) ||
    !TRANSITION_STATUSES.has(persistenceStatus)
  ) {
    return false;
  }

  const state = readJournalState(uid, documentId, storage);
  if (!state.valid) return false;
  const events = state.journal?.events;
  if (!events?.length || coveredThroughSequence > events.at(-1).sequence) {
    return false;
  }

  const resultKindsByOperationId = new Map();
  events.forEach((event) => {
    if (event.kind === "applied" || event.kind === "rejected") {
      resultKindsByOperationId.set(event.operationId, event.kind);
    }
  });
  const candidates = events.filter(
    (event) =>
      event.sequence <= coveredThroughSequence &&
      (event.kind === "applied" ||
        (event.kind === "attempt" &&
          !resultKindsByOperationId.has(event.operationId)))
  );
  const additions = [];

  candidates.forEach((event) => {
    const nextStatus =
      event.kind === "applied" ? persistenceStatus : "recovery-required";
    const alreadyAcknowledged = events.some(
      (candidate) =>
        candidate.kind === "transition" &&
        candidate.operationId === event.operationId &&
        candidate.acknowledgementId === acknowledgementId
    );
    const currentStatus = latestPersistenceStatus(events, event.operationId);
    if (
      alreadyAcknowledged ||
      currentStatus === "durable" ||
      currentStatus === nextStatus
    ) {
      return;
    }

    additions.push({
      acknowledgementId,
      coveredThroughSequence,
      documentId,
      eventId: `${event.operationId}:ack:${acknowledgementId}:${nextStatus}`,
      kind: "transition",
      occurredAt: now,
      operationId: event.operationId,
      persistenceStatus: nextStatus,
      sequence: nextSequence([...events, ...additions]),
      uid
    });
  });

  if (!additions.length) return true;
  return writeEvents(state, uid, documentId, [...events, ...additions]);
};

const getDocumentOperationJournalEventAtSequence = (
  uid,
  documentId,
  sequence,
  storage
) => {
  if (!Number.isInteger(sequence) || sequence < 1) return null;
  const state = readJournalState(uid, documentId, storage);
  if (!state.valid) return null;
  return (
    state.journal?.events.find((event) => event.sequence === sequence) || null
  );
};

// The exact HTML remains component-local. A draft may persist only the cursor
// sequence and event identity needed to prove which journal prefix that HTML
// covered.
export const createDocumentOperationContentCheckpoint = ({
  uid,
  documentId,
  content,
  storage
}) => {
  const coveredThroughSequence = getDocumentOperationJournalCursor(
    uid,
    documentId,
    storage
  );
  const cursorEvent = getDocumentOperationJournalEventAtSequence(
    uid,
    documentId,
    coveredThroughSequence,
    storage
  );
  return {
    uid,
    documentId,
    content,
    coveredThroughEventId: cursorEvent?.eventId || null,
    coveredThroughSequence
  };
};

export const resolveDocumentOperationContentCheckpoint = (
  checkpoint,
  { uid, documentId, content, storage } = {}
) => {
  if (
    !checkpoint ||
    checkpoint.uid !== uid ||
    checkpoint.documentId !== documentId ||
    typeof content !== "string" ||
    checkpoint.content !== content ||
    !Number.isInteger(checkpoint.coveredThroughSequence) ||
    checkpoint.coveredThroughSequence < 1 ||
    !isText(checkpoint.coveredThroughEventId)
  ) {
    return 0;
  }

  const cursorEvent = getDocumentOperationJournalEventAtSequence(
    uid,
    documentId,
    checkpoint.coveredThroughSequence,
    storage
  );
  return cursorEvent?.eventId === checkpoint.coveredThroughEventId
    ? checkpoint.coveredThroughSequence
    : 0;
};

export const readDocumentOperationJournal = (uid, documentId, storage) =>
  readJournalState(uid, documentId, storage).journal?.events || [];

export const inspectDocumentOperationJournal = (uid, documentId, storage) => {
  const state = readJournalState(uid, documentId, storage);
  return {
    events: state.journal?.events || [],
    status: state.storageStatus
  };
};

export const resolveDocumentOperationSaveOutcome = ({
  checkpoint,
  savedContent,
  succeeded
} = {}) => {
  const savedExactCheckpoint = Boolean(
    typeof checkpoint?.content === "string" &&
      typeof savedContent === "string" &&
      savedContent === checkpoint.content
  );
  return {
    clearCheckpointDraft: Boolean(succeeded && savedExactCheckpoint),
    persistenceStatus:
      succeeded && savedExactCheckpoint
        ? "durable"
        : checkpoint
          ? "recovery-required"
          : "failed",
    savedExactCheckpoint
  };
};

const classifyOperationHistory = (history) => {
  let status = "unresolved-attempt";
  history.slice(1).forEach((event) => {
    if (event.kind === "rejected") {
      status = "failed";
    } else if (event.kind === "applied") {
      if (status !== "recovery-required") status = "applied-pending";
    } else if (event.kind === "transition") {
      status =
        event.persistenceStatus === "durable"
          ? "durable-evidence"
          : event.persistenceStatus;
    }
  });
  return status;
};

// Classify persisted operation metadata only. This never replays an operation
// or promotes an attempt to durable without an explicit persistence transition.
export const classifyDocumentOperationRecovery = ({
  uid,
  documentId,
  storage
} = {}) => {
  const inspection = inspectDocumentOperationJournal(uid, documentId, storage);
  if (inspection.status !== "valid" && inspection.status !== "missing") {
    return {
      journalStatus: inspection.status,
      operations: [],
      status: "storage-warning"
    };
  }

  const compensatedOperationIds = new Set(
    inspection.events
      .filter((event) => event.kind === "compensation")
      .map((event) => event.originalOperationId)
  );
  const histories = new Map();
  inspection.events
    .filter((event) => event.kind !== "compensation")
    .forEach((event) => {
      const history = histories.get(event.operationId) || [];
      history.push(event);
      histories.set(event.operationId, history);
    });
  const operations = [...histories.entries()].map(([operationId, history]) => ({
    operationId,
    status: compensatedOperationIds.has(operationId)
      ? "compensated-evidence"
      : classifyOperationHistory(history)
  }));
  const statuses = new Set(operations.map((operation) => operation.status));
  const status = statuses.has("recovery-required")
    ? "recovery-required"
    : statuses.has("failed")
      ? "failed"
      : statuses.has("applied-pending")
        ? "applied-pending"
        : statuses.has("unresolved-attempt")
          ? "unresolved-attempt"
          : statuses.has("durable-evidence")
            ? "durable-evidence"
            : statuses.has("compensated-evidence")
              ? "compensated-evidence"
              : "clean";

  return {
    journalStatus: inspection.status,
    operations,
    status
  };
};

// A restored checkpoint may acknowledge only its exact journal cursor. A
// missing, future, or corrupt cursor cannot be replaced with the latest cursor
// because that would make unrelated later operations look durable.
export const createRestoredDocumentOperationContentCheckpoint = ({
  uid,
  documentId,
  content,
  coveredThroughSequence,
  coveredThroughEventId,
  storage
}) => {
  const cursorEvent = getDocumentOperationJournalEventAtSequence(
    uid,
    documentId,
    coveredThroughSequence,
    storage
  );
  if (
    !isText(uid) ||
    !isText(documentId) ||
    typeof content !== "string" ||
    !Number.isInteger(coveredThroughSequence) ||
    coveredThroughSequence < 1 ||
    !isText(coveredThroughEventId) ||
    cursorEvent?.eventId !== coveredThroughEventId
  ) {
    return null;
  }

  return {
    uid,
    documentId,
    content,
    coveredThroughEventId,
    coveredThroughSequence
  };
};
