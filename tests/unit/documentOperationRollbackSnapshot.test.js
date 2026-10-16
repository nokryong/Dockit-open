/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";

import {
  DOCUMENT_OPERATION_SOURCES,
  DOCUMENT_OPERATION_TYPES,
  DOCUMENT_ROOT_STABLE_ID,
  createDocumentRootOperation,
  createDocumentSectionOperation,
  getDocumentOperationId,
  getDocumentOutputFingerprint,
  getDocumentSemanticFingerprint
} from "../../app/LIB/utils/documentOperationUtils";
import {
  DOCUMENT_OPERATION_ROLLBACK_MAX_RECORDS,
  DOCUMENT_OPERATION_ROLLBACK_TTL_MS,
  captureDocumentOperationRollbackSnapshot,
  createDocumentOperationRollbackSnapshotCandidate,
  createDocumentOperationRollbackSnapshotKey,
  createDocumentOperationRollbackTarget,
  fingerprintDocumentOperationRollbackContent,
  fingerprintDocumentOperationRollbackSnapshot,
  inspectDocumentOperationRollbackSnapshots,
  readDocumentOperationRollbackSnapshot,
  removeDocumentOperationRollbackSnapshot,
  resolveDocumentOperationRollbackSnapshot
} from "../../app/LIB/utils/documentOperationRollbackSnapshot";

const uid = "user:rollback";
const documentId = "doc:rollback";
const attempt = (operation, sequence) => ({
  eventId: `${getDocumentOperationId(operation)}:attempt`,
  kind: "attempt",
  operationId: getDocumentOperationId(operation),
  sequence
});
const content = (marker, body = "content") => [{
  attrs: { blockId: `block-${marker}` },
  content: [{ text: `${marker}:${body}`, type: "text" }],
  type: "paragraph"
}];
const sectionOperation = (index, beforeContent, afterContent) => {
  const sectionFingerprint = getDocumentSemanticFingerprint(beforeContent);
  const scopeFingerprint = getDocumentSemanticFingerprint({ index, scope: "rollback-test" });
  return createDocumentSectionOperation({
    actor: uid,
    baseRevision: sectionFingerprint,
    idempotencyKey: `rollback-source-section-${index}`,
    payload: {
      kind: "ai-report-section",
      proposalFingerprint: getDocumentSemanticFingerprint({ index, proposal: true }),
      scopeFingerprint,
      sectionOutputFingerprint: getDocumentOutputFingerprint(afterContent),
      workingCopyFingerprint: getDocumentSemanticFingerprint({ index, workingCopy: true })
    },
    source: DOCUMENT_OPERATION_SOURCES.AI_APPROVED,
    target: {
      baseRevision: sectionFingerprint,
      documentFingerprint: getDocumentSemanticFingerprint({ documentId, index }),
      nextHeadingBlockId: index === 10 ? null : `block-section-${index + 1}`,
      previousHeadingBlockId: index === 1 ? null : `block-section-${index - 1}`,
      protectedBlockIds: beforeContent.map((node) => node.attrs?.blockId).filter(Boolean),
      scopeFingerprint,
      sectionFingerprint,
      stableId: `block-section-${index}`
    }
  });
};
const rootOperation = (index, beforeContent, afterContent) => createDocumentRootOperation({
  actor: uid,
  baseRevision: getDocumentSemanticFingerprint(beforeContent),
  idempotencyKey: `rollback-source-root-${index}`,
  payload: {
    documentOutputFingerprint: getDocumentOutputFingerprint(afterContent),
    kind: "ai-report-document",
    proposalFingerprint: getDocumentSemanticFingerprint({ index, proposal: true }),
    scopeFingerprint: getDocumentSemanticFingerprint({ index, scope: true }),
    workingCopyFingerprint: getDocumentSemanticFingerprint({ index, workingCopy: true })
  },
  source: DOCUMENT_OPERATION_SOURCES.AI_APPROVED,
  targetFingerprint: getDocumentSemanticFingerprint(beforeContent),
  type: DOCUMENT_OPERATION_TYPES.REPLACE_SELECTION
});
const capture = ({
  approvalActor,
  index = 1,
  beforeContent = content(`before-${index}`),
  afterContent = content(`after-${index}`),
  now = index,
  operation,
  target,
  storage = window.localStorage
} = {}) => {
  const sourceOperation = operation || sectionOperation(index, beforeContent, afterContent);
  return captureDocumentOperationRollbackSnapshot({
    uid,
    documentId,
    operation: sourceOperation,
    ...(approvalActor === undefined ? {} : { approvalActor }),
    attemptEvent: attempt(sourceOperation, index),
    target: target || sourceOperation.target,
    beforeContent,
    afterContent,
    storage,
    now
  });
};
const operationId = (index) => getDocumentOperationId(sectionOperation(
  index,
  content(`before-${index}`),
  content(`after-${index}`)
));

