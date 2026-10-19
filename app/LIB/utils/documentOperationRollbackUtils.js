import {
  appendDocumentOperationAttempt,
  appendDocumentOperationResult,
  inspectDocumentOperationJournal
} from "./documentOperationJournal";
import {
  fingerprintDocumentOperationRollbackSnapshot,
  inspectDocumentOperationRollbackSnapshots,
  resolveDocumentOperationRollbackSnapshot
} from "./documentOperationRollbackSnapshot";
import {
  DOCUMENT_OPERATION_ERROR_CODES,
  DOCUMENT_OPERATION_SOURCES,
  DOCUMENT_OPERATION_TYPES,
  DOCUMENT_ROOT_STABLE_ID,
  attachDocumentOperationTransactionMetadataToTransaction,
  captureDocumentOperationSectionRegions,
  captureEditorDocumentOperationSnapshot,
  createDocumentOperationExecutor,
  createDocumentRootOperation,
  createDocumentSectionOperation,
  getDocumentOperationId,
  getDocumentOutputFingerprint,
  getDocumentSemanticFingerprint,
  restoreEditorDocumentOperationSnapshot,
  validateDocumentOperation
} from "./documentOperationUtils";

export const DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES = Object.freeze({
  HOST_UNAVAILABLE: "DOCUMENT_OPERATION_ROLLBACK_HOST_UNAVAILABLE",
  INVALID_INPUT: "DOCUMENT_OPERATION_ROLLBACK_INVALID_INPUT",
  JOURNAL_EVIDENCE_UNAVAILABLE: "DOCUMENT_OPERATION_ROLLBACK_JOURNAL_EVIDENCE_UNAVAILABLE",
  JOURNAL_WRITE_FAILED: "DOCUMENT_OPERATION_ROLLBACK_JOURNAL_WRITE_FAILED",
  ORIGINAL_OPERATION_NOT_APPLIED: "DOCUMENT_OPERATION_ROLLBACK_ORIGINAL_OPERATION_NOT_APPLIED",
  RECOVERY_REQUIRED: "DOCUMENT_OPERATION_ROLLBACK_RECOVERY_REQUIRED",
  SNAPSHOT_EVIDENCE_UNAVAILABLE: "DOCUMENT_OPERATION_ROLLBACK_SNAPSHOT_EVIDENCE_UNAVAILABLE",
  SNAPSHOT_EXPIRED: "DOCUMENT_OPERATION_ROLLBACK_SNAPSHOT_EXPIRED",
  SNAPSHOT_NOT_FOUND: "DOCUMENT_OPERATION_ROLLBACK_SNAPSHOT_NOT_FOUND",
  STATE_DIVERGED: "DOCUMENT_OPERATION_ROLLBACK_STATE_DIVERGED",
  TARGET_STALE: "DOCUMENT_OPERATION_ROLLBACK_TARGET_STALE"
});

export const DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES = Object.freeze({
  AVAILABLE: "available",
  EXPIRED: "expired",
  RECOVERY_REQUIRED: "recovery-required",
  ROLLED_BACK: "rolled-back",
  STATE_DIVERGED: "state-diverged",
  TARGET_STALE: "target-stale",
  UNAVAILABLE: "unavailable"
});

export const DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES = Object.freeze({
  CORRUPT: "corrupt",
  MISSING: "missing",
  UNAVAILABLE: "unavailable",
  VALID: "valid"
});

export class DocumentOperationRollbackError extends Error {
  constructor(code) {
    super(code);
    this.name = "DocumentOperationRollbackError";
    this.code = code;
  }
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/;
const SECTION_BLOCK_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;
const isRecord = (value) => Boolean(value) && typeof value === "object" &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, keys) => isRecord(value) && Object.keys(value).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
const isOwnerActor = (uid, actor) => actor === uid || actor === `user:${uid}`;
const fail = (code) => { throw new DocumentOperationRollbackError(code); };
const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};
const rejected = (error, details = {}) => deepFreeze({
  ...details,
  error,
  ok: false,
  result: "rejected"
});
const inspected = (status, entries = []) => deepFreeze({ entries, status });

