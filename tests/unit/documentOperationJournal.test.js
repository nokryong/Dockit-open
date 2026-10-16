/* @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DOCUMENT_OPERATION_JOURNAL_MAX_EVENTS,
  appendAppliedDocumentOperation,
  appendDocumentOperationResult,
  appendDocumentOperationAttempt,
  classifyDocumentOperationRecovery,
  appendRejectedDocumentOperation,
  createDocumentOperationContentCheckpoint,
  createDocumentOperationJournalKey,
  createRestoredDocumentOperationContentCheckpoint,
  enqueueDocumentOperationResultRetry,
  flushDocumentOperationResultRetries,
  getDocumentOperationJournalCursor,
  inspectDocumentOperationJournal,
  readDocumentOperationJournal,
  resolveDocumentOperationContentCheckpoint,
  resolveDocumentOperationSaveOutcome,
  transitionDocumentOperationsThrough
} from "../../app/LIB/utils/documentOperationJournal";

const createStorage = () => {
  window.localStorage.clear();
  return window.localStorage;
};

const operation = {
  actor: "user:user-a",
  schemaVersion: 1,
  source: "manual",
  target: { stableId: "block-1" },
  targetFingerprint: "fp-target",
  type: "format-toggle",
  payload: { mark: "bold", rawHtml: "<p>must-not-persist</p>" }
};
const result = {
  ok: true,
  operationId: "dop-1",
  beforeFingerprint: "fp-before",
  afterFingerprint: "fp-after"
};

const appendOperation = ({
  uid = "user-a",
  documentId = "doc-a",
  operationId = result.operationId,
  storage,
  now = 1
} = {}) => {
  const nextResult = { ...result, operationId };
  expect(
    appendDocumentOperationAttempt({
      uid,
      documentId,
      operation,
      operationId,
      storage,
      now
    })
  ).toBe(true);
  expect(
    appendAppliedDocumentOperation({
      uid,
      documentId,
      operation,
      result: nextResult,
      storage,
      now: now + 1
    })
  ).toBe(true);
};

describe("document operation journal", () => {
  it("persists scoped metadata-only attempt and applied events", () => {
    const storage = createStorage();
    appendOperation({ storage });

    const events = readDocumentOperationJournal("user-a", "doc-a", storage);
    expect(events).toHaveLength(2);
    expect(events.map(({ kind }) => kind)).toEqual(["attempt", "applied"]);
    expect(events.at(-1)).toMatchObject({
      actor: "user:user-a",
      operationId: "dop-1",
      persistenceStatus: "pending",
      targetStableId: "block-1"
    });
    const serialized = storage.getItem(
      createDocumentOperationJournalKey("user-a", "doc-a")
    );
    expect(serialized).not.toContain("mark");
    expect(serialized).not.toContain("rawHtml");
    expect(serialized).not.toContain("must-not-persist");
    expect(serialized).not.toContain("payload");
    expect(readDocumentOperationJournal("user-b", "doc-a", storage)).toEqual(
      []
    );
    expect(readDocumentOperationJournal("user-a", "doc-b", storage)).toEqual(
      []
    );
  });

  it("appends one idempotent compensation referencing a restored rejected operation", () => {
    const storage = createStorage();
    const rejected = {
      ...result,
      ok: false,
      operationId: "dop-restored",
      beforeFingerprint: "fp-before",
      afterFingerprint: "fp-before",
      error: "OutOfRangeMutation",
      compensation: {
        originalOperationId: "dop-restored",
        reason: "OutOfRangeMutation",
        restorationVerified: true
      }
    };
    expect(appendDocumentOperationAttempt({
      uid: "user-a", documentId: "doc-a", operation, operationId: "dop-restored", storage, now: 1
    })).toBe(true);
    expect(appendDocumentOperationResult({
      uid: "user-a", documentId: "doc-a", operation, result: rejected, storage, now: 2
    })).toBe(true);
    expect(appendDocumentOperationResult({
      uid: "user-a", documentId: "doc-a", operation, result: rejected, storage, now: 3
    })).toBe(true);

    const events = readDocumentOperationJournal("user-a", "doc-a", storage);
    expect(events.map(({ kind }) => kind)).toEqual(["attempt", "rejected", "compensation"]);
    expect(events.at(-1)).toMatchObject({
      operationId: "comp-v1-dop-restored",
      originalOperationId: "dop-restored",
      restorationVerified: true
    });
    expect(JSON.stringify(events)).not.toContain("rawHtml");
    expect(classifyDocumentOperationRecovery({
      uid: "user-a", documentId: "doc-a", storage
    })).toMatchObject({
      status: "compensated-evidence",
      operations: [{ operationId: "dop-restored", status: "compensated-evidence" }]
    });
  });

  it("fails closed for a forged or impossible compensation history", () => {
    const storage = createStorage();
    appendOperation({ storage });
    const key = createDocumentOperationJournalKey("user-a", "doc-a");
    const forged = JSON.parse(storage.getItem(key));
    forged.events.push({
      documentId: "doc-a",
      eventId: "comp-v1-dop-1:rollback",
      kind: "compensation",
      occurredAt: 3,
      operationId: "comp-v1-dop-1",
      originalOperationId: "dop-1",
      persistenceStatus: "failed",
      reason: "OutOfRangeMutation",
      restorationVerified: true,
      schemaVersion: 1,
      sequence: 3,
      uid: "user-a"
    });
    storage.setItem(key, JSON.stringify(forged));
    expect(inspectDocumentOperationJournal("user-a", "doc-a", storage).status).toBe("corrupt");
  });

  it.each([
    ["reason", (event) => { event.reason = "PostconditionFailed"; }],
    ["restored fingerprint", (_event, rejected) => { rejected.afterFingerprint = "fp-tampered"; }],
    ["timestamp", (event) => { event.occurredAt = 1; }]
  ])("rejects compensation that is not bound to the original %s", (_label, tamper) => {
    const storage = createStorage();
    const rejectedResult = {
      ...result,
      ok: false,
      operationId: "dop-bound",
      beforeFingerprint: "fp-before",
      afterFingerprint: "fp-before",
      error: "OutOfRangeMutation",
      compensation: {
        originalOperationId: "dop-bound",
        reason: "OutOfRangeMutation",
        restorationVerified: true
      }
    };
    expect(appendDocumentOperationAttempt({
      uid: "user-a", documentId: "doc-a", operation, operationId: "dop-bound", storage, now: 1
    })).toBe(true);
    expect(appendDocumentOperationResult({
      uid: "user-a", documentId: "doc-a", operation, result: rejectedResult, storage, now: 2
    })).toBe(true);
    const key = createDocumentOperationJournalKey("user-a", "doc-a");
    const journal = JSON.parse(storage.getItem(key));
    const rejected = journal.events.find((event) => event.kind === "rejected");
    const compensation = journal.events.find((event) => event.kind === "compensation");
    tamper(compensation, rejected);
    storage.setItem(key, JSON.stringify(journal));
    expect(inspectDocumentOperationJournal("user-a", "doc-a", storage).status).toBe("corrupt");
  });

  it("bounds retained events while keeping sequence order valid", () => {
    const storage = createStorage();
    const operationCount = DOCUMENT_OPERATION_JOURNAL_MAX_EVENTS / 2;

    for (let index = 1; index <= operationCount; index += 1) {
      appendOperation({
        operationId: `dop-${index}`,
        storage,
        now: index * 2
      });
    }

    const events = readDocumentOperationJournal("user-a", "doc-a", storage);
    expect(events).toHaveLength(DOCUMENT_OPERATION_JOURNAL_MAX_EVENTS);
    expect(
      events.every(
        (event, index) =>
          index === 0 || event.sequence > events[index - 1].sequence
      )
    ).toBe(true);
  });

  it("fails closed at 96 pending events without dropping an unresolved operation", () => {
    const storage = createStorage();

    for (let index = 1; index <= DOCUMENT_OPERATION_JOURNAL_MAX_EVENTS / 2; index += 1) {
      appendOperation({ operationId: `dop-pending-${index}`, storage, now: index * 2 });
    }
    const before = readDocumentOperationJournal("user-a", "doc-a", storage);

    expect(
      appendDocumentOperationAttempt({
        uid: "user-a",
        documentId: "doc-a",
        operation,
        operationId: "dop-overflow",
        storage,
        now: 1000
      })
    ).toBe(false);
    expect(readDocumentOperationJournal("user-a", "doc-a", storage)).toEqual(before);
  });

  it("does not evict failed rejected operations from a full unresolved window", () => {
    const storage = createStorage();
    for (let index = 1; index <= DOCUMENT_OPERATION_JOURNAL_MAX_EVENTS / 2; index += 1) {
      const operationId = `dop-rejected-${index}`;
      expect(appendDocumentOperationAttempt({
        uid: "user-a", documentId: "doc-a", operation, operationId, storage, now: index * 2
      })).toBe(true);
      expect(appendRejectedDocumentOperation({
        uid: "user-a", documentId: "doc-a", operation,
        result: { ...result, ok: false, operationId, error: "Rejected" }, storage, now: index * 2 + 1
      })).toBe(true);
    }
    expect(appendDocumentOperationAttempt({
      uid: "user-a", documentId: "doc-a", operation, operationId: "dop-overflow", storage, now: 1000
    })).toBe(false);
  });

  it("compacts only whole durable operations before accepting later events", () => {
    const storage = createStorage();

    for (let index = 1; index <= DOCUMENT_OPERATION_JOURNAL_MAX_EVENTS / 2; index += 1) {
      appendOperation({ operationId: `dop-durable-${index}`, storage, now: index * 2 });
    }
    const cursor = getDocumentOperationJournalCursor("user-a", "doc-a", storage);
    expect(
      transitionDocumentOperationsThrough({
        uid: "user-a",
        documentId: "doc-a",
        coveredThroughSequence: cursor,
        acknowledgementId: "save-durable",
        persistenceStatus: "durable",
        storage,
        now: 1000
      })
    ).toBe(true);

    const retained = readDocumentOperationJournal("user-a", "doc-a", storage);
    expect(retained.length).toBeLessThanOrEqual(DOCUMENT_OPERATION_JOURNAL_MAX_EVENTS);
    expect(
      [...new Set(retained.map(({ operationId }) => operationId))].every((operationId) =>
        retained.filter((event) => event.operationId === operationId).some((event) =>
          event.kind === "transition" && event.persistenceStatus === "durable"
        )
      )
    ).toBe(true);
    expect(
      appendDocumentOperationAttempt({
        uid: "user-a",
        documentId: "doc-a",
        operation,
        operationId: "dop-after-compaction",
        storage,
        now: 1001
      })
    ).toBe(true);
  });

  it("compacts only whole compensated bundles without leaving orphan evidence", () => {
    const storage = createStorage();
    const bundleCount = DOCUMENT_OPERATION_JOURNAL_MAX_EVENTS / 3 + 2;
    for (let index = 1; index <= bundleCount; index += 1) {
      const operationId = `dop-compensated-${index}`;
      expect(appendDocumentOperationAttempt({
        uid: "user-a", documentId: "doc-a", operation, operationId, storage, now: index * 3
      })).toBe(true);
      expect(appendDocumentOperationResult({
        uid: "user-a",
        documentId: "doc-a",
        operation,
        result: {
          ...result,
          ok: false,
          operationId,
          beforeFingerprint: `fp-${index}`,
          afterFingerprint: `fp-${index}`,
          error: "OutOfRangeMutation",
          compensation: {
            originalOperationId: operationId,
            reason: "OutOfRangeMutation",
            restorationVerified: true
          }
        },
        storage,
        now: index * 3 + 1
      })).toBe(true);
    }

    const events = readDocumentOperationJournal("user-a", "doc-a", storage);
    const operationIds = new Set(
      events.filter(({ kind }) => kind !== "compensation").map(({ operationId }) => operationId)
    );
    expect(events.length).toBeLessThanOrEqual(DOCUMENT_OPERATION_JOURNAL_MAX_EVENTS);
    expect(events.filter(({ kind }) => kind === "compensation").every(
      ({ originalOperationId }) => operationIds.has(originalOperationId)
    )).toBe(true);
    expect(inspectDocumentOperationJournal("user-a", "doc-a", storage).status).toBe("valid");
    expect(appendDocumentOperationAttempt({
      uid: "user-a", documentId: "doc-a", operation,
      operationId: "dop-after-compensation-compaction", storage, now: 1000
    })).toBe(true);
  });

  it("keeps acknowledgements idempotent and allows a failed save to become durable after retry", () => {
    const storage = createStorage();
    appendOperation({ storage });
    const cursor = getDocumentOperationJournalCursor(
      "user-a",
      "doc-a",
      storage
    );

    expect(
      transitionDocumentOperationsThrough({
        uid: "user-a",
        documentId: "doc-a",
        coveredThroughSequence: cursor,
        acknowledgementId: "save-failed",
        persistenceStatus: "recovery-required",
        storage,
        now: 10
      })
    ).toBe(true);
    expect(
      transitionDocumentOperationsThrough({
        uid: "user-a",
        documentId: "doc-a",
        coveredThroughSequence: cursor,
        acknowledgementId: "save-failed",
        persistenceStatus: "recovery-required",
        storage,
        now: 11
      })
    ).toBe(true);
    expect(
      transitionDocumentOperationsThrough({
        uid: "user-a",
        documentId: "doc-a",
        coveredThroughSequence: cursor,
        acknowledgementId: "save-retry",
        persistenceStatus: "durable",
        storage,
        now: 12
      })
    ).toBe(true);
    expect(
      transitionDocumentOperationsThrough({
        uid: "user-a",
        documentId: "doc-a",
        coveredThroughSequence: cursor,
        acknowledgementId: "later-failure",
        persistenceStatus: "failed",
        storage,
        now: 13
      })
    ).toBe(true);

    const transitions = readDocumentOperationJournal(
      "user-a",
      "doc-a",
      storage
    ).filter((event) => event.kind === "transition");
    expect(transitions.map(({ persistenceStatus }) => persistenceStatus)).toEqual(
      ["recovery-required", "durable"]
    );
  });

  it("appends a rejected result without making it eligible for save acknowledgement", () => {
    const storage = createStorage();
    expect(
      appendDocumentOperationAttempt({
        uid: "user-a",
        documentId: "doc-a",
        operation,
        operationId: "dop-rejected",
        storage,
        now: 1
      })
    ).toBe(true);
    expect(
      appendRejectedDocumentOperation({
        uid: "user-a",
        documentId: "doc-a",
        operation,
        result: {
          ...result,
          ok: false,
          operationId: "dop-rejected",
          error: "TargetMismatch"
        },
        storage,
        now: 2
      })
    ).toBe(true);

    const cursor = getDocumentOperationJournalCursor(
      "user-a",
      "doc-a",
      storage
    );
    expect(
      transitionDocumentOperationsThrough({
        uid: "user-a",
        documentId: "doc-a",
        coveredThroughSequence: cursor,
        acknowledgementId: "save-rejected",
        persistenceStatus: "durable",
        storage
      })
    ).toBe(true);
    const events = readDocumentOperationJournal("user-a", "doc-a", storage);
    expect(events.map(({ kind }) => kind)).toEqual(["attempt", "rejected"]);
  });

  it("binds acknowledgement coverage to the exact React HTML snapshot", () => {
    const storage = createStorage();
    appendOperation({ storage });
    const checkpoint = createDocumentOperationContentCheckpoint({
      uid: "user-a",
      documentId: "doc-a",
      content: "<p>first snapshot</p>",
      storage
    });
    const capturedCursor = checkpoint.coveredThroughSequence;

    appendOperation({ operationId: "dop-later", storage, now: 20 });
    expect(getDocumentOperationJournalCursor("user-a", "doc-a", storage)).toBeGreaterThan(
      capturedCursor
    );
    expect(
      resolveDocumentOperationContentCheckpoint(
        checkpoint,
        {
          uid: "user-a",
          documentId: "doc-a",
          content: "<p>first snapshot</p>"
        }
      )
    ).toBe(capturedCursor);
    expect(
      resolveDocumentOperationContentCheckpoint(
        checkpoint,
        {
          uid: "user-a",
          documentId: "doc-a",
          content: "<p>stale save payload</p>"
        }
      )
    ).toBe(0);
    expect(
      resolveDocumentOperationContentCheckpoint(checkpoint, {
        uid: "user-a",
        documentId: "doc-b",
        content: "<p>first snapshot</p>"
      })
    ).toBe(0);
  });

  it("never marks a successful save of different content as durable", () => {
    const checkpoint = { content: "<p>exact checkpoint</p>", revision: 7 };
    expect(resolveDocumentOperationSaveOutcome({
      checkpoint,
      savedContent: "<p>different content</p>",
      succeeded: true
    })).toEqual({
      clearCheckpointDraft: false,
      persistenceStatus: "recovery-required",
      savedExactCheckpoint: false
    });
    expect(resolveDocumentOperationSaveOutcome({
      checkpoint,
      savedContent: checkpoint.content,
      succeeded: true
    })).toEqual({
      clearCheckpointDraft: true,
      persistenceStatus: "durable",
      savedExactCheckpoint: true
    });
    expect(resolveDocumentOperationSaveOutcome({
      checkpoint: {},
      savedContent: undefined,
      succeeded: true
    })).toMatchObject({
      clearCheckpointDraft: false,
      persistenceStatus: "recovery-required",
      savedExactCheckpoint: false
    });
  });

  it("fails closed for corrupt/unavailable storage and retains an attempt when the applied append fails", () => {
    const storage = createStorage();
    storage.setItem(
      createDocumentOperationJournalKey("user-a", "doc-a"),
      "not-json"
    );
    expect(
      appendDocumentOperationAttempt({
        uid: "user-a",
        documentId: "doc-a",
        operation,
        operationId: "dop-corrupt",
        storage
      })
    ).toBe(false);

    const unavailable = {
      getItem: () => {
        throw new Error("blocked");
      }
    };
    expect(
      appendDocumentOperationAttempt({
        uid: "user-a",
        documentId: "doc-a",
        operation,
        operationId: "dop-unavailable",
        storage: unavailable
      })
    ).toBe(false);

    const values = new Map();
    let writesBlocked = false;
    const quotaAfterAttempt = {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => {
        if (writesBlocked) throw new Error("quota");
        values.set(key, value);
      }
    };
    expect(
      appendDocumentOperationAttempt({
        uid: "user-a",
        documentId: "doc-a",
        operation,
        operationId: "dop-quota",
        storage: quotaAfterAttempt
      })
    ).toBe(true);
    writesBlocked = true;
    expect(
      appendAppliedDocumentOperation({
        uid: "user-a",
        documentId: "doc-a",
        operation,
        result: { ...result, operationId: "dop-quota" },
        storage: quotaAfterAttempt
      })
    ).toBe(false);
    expect(
      readDocumentOperationJournal(
        "user-a",
        "doc-a",
        quotaAfterAttempt
      ).map(({ kind }) => kind)
    ).toEqual(["attempt"]);

    const retryQueue = new Map();
    expect(
      enqueueDocumentOperationResultRetry(retryQueue, {
        uid: "user-a",
        documentId: "doc-a",
        operation,
        result: { ...result, operationId: "dop-quota" }
      })
    ).toBe(true);

    writesBlocked = false;
    expect(
      transitionDocumentOperationsThrough({
        uid: "user-a",
        documentId: "doc-a",
        coveredThroughSequence: 1,
        acknowledgementId: "save-before-result-retry",
        persistenceStatus: "durable",
        storage: quotaAfterAttempt,
        now: 10
      })
    ).toBe(true);
    expect(
      readDocumentOperationJournal("user-a", "doc-a", quotaAfterAttempt)
        .filter(({ kind }) => kind === "transition")
        .map(({ persistenceStatus }) => persistenceStatus)
    ).toEqual(["recovery-required"]);

    expect(
      flushDocumentOperationResultRetries({
        retryQueue,
        uid: "user-a",
        documentId: "doc-a",
        storage: quotaAfterAttempt
      })
    ).toEqual({ flushed: 1, pending: 0 });
    expect(
      appendDocumentOperationResult({
        uid: "user-a",
        documentId: "doc-a",
        operation,
        result: { ...result, operationId: "dop-quota" },
        storage: quotaAfterAttempt
      })
    ).toBe(true);

    const retryCheckpoint = createDocumentOperationContentCheckpoint({
      uid: "user-a",
      documentId: "doc-a",
      content: "<p>applied content</p>",
      storage: quotaAfterAttempt
    });
    expect(
      transitionDocumentOperationsThrough({
        uid: "user-a",
        documentId: "doc-a",
        coveredThroughSequence: retryCheckpoint.coveredThroughSequence,
        acknowledgementId: "save-after-result-retry",
        persistenceStatus: "durable",
        storage: quotaAfterAttempt,
        now: 20
      })
    ).toBe(true);
    expect(
      readDocumentOperationJournal("user-a", "doc-a", quotaAfterAttempt)
        .filter(({ kind }) => kind === "transition")
        .map(({ persistenceStatus }) => persistenceStatus)
    ).toEqual(["recovery-required", "durable"]);
  });

  it("strictly classifies every reopen state without inferring durable from an attempt", () => {
    const storage = createStorage();
    const appendAttempt = (operationId, now) =>
      appendDocumentOperationAttempt({
        uid: "user-a", documentId: "doc-a", operation, operationId, storage, now
      });
    expect(appendAttempt("needs-recovery", 1)).toBe(true);
    expect(transitionDocumentOperationsThrough({
      uid: "user-a", documentId: "doc-a", coveredThroughSequence: 1,
      acknowledgementId: "save-interrupted", persistenceStatus: "recovery-required", storage, now: 2
    })).toBe(true);
    expect(appendAttempt("unresolved", 10)).toBe(true);
    appendOperation({ operationId: "pending", storage, now: 20 });
    expect(appendAttempt("failed", 30)).toBe(true);
    expect(appendRejectedDocumentOperation({
      uid: "user-a", documentId: "doc-a", operation,
      result: { ...result, ok: false, operationId: "failed", error: "Rejected" }, storage, now: 31
    })).toBe(true);
    const classification = classifyDocumentOperationRecovery({
      uid: "user-a", documentId: "doc-a", storage
    });
    expect(classification.status).toBe("recovery-required");
    expect(Object.fromEntries(classification.operations.map(({ operationId, status }) => [operationId, status]))).toMatchObject({
      unresolved: "unresolved-attempt", pending: "applied-pending", failed: "failed",
      "needs-recovery": "recovery-required"
    });

    const durableStorage = createStorage();
    appendOperation({ operationId: "durable", storage: durableStorage, now: 40 });
    expect(transitionDocumentOperationsThrough({
      uid: "user-a", documentId: "doc-a", coveredThroughSequence: 2,
      acknowledgementId: "save-ok", persistenceStatus: "durable", storage: durableStorage, now: 42
    })).toBe(true);
    expect(classifyDocumentOperationRecovery({ uid: "user-a", documentId: "doc-a", storage: durableStorage })).toMatchObject({
      status: "durable-evidence",
      operations: [{ operationId: "durable", status: "durable-evidence" }]
    });
  });

  it("fails closed for impossible histories and keeps journal scope isolated on reopen", () => {
    const storage = createStorage();
    appendOperation({ storage });
    const key = createDocumentOperationJournalKey("user-a", "doc-a");
    const forged = JSON.parse(storage.getItem(key));
    // Each forged event has a valid allowlisted shape, but two applied
    // results after an attempt-only recovery transition are impossible.
    forged.events = [
      forged.events[0],
      {
        acknowledgementId: "interrupted-save",
        coveredThroughSequence: 1,
        documentId: "doc-a",
        eventId: "dop-1:ack:interrupted-save:recovery-required",
        kind: "transition",
        occurredAt: 3,
        operationId: "dop-1",
        persistenceStatus: "recovery-required",
        sequence: 2,
        uid: "user-a"
      },
      { ...forged.events[1], eventId: "late-applied", occurredAt: 4, sequence: 3 },
      { ...forged.events[1], eventId: "duplicate-applied", occurredAt: 5, sequence: 4 }
    ];
    storage.setItem(key, JSON.stringify(forged));

    expect(inspectDocumentOperationJournal("user-a", "doc-a", storage).status).toBe("corrupt");
    expect(classifyDocumentOperationRecovery({ uid: "user-a", documentId: "doc-a", storage }).status).toBe("storage-warning");
    expect(classifyDocumentOperationRecovery({ uid: "user-b", documentId: "doc-a", storage })).toMatchObject({
      journalStatus: "missing", status: "clean"
    });
    expect(classifyDocumentOperationRecovery({ uid: "user-a", documentId: "doc-b", storage })).toMatchObject({
      journalStatus: "missing", status: "clean"
    });
  });

  it("accepts a rejected result recorded after an attempt-only recovery transition", () => {
    const storage = createStorage();
    expect(
      appendDocumentOperationAttempt({
        uid: "user-a",
        documentId: "doc-a",
        operation,
        operationId: "rejected-after-recovery",
        storage,
        now: 1
      })
    ).toBe(true);
    expect(
      transitionDocumentOperationsThrough({
        uid: "user-a",
        documentId: "doc-a",
        coveredThroughSequence: 1,
        acknowledgementId: "interrupted-save",
        persistenceStatus: "recovery-required",
        storage,
        now: 2
      })
    ).toBe(true);
    expect(
      appendRejectedDocumentOperation({
        uid: "user-a",
        documentId: "doc-a",
        operation,
        result: {
          ...result,
          ok: false,
          operationId: "rejected-after-recovery",
          error: "Rejected"
        },
        storage,
        now: 3
      })
    ).toBe(true);

    expect(inspectDocumentOperationJournal("user-a", "doc-a", storage).status).toBe("valid");
    expect(
      classifyDocumentOperationRecovery({
        uid: "user-a",
        documentId: "doc-a",
        storage
      }).status
    ).toBe("failed");
  });

  it("rejects future-covered transitions and result metadata that C3a cannot produce", () => {
    const storage = createStorage();
    appendOperation({ storage });
    const key = createDocumentOperationJournalKey("user-a", "doc-a");
    const futureCovered = JSON.parse(storage.getItem(key));
    futureCovered.events.push({
      acknowledgementId: "future-save",
      coveredThroughSequence: 99,
      documentId: "doc-a",
      eventId: "dop-1:ack:future-save:durable",
      kind: "transition",
      occurredAt: 3,
      operationId: "dop-1",
      persistenceStatus: "durable",
      sequence: 3,
      uid: "user-a"
    });
    storage.setItem(key, JSON.stringify(futureCovered));
    expect(inspectDocumentOperationJournal("user-a", "doc-a", storage).status).toBe("corrupt");

    storage.clear();
    appendOperation({ storage });
    const mismatched = JSON.parse(storage.getItem(key));
    mismatched.events[1].actor = "user:forged";
    storage.setItem(key, JSON.stringify(mismatched));
    expect(inspectDocumentOperationJournal("user-a", "doc-a", storage).status).toBe("corrupt");
  });

  it("binds restored checkpoints to both the cursor sequence and its event identity", () => {
    const storage = createStorage();
    appendOperation({ storage });
    const original = createDocumentOperationContentCheckpoint({
      uid: "user-a",
      documentId: "doc-a",
      content: "<p>recoverable</p>",
      storage
    });
    const restored = createRestoredDocumentOperationContentCheckpoint({
      uid: "user-a",
      documentId: "doc-a",
      content: "<p>recoverable</p>",
      coveredThroughSequence: original.coveredThroughSequence,
      coveredThroughEventId: original.coveredThroughEventId,
      storage
    });
    expect(
      resolveDocumentOperationContentCheckpoint(restored, {
        uid: "user-a",
        documentId: "doc-a",
        content: "<p>recoverable</p>",
        storage
      })
    ).toBe(original.coveredThroughSequence);

    storage.removeItem(createDocumentOperationJournalKey("user-a", "doc-a"));
    appendOperation({ operationId: "replacement-operation", storage, now: 10 });
    expect(
      createRestoredDocumentOperationContentCheckpoint({
        uid: "user-a",
        documentId: "doc-a",
        content: "<p>recoverable</p>",
        coveredThroughSequence: original.coveredThroughSequence,
        coveredThroughEventId: original.coveredThroughEventId,
        storage
      })
    ).toBeNull();
    expect(
      resolveDocumentOperationContentCheckpoint(original, {
        uid: "user-a",
        documentId: "doc-a",
        content: "<p>recoverable</p>",
        storage
      })
    ).toBe(0);
  });

  it("keeps TypeBubble and the exact-snapshot save path wired to the journal", () => {
    const bubble = readFileSync(
      resolve(process.cwd(), "app/LIB/components/write/TypeBubble.js"),
      "utf8"
    );
    const page = readFileSync(
      resolve(process.cwd(), "app/docs/[id]/page.js"),
      "utf8"
    );
    expect(bubble).toContain("getDocumentOperationId(operation)");
    expect(bubble).toContain("onDocumentOperationWillApply");
    expect(bubble).toContain("onDocumentOperationSettled?.({ operation, result })");
    expect(page).toContain("appendDocumentOperationAttempt({");
    expect(page).toContain("appendDocumentOperationResult({");
    expect(page).toContain("enqueueDocumentOperationResultRetry(");
    expect(page).toContain("flushDocumentOperationResultRetries({");
    expect(page).toContain(
      "journalCursorBeforeRetry === checkpointCursorBeforeRetry"
    );
    expect(page).toContain("createDocumentOperationContentCheckpoint({");
    expect(page).toContain("resolveDocumentOperationContentCheckpoint(");
    expect(page).toContain("onChange={handleEditorContentChange}");
    expect(page).toContain("transitionDocumentOperationsThrough({");
    expect(page).toContain("resolveDocumentOperationSaveOutcome({");
    expect(page).not.toContain("classifyDocumentOperationRecovery({");
    expect(page).not.toContain("reapplyDocumentOperation");
  });
});