beforeEach(() => window.localStorage.clear());

describe("document operation rollback snapshot", () => {
  it("persists an exact scoped snapshot idempotently without treating it as authority", () => {
    const snapshot = capture({ index: 1, now: 100 });
    expect(snapshot).toMatchObject({
      attemptEventId: `${operationId(1)}:attempt`,
      attemptSequence: 1,
      originalOperationId: operationId(1),
      target: {
        kind: "section-range",
        nextHeadingBlockId: "block-section-2",
        previousHeadingBlockId: null,
        stableId: "block-section-1"
      }
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.beforeContent)).toBe(true);
    expect(snapshot.beforeContentFingerprint).toBe(
      fingerprintDocumentOperationRollbackContent(snapshot.beforeContent)
    );
    expect(snapshot.afterContentFingerprint).toBe(
      fingerprintDocumentOperationRollbackContent(snapshot.afterContent)
    );
    expect(fingerprintDocumentOperationRollbackSnapshot(snapshot)).toMatch(
      /^rollback-snapshot-v2-[a-f0-9]+-[0-9]+$/
    );
    expect(snapshot.originalOperation).toEqual(sectionOperation(
      1,
      content("before-1"),
      content("after-1")
    ));

    const replay = capture({ index: 1, now: 999 });
    expect(replay).toEqual(snapshot);
    expect(replay.createdAt).toBe(100);
    expect(inspectDocumentOperationRollbackSnapshots(uid, documentId)).toEqual({
      snapshots: [snapshot],
      status: "valid"
    });
    expect(readDocumentOperationRollbackSnapshot(uid, documentId, operationId(1))).toEqual(snapshot);
    expect(readDocumentOperationRollbackSnapshot("other-user", documentId, operationId(1))).toBeNull();
    expect(readDocumentOperationRollbackSnapshot(uid, "other-doc", operationId(1))).toBeNull();
    const raw = window.localStorage.getItem(
      createDocumentOperationRollbackSnapshotKey(uid, documentId)
    );
    expect(raw).not.toContain("privateAuthority");
    expect(raw).not.toContain("prompt");
  });

  it("builds only an operation-bound pre-apply candidate", () => {
    const beforeContent = content("before-candidate");
    const afterContent = content("after-candidate");
    const operation = sectionOperation(1, beforeContent, afterContent);
    const candidate = createDocumentOperationRollbackSnapshotCandidate({
      beforeContent,
      afterContent,
      operation
    });
    expect(candidate).toEqual({
      afterContent,
      beforeContent,
      target: createDocumentOperationRollbackTarget(operation.target)
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(createDocumentOperationRollbackSnapshotCandidate({
      beforeContent,
      afterContent: content("wrong-output"),
      operation
    })).toBeNull();
    expect(createDocumentOperationRollbackSnapshotCandidate({
      beforeContent: afterContent,
      afterContent,
      operation
    })).toBeNull();
  });

  it("resolves only the exact applied target and distinguishes stale, expired, and replayed state", () => {
    const snapshot = capture({ index: 1, now: 1_000 });
    expect(resolveDocumentOperationRollbackSnapshot({
      snapshot,
      currentContent: snapshot.afterContent,
      now: 2_000
    })).toEqual({ snapshot, status: "ready" });
    expect(resolveDocumentOperationRollbackSnapshot({
      snapshot,
      currentContent: snapshot.beforeContent,
      now: 2_000
    })).toEqual({ snapshot: null, status: "already-rolled-back" });
    expect(resolveDocumentOperationRollbackSnapshot({
      snapshot,
      currentContent: content("later-edit"),
      now: 2_000
    })).toEqual({ snapshot: null, status: "stale" });
    expect(resolveDocumentOperationRollbackSnapshot({
      snapshot,
      currentContent: snapshot.afterContent,
      now: snapshot.expiresAt
    })).toEqual({ snapshot: null, status: "expired" });
    expect(resolveDocumentOperationRollbackSnapshot({
      snapshot,
      currentContent: { type: "doc", content: [] },
      now: 2_000
    })).toEqual({ snapshot: null, status: "invalid" });
  });

  it("supports exact document-root snapshots and rejects unsupported block ranges and no-ops", () => {
    const target = createDocumentOperationRollbackTarget({ stableId: DOCUMENT_ROOT_STABLE_ID });
    const beforeContent = { content: content("root-before"), type: "doc" };
    const afterContent = { content: content("root-after"), type: "doc" };
    const operation = rootOperation(1, beforeContent, afterContent);
    const snapshot = capture({ beforeContent, afterContent, operation, target });
    expect(snapshot.target).toEqual({ kind: "root", stableId: DOCUMENT_ROOT_STABLE_ID });
    expect(resolveDocumentOperationRollbackSnapshot({
      snapshot,
      currentContent: afterContent,
      now: 2
    }).status).toBe("ready");
    expect(capture({
      beforeContent,
      afterContent: beforeContent,
      operation,
      target
    })).toBeNull();
    expect(createDocumentOperationRollbackTarget({
      blockFingerprint: "fp-block",
      fromOffset: 0,
      stableId: "block-1",
      toOffset: 3
    })).toBeNull();
  });

  it("binds a pseudonymous runtime operation to the authenticated approving actor", () => {
    const beforeContent = { content: content("delegated-root-before"), type: "doc" };
    const afterContent = { content: content("delegated-root-after"), type: "doc" };
    const operation = {
      ...rootOperation(7, beforeContent, afterContent),
      actor: `actor-v1-${"a".repeat(32)}`
    };
    const snapshot = capture({
      afterContent,
      approvalActor: uid,
      beforeContent,
      operation
    });

    expect(snapshot).toMatchObject({
      approvalActor: uid,
      originalOperation: { actor: operation.actor }
    });
    expect(capture({ afterContent, beforeContent, operation })).toBeNull();
    expect(capture({
      afterContent,
      approvalActor: "other-owner",
      beforeContent,
      operation
    })).toBeNull();
    expect(capture({
      afterContent,
      approvalActor: uid,
      beforeContent,
      operation: { ...operation, actor: "unbound-runtime" }
    })).toBeNull();
  });

  it("fails closed on operation collisions and never overwrites corrupt storage", () => {
    const first = capture({ index: 1 });
    const key = createDocumentOperationRollbackSnapshotKey(uid, documentId);
    const original = window.localStorage.getItem(key);
    expect(capture({
      index: 1,
      beforeContent: content("different-before"),
      operation: first.originalOperation
    })).toBeNull();
    expect(window.localStorage.getItem(key)).toBe(original);

    window.localStorage.setItem(key, "not-json");
    expect(inspectDocumentOperationRollbackSnapshots(uid, documentId)).toEqual({
      snapshots: [],
      status: "corrupt"
    });
    expect(capture({ index: 2 })).toBeNull();
    expect(window.localStorage.getItem(key)).toBe("not-json");
    expect(removeDocumentOperationRollbackSnapshot(
      uid,
      documentId,
      first.originalOperationId
    )).toBe(false);
  });

  it.each([
    ["content hash", (record) => { record.afterContent[0].content[0].text = "tampered"; }],
    ["extra field", (record) => { record.privateAuthority = "must-not-exist"; }],
    ["attempt anchor", (record) => { record.attemptEventId = "other:attempt"; }],
    ["operation binding", (record) => {
      record.originalOperation.payload.sectionOutputFingerprint = `fp-v1-${"f".repeat(32)}`;
    }],
    ["target boundary", (record) => { record.target.nextHeadingBlockId = record.target.stableId; }]
  ])("detects %s tampering on reopen", (_label, tamper) => {
    capture({ index: 1 });
    const key = createDocumentOperationRollbackSnapshotKey(uid, documentId);
    const envelope = JSON.parse(window.localStorage.getItem(key));
    tamper(envelope.records[0]);
    window.localStorage.setItem(key, JSON.stringify(envelope));
    expect(inspectDocumentOperationRollbackSnapshots(uid, documentId)).toEqual({
      snapshots: [],
      status: "corrupt"
    });
  });

  it("bounds live records without evicting them and reclaims only expired capacity", () => {
    for (let index = 1; index <= DOCUMENT_OPERATION_ROLLBACK_MAX_RECORDS; index += 1) {
      expect(capture({ index, now: index })).not.toBeNull();
    }
    expect(capture({ index: DOCUMENT_OPERATION_ROLLBACK_MAX_RECORDS + 1, now: 100 })).toBeNull();
    const afterExpiry = capture({
      index: DOCUMENT_OPERATION_ROLLBACK_MAX_RECORDS + 1,
      now: DOCUMENT_OPERATION_ROLLBACK_TTL_MS + 2
    });
    expect(afterExpiry).not.toBeNull();
    const snapshots = inspectDocumentOperationRollbackSnapshots(uid, documentId).snapshots;
    expect(snapshots).toHaveLength(DOCUMENT_OPERATION_ROLLBACK_MAX_RECORDS - 1);
    expect(snapshots.some(({ originalOperationId }) => originalOperationId === operationId(1))).toBe(false);
    expect(snapshots.at(-1).originalOperationId).toBe(
      operationId(DOCUMENT_OPERATION_ROLLBACK_MAX_RECORDS + 1)
    );
  });

  it("fails before storage overflow instead of silently dropping live rollback evidence", () => {
    const large = "x".repeat(450_000);
    expect(capture({
      index: 1,
      beforeContent: content("large-before-1", large),
      afterContent: content("large-after-1", large)
    })).not.toBeNull();
    expect(capture({
      index: 2,
      beforeContent: content("large-before-2", large),
      afterContent: content("large-after-2", large)
    })).not.toBeNull();
    expect(capture({
      index: 3,
      beforeContent: content("large-before-3", large),
      afterContent: content("large-after-3", large)
    })).toBeNull();
    expect(inspectDocumentOperationRollbackSnapshots(uid, documentId).snapshots).toHaveLength(2);
  });

  it("removes one exact snapshot without disturbing sibling evidence and reports unavailable storage", () => {
    capture({ index: 1 });
    capture({ index: 2 });
    expect(removeDocumentOperationRollbackSnapshot(uid, documentId, operationId(1))).toBe(true);
    expect(readDocumentOperationRollbackSnapshot(uid, documentId, operationId(1))).toBeNull();
    expect(readDocumentOperationRollbackSnapshot(uid, documentId, operationId(2))).not.toBeNull();
    expect(removeDocumentOperationRollbackSnapshot(uid, documentId, operationId(1))).toBe(true);

    const unavailable = {
      getItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); }
    };
    expect(inspectDocumentOperationRollbackSnapshots(uid, documentId, unavailable)).toEqual({
      snapshots: [],
      status: "unavailable"
    });
    expect(capture({ index: 3, storage: unavailable })).toBeNull();
  });
});