const sectionProtectedBlockIds = (content) => Array.isArray(content)
  ? content.map((node) => node?.attrs?.blockId)
    .filter((value) => typeof value === "string" && SECTION_BLOCK_ID.test(value))
  : [];

/**
 * 되돌리기 작업은 저장·검증된 스냅샷 증거에서만 생성
 * (다시 마운트돼도 식별자가 유지되고, 이후 문서 상태가 승인된 되돌리기 대상을 몰래 바꾸지 못하도록 처리)
 */
export const createDocumentOperationRollbackOperation = ({ actor, snapshot } = {}) => {
  const approvalActor = snapshot?.approvalActor ?? snapshot?.originalOperation?.actor;
  if (typeof actor !== "string" || !SAFE_ID.test(actor) ||
    !isOwnerActor(snapshot?.uid, actor) || approvalActor !== actor) {
    fail(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.INVALID_INPUT);
  }
  const rollbackSnapshotFingerprint =
    fingerprintDocumentOperationRollbackSnapshot(snapshot);
  if (!rollbackSnapshotFingerprint) {
    fail(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.SNAPSHOT_EVIDENCE_UNAVAILABLE);
  }

  const afterFingerprint = getDocumentSemanticFingerprint(snapshot.afterContent);
  const targetOutputFingerprint = getDocumentOutputFingerprint(snapshot.beforeContent);
  const common = {
    actor,
    baseRevision: afterFingerprint,
    idempotencyKey: `rollback:${rollbackSnapshotFingerprint}`,
    payload: {
      kind: "operation-rollback",
      originalOperationId: snapshot.originalOperationId,
      rollbackSnapshotFingerprint,
      targetOutputFingerprint
    },
    protectedScope: [],
    source: DOCUMENT_OPERATION_SOURCES.MANUAL,
    type: DOCUMENT_OPERATION_TYPES.ROLLBACK
  };
  const operation = snapshot.target.kind === "root"
    ? createDocumentRootOperation({
        ...common,
        targetFingerprint: afterFingerprint
      })
    : createDocumentSectionOperation({
        ...common,
        target: {
          baseRevision: afterFingerprint,
          documentFingerprint: getDocumentSemanticFingerprint({
            documentId: snapshot.documentId,
            rollbackSnapshotFingerprint,
            target: "section-document"
          }),
          nextHeadingBlockId: snapshot.target.nextHeadingBlockId,
          previousHeadingBlockId: snapshot.target.previousHeadingBlockId,
          protectedBlockIds: sectionProtectedBlockIds(snapshot.afterContent),
          scopeFingerprint: getDocumentSemanticFingerprint({
            rollbackSnapshotFingerprint,
            target: "section-scope"
          }),
          sectionFingerprint: afterFingerprint,
          stableId: snapshot.target.stableId
        }
      });
  try {
    validateDocumentOperation(operation);
  } catch {
    fail(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.SNAPSHOT_EVIDENCE_UNAVAILABLE);
  }
  return deepFreeze(operation);
};

const operationJournalGroup = (events, operationId) => ({
  applied: events.find((event) => event.operationId === operationId && event.kind === "applied") || null,
  attempt: events.find((event) => event.operationId === operationId && event.kind === "attempt") || null,
  compensation: events.find(
    (event) => event.kind === "compensation" && event.originalOperationId === operationId
  ) || null,
  rejected: events.find((event) => event.operationId === operationId && event.kind === "rejected") || null,
  transitions: events.filter(
    (event) => event.operationId === operationId && event.kind === "transition"
  )
});

const hasAppliedOriginalOperationEvidence = (snapshot, events) => {
  const operation = snapshot.originalOperation;
  const group = operationJournalGroup(events, snapshot.originalOperationId);
  return Boolean(
    group.attempt &&
    group.attempt.eventId === snapshot.attemptEventId &&
    group.attempt.sequence === snapshot.attemptSequence &&
    group.attempt.actor === operation.actor &&
    group.attempt.source === operation.source &&
    group.attempt.type === operation.type &&
    group.attempt.targetStableId === operation.target.stableId &&
    group.attempt.targetFingerprint === operation.targetFingerprint &&
    group.applied &&
    !group.rejected &&
    !group.compensation
  );
};

const captureCurrentTarget = (editor, operation) => {
  const document = editor?.view?.state?.doc ?? editor?.state?.doc;
  if (!document?.toJSON) return null;
  if (operation.target.stableId === DOCUMENT_ROOT_STABLE_ID) return document.toJSON();
  const regions = captureDocumentOperationSectionRegions(document, operation.target, {
    verifyProtectedScope: false,
    verifySectionFingerprint: false
  });
  if (!regions.valid) return null;
  return document.content.cut(regions.from, regions.to).toJSON();
};

const persistenceStatusFrom = (group, fallback) =>
  group.transitions.at(-1)?.persistenceStatus ?? fallback;

const reconstructApplied = (operation, group) => deepFreeze({
  actor: operation.actor,
  afterFingerprint: group.applied.afterFingerprint,
  beforeFingerprint: group.applied.beforeFingerprint,
  changedStableIds: [operation.target.stableId],
  error: null,
  journalRecorded: true,
  ok: true,
  operationId: getDocumentOperationId(operation),
  operationType: operation.type,
  persistenceStatus: persistenceStatusFrom(group, "pending"),
  result: "applied",
  source: operation.source,
  targetStableId: operation.target.stableId
});

const reconstructRejected = (operation, group) => deepFreeze({
  actor: operation.actor,
  afterFingerprint: group.rejected.afterFingerprint,
  beforeFingerprint: group.rejected.beforeFingerprint,
  changedStableIds: [],
  compensation: group.compensation
    ? {
        originalOperationId: getDocumentOperationId(operation),
        reason: group.compensation.reason,
        restorationVerified: true
      }
    : null,
  error: group.rejected.error,
  journalRecorded: Boolean(
    ![DOCUMENT_OPERATION_ERROR_CODES.OUT_OF_RANGE_MUTATION,
      DOCUMENT_OPERATION_ERROR_CODES.POSTCONDITION_FAILED].includes(group.rejected.error) ||
      group.compensation
  ),
  ok: false,
  operationId: getDocumentOperationId(operation),
  operationType: operation.type,
  persistenceStatus: "pending",
  result: "rejected",
  source: operation.source,
  targetStableId: operation.target.stableId
});

const decorateResult = (result, journalRecorded) => deepFreeze({
  ...result,
  journalRecorded
});

export const createDocumentOperationRollbackAdapter = ({
  actor,
  documentId,
  editor,
  getPersistenceStatus,
  now = Date.now,
  onDocumentOperationSettled,
  storage,
  uid
} = {}) => {
  if (typeof actor !== "string" || !SAFE_ID.test(actor) || !isOwnerActor(uid, actor) ||
    typeof documentId !== "string" || !SAFE_ID.test(documentId) ||
    !editor || editor.isDestroyed || !editor.isEditable || typeof now !== "function" ||
    (getPersistenceStatus !== undefined && typeof getPersistenceStatus !== "function") ||
    (onDocumentOperationSettled !== undefined &&
      typeof onDocumentOperationSettled !== "function")) return null;

  const currentDocument = () => editor?.view?.state?.doc ?? editor?.state?.doc;
  const executor = createDocumentOperationExecutor({
    getDocument: currentDocument,
    getRevision: getDocumentSemanticFingerprint,
    ...(getPersistenceStatus ? { getPersistenceStatus } : {}),
    captureDocument: () => captureEditorDocumentOperationSnapshot(editor),
    restoreDocument: (snapshot) => restoreEditorDocumentOperationSnapshot(editor, snapshot)
  });

  const inspect = () => {
    if (editor.isDestroyed || !editor.isEditable) {
      return inspected(DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES.UNAVAILABLE);
    }

    const snapshotInspection = inspectDocumentOperationRollbackSnapshots(
      uid,
      documentId,
      storage
    );
    if (snapshotInspection.status === "missing") {
      return inspected(DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES.MISSING);
    }
    if (snapshotInspection.status !== "valid") {
      return inspected(
        snapshotInspection.status === "corrupt"
          ? DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES.CORRUPT
          : DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES.UNAVAILABLE
      );
    }

    const journal = inspectDocumentOperationJournal(uid, documentId, storage);
    if (!["missing", "valid"].includes(journal.status)) {
      return inspected(
        journal.status === "corrupt"
          ? DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES.CORRUPT
          : DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES.UNAVAILABLE
      );
    }

    const inspectedAt = now();
    const entries = snapshotInspection.snapshots.map((snapshot) => {
      const base = {
        createdAt: snapshot.createdAt,
        expiresAt: snapshot.expiresAt,
        originalOperationId: snapshot.originalOperationId,
        persistenceStatus: null,
        rollbackOperationId: null,
        status: DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.UNAVAILABLE,
        targetKind: snapshot.target.kind === "root" ? "root" : "section",
        targetStableId: snapshot.target.stableId
      };
      if (!hasAppliedOriginalOperationEvidence(snapshot, journal.events)) return base;

      let operation;
      try {
        operation = createDocumentOperationRollbackOperation({ actor, snapshot });
      } catch {
        return base;
      }
      const operationId = getDocumentOperationId(operation);
      const group = operationJournalGroup(journal.events, operationId);
      const persistenceStatus = group.applied
        ? persistenceStatusFrom(group, "pending")
        : group.rejected
          ? "failed"
          : group.attempt ? "pending" : null;
      const resolution = resolveDocumentOperationRollbackSnapshot({
        currentContent: captureCurrentTarget(editor, operation),
        now: inspectedAt,
        snapshot
      });
      let status = DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.TARGET_STALE;
      if (resolution.status === "expired") {
        status = DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.EXPIRED;
      } else if (resolution.status === "ready") {
        if (group.applied) {
          status = DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.STATE_DIVERGED;
        } else if (group.rejected) {
          status = DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.UNAVAILABLE;
        } else if (group.attempt) {
          status = DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.RECOVERY_REQUIRED;
        } else {
          status = DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.AVAILABLE;
        }
      } else if (resolution.status === "already-rolled-back") {
        if (group.applied && !group.rejected) {
          status = DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.ROLLED_BACK;
        } else if (group.attempt && !group.rejected) {
          status = DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.RECOVERY_REQUIRED;
        } else {
          status = DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.STATE_DIVERGED;
        }
      }
      return {
        ...base,
        persistenceStatus,
        rollbackOperationId: operationId,
        status
      };
    }).sort((left, right) => right.createdAt - left.createdAt);

    return inspected(DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES.VALID, entries);
  };

  const rollback = (input) => {
    if (editor.isDestroyed || !editor.isEditable) {
      return rejected(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.HOST_UNAVAILABLE);
    }
    if (!exact(input, ["confirmed", "originalOperationId"]) || input.confirmed !== true ||
      typeof input.originalOperationId !== "string" ||
      !/^dop-v1-[a-f0-9]{32}$/.test(input.originalOperationId)) {
      return rejected(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.INVALID_INPUT);
    }

    const snapshotInspection = inspectDocumentOperationRollbackSnapshots(
      uid,
      documentId,
      storage
    );
    if (!["missing", "valid"].includes(snapshotInspection.status)) {
      return rejected(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.SNAPSHOT_EVIDENCE_UNAVAILABLE);
    }
    const snapshot = snapshotInspection.snapshots.find(
      ({ originalOperationId }) => originalOperationId === input.originalOperationId
    );
    if (!snapshot) {
      return rejected(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.SNAPSHOT_NOT_FOUND);
    }

    const journal = inspectDocumentOperationJournal(uid, documentId, storage);
    if (!["missing", "valid"].includes(journal.status)) {
      return rejected(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.JOURNAL_EVIDENCE_UNAVAILABLE);
    }
    if (!hasAppliedOriginalOperationEvidence(snapshot, journal.events)) {
      return rejected(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.ORIGINAL_OPERATION_NOT_APPLIED);
    }

    let operation;
    try {
      operation = createDocumentOperationRollbackOperation({ actor, snapshot });
    } catch (error) {
      return rejected(error instanceof DocumentOperationRollbackError
        ? error.code
        : DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.SNAPSHOT_EVIDENCE_UNAVAILABLE);
    }
    const operationId = getDocumentOperationId(operation);
    const group = operationJournalGroup(journal.events, operationId);
    const currentContent = captureCurrentTarget(editor, operation);
    if (!currentContent) {
      return rejected(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.TARGET_STALE, { operationId });
    }
    const resolution = resolveDocumentOperationRollbackSnapshot({
      currentContent,
      now: now(),
      snapshot
    });
    if (resolution.status === "expired") {
      return rejected(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.SNAPSHOT_EXPIRED, { operationId });
    }
    if (resolution.status === "stale" || resolution.status === "invalid") {
      return rejected(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.TARGET_STALE, { operationId });
    }
    if (resolution.status === "already-rolled-back") {
      if (group.applied && !group.rejected) return reconstructApplied(operation, group);
      return rejected(
        group.attempt && !group.rejected
          ? DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.RECOVERY_REQUIRED
          : DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.STATE_DIVERGED,
        { operationId }
      );
    }
    if (group.applied) {
      return rejected(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.STATE_DIVERGED, { operationId });
    }
    if (group.rejected) return reconstructRejected(operation, group);
    if (group.attempt) {
      return rejected(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.RECOVERY_REQUIRED, {
        operationId
      });
    }

    if (!appendDocumentOperationAttempt({
      uid,
      documentId,
      operation,
      operationId,
      storage,
      now: now()
    })) {
      return rejected(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.JOURNAL_WRITE_FAILED, {
        operationId
      });
    }

    const result = executor.execute(operation, ({ operationId: executorOperationId, resolvedRange }) => {
      try {
        if (editor.isDestroyed || !editor.isEditable) return false;
        const immediateContent = captureCurrentTarget(editor, operation);
        if (!immediateContent || resolveDocumentOperationRollbackSnapshot({
          currentContent: immediateContent,
          now: now(),
          snapshot
        }).status !== "ready") return false;

        const rollbackDocument = editor.schema.nodeFromJSON(
          snapshot.target.kind === "root"
            ? snapshot.beforeContent
            : { content: snapshot.beforeContent, type: "doc" }
        );
        const transaction = snapshot.target.kind === "root"
          ? editor.state.tr.replaceWith(
              0,
              editor.state.doc.content.size,
              rollbackDocument.content
            )
          : editor.state.tr.replaceWith(
              resolvedRange.from,
              resolvedRange.to,
              rollbackDocument.content
            );
        attachDocumentOperationTransactionMetadataToTransaction(transaction, {
          operation,
          operationId: executorOperationId
        });
        editor.view.dispatch(transaction);
        return true;
      } catch {
        return false;
      }
    });
    const journalRecorded = appendDocumentOperationResult({
      uid,
      documentId,
      operation,
      result,
      storage,
      now: now()
    });
    let hostRecorded = false;
    if (onDocumentOperationSettled) {
      try {
        hostRecorded = onDocumentOperationSettled({ operation, result }) === true;
      } catch {}
    }
    return decorateResult(result, journalRecorded || hostRecorded);
  };

  return Object.freeze({
    getHistory: executor.getHistory,
    inspect,
    rollback
  });
};
