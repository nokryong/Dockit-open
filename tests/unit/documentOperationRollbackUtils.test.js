/** @vitest-environment jsdom */
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { redoDepth, undoDepth } from "@tiptap/pm/history";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BlockIdentity from "../../app/LIB/extensions/BlockIdentity";
import HeadingWithId from "../../app/LIB/extensions/HeadingWithId";
import { CustomParagraph } from "../../app/LIB/extensions/ParagraphFontSync";
import {
  appendDocumentOperationAttempt,
  appendDocumentOperationResult,
  createDocumentOperationJournalKey,
  readDocumentOperationJournal
} from "../../app/LIB/utils/documentOperationJournal";
import {
  captureDocumentOperationRollbackSnapshot,
  createDocumentOperationRollbackSnapshotKey
} from "../../app/LIB/utils/documentOperationRollbackSnapshot";
import {
  DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES,
  DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES,
  DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES,
  createDocumentOperationRollbackAdapter,
  createDocumentOperationRollbackOperation
} from "../../app/LIB/utils/documentOperationRollbackUtils";
import {
  DOCUMENT_OPERATION_ERROR_CODES,
  DOCUMENT_OPERATION_SOURCES,
  DOCUMENT_OPERATION_TRANSACTION_META_KEY,
  DOCUMENT_OPERATION_TYPES,
  DOCUMENT_ROOT_STABLE_ID,
  captureDocumentOperationSectionRegions,
  createDocumentRootOperation,
  createDocumentSectionOperation,
  getDocumentOperationId,
  getDocumentOutputFingerprint,
  getDocumentSemanticFingerprint
} from "../../app/LIB/utils/documentOperationUtils";

const uid = "rollback-core-owner";
const actor = `user:${uid}`;
const documentId = "doc:rollback-core";
const editors = [];
const paragraph = (blockId, value) => ({
  attrs: { blockId },
  content: [{ text: value, type: "text" }],
  type: "paragraph"
});
const heading = (blockId, headingId, level, value) => ({
  attrs: { blockId, headingId, level },
  content: [{ text: value, type: "text" }],
  type: "heading"
});
const sectionBeforeRaw = () => [
  heading("block-summary", "heading-summary", 2, "Summary"),
  paragraph("block-summary-old", "Old summary")
];
const sectionAfterRaw = () => [
  heading("block-summary", "heading-summary", 2, "Summary"),
  paragraph("block-summary-new", "Approved summary")
];
const suffixRaw = () => [
  heading("block-actions", "heading-actions", 2, "Actions"),
  paragraph("block-actions-body", "Action body"),
  paragraph("block-outside", "Outside baseline")
];
const fullDocument = (section) => ({
  content: [
    heading("block-title", "heading-title", 1, "Quarterly report"),
    ...section,
    ...suffixRaw()
  ],
  type: "doc"
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const createEditor = async (content = fullDocument(sectionAfterRaw())) => {
  const editor = new Editor({
    content,
    element: document.body.appendChild(document.createElement("div")),
    extensions: [
      Document,
      CustomParagraph,
      HeadingWithId,
      Text,
      UndoRedo,
      BlockIdentity
    ]
  });
  editors.push(editor);
  await settle();
  return editor;
};
const normalizeDocument = (editor, content) => editor.schema.nodeFromJSON(content).toJSON();
const findBlock = (editor, blockId) => {
  let match = null;
  editor.state.doc.descendants((node, position) => {
    if (!match && node.attrs?.blockId === blockId) match = { node, position };
    return !match;
  });
  return match;
};
const replaceBlockText = (editor, blockId, value) => {
  const match = findBlock(editor, blockId);
  if (!match) throw new Error(`missing block: ${blockId}`);
  editor.view.dispatch(editor.state.tr.insertText(
    value,
    match.position + 1,
    match.position + 1 + match.node.content.size
  ));
};
const currentSection = (editor, operation) => {
  const regions = captureDocumentOperationSectionRegions(editor.state.doc, operation.target, {
    verifyProtectedScope: false,
    verifySectionFingerprint: false
  });
  if (!regions.valid) return null;
  return editor.state.doc.content.cut(regions.from, regions.to).toJSON();
};
const operationResult = (operation, beforeDocument, afterDocument) => ({
  afterFingerprint: getDocumentSemanticFingerprint(afterDocument),
  beforeFingerprint: getDocumentSemanticFingerprint(beforeDocument),
  ok: true,
  operationId: getDocumentOperationId(operation)
});

const establishOriginalSectionApply = async ({ appendApplied = true, snapshotNow = 1_000 } = {}) => {
  const editor = await createEditor();
  const beforeDocument = normalizeDocument(editor, fullDocument(sectionBeforeRaw()));
  const afterDocument = editor.getJSON();
  const beforeContent = normalizeDocument(editor, {
    content: sectionBeforeRaw(),
    type: "doc"
  }).content;
  const afterContent = normalizeDocument(editor, {
    content: sectionAfterRaw(),
    type: "doc"
  }).content;
  const sectionFingerprint = getDocumentSemanticFingerprint(beforeContent);
  const scopeFingerprint = getDocumentSemanticFingerprint({ scope: "summary" });
  const operation = createDocumentSectionOperation({
    actor,
    baseRevision: sectionFingerprint,
    idempotencyKey: "original-section-operation",
    payload: {
      kind: "ai-report-section",
      proposalFingerprint: getDocumentSemanticFingerprint({ proposal: "summary" }),
      scopeFingerprint,
      sectionOutputFingerprint: getDocumentOutputFingerprint(afterContent),
      workingCopyFingerprint: getDocumentSemanticFingerprint({ workingCopy: "summary" })
    },
    source: DOCUMENT_OPERATION_SOURCES.AI_APPROVED,
    target: {
      baseRevision: sectionFingerprint,
      documentFingerprint: getDocumentSemanticFingerprint(beforeDocument),
      nextHeadingBlockId: "block-actions",
      previousHeadingBlockId: null,
      protectedBlockIds: beforeContent.map((node) => node.attrs?.blockId).filter(Boolean),
      scopeFingerprint,
      sectionFingerprint,
      stableId: "block-summary"
    }
  });
  const operationId = getDocumentOperationId(operation);
  expect(appendDocumentOperationAttempt({
    uid,
    documentId,
    operation,
    operationId,
    storage: window.localStorage,
    now: 100
  })).toBe(true);
  const attemptEvent = readDocumentOperationJournal(
    uid,
    documentId,
    window.localStorage
  )[0];
  const snapshot = captureDocumentOperationRollbackSnapshot({
    uid,
    documentId,
    operation,
    attemptEvent,
    target: operation.target,
    beforeContent,
    afterContent,
    storage: window.localStorage,
    now: snapshotNow
  });
  expect(snapshot).not.toBeNull();
  if (appendApplied) {
    expect(appendDocumentOperationResult({
      uid,
      documentId,
      operation,
      result: operationResult(operation, beforeDocument, afterDocument),
      storage: window.localStorage,
      now: 101
    })).toBe(true);
  }
  return { afterContent, afterDocument, beforeContent, beforeDocument, editor, operation, snapshot };
};

const establishOriginalRootApply = async ({ delegated = false } = {}) => {
  const beforeRaw = fullDocument(sectionBeforeRaw());
  const afterRaw = fullDocument(sectionAfterRaw());
  const editor = await createEditor(afterRaw);
  const beforeDocument = normalizeDocument(editor, beforeRaw);
  const afterDocument = editor.getJSON();
  const beforeFingerprint = getDocumentSemanticFingerprint(beforeDocument);
  const operation = createDocumentRootOperation({
    actor: delegated ? `actor-v1-${"b".repeat(32)}` : actor,
    baseRevision: beforeFingerprint,
    idempotencyKey: "original-root-operation",
    payload: {
      documentOutputFingerprint: getDocumentOutputFingerprint(afterDocument),
      kind: "ai-report-document",
      proposalFingerprint: getDocumentSemanticFingerprint({ proposal: "document" }),
      scopeFingerprint: getDocumentSemanticFingerprint({ scope: "document" }),
      workingCopyFingerprint: getDocumentSemanticFingerprint({ workingCopy: "document" })
    },
    source: DOCUMENT_OPERATION_SOURCES.AI_APPROVED,
    targetFingerprint: beforeFingerprint,
    type: DOCUMENT_OPERATION_TYPES.REPLACE_SELECTION
  });
  const operationId = getDocumentOperationId(operation);
  expect(appendDocumentOperationAttempt({
    uid,
    documentId,
    operation,
    operationId,
    storage: window.localStorage,
    now: 200
  })).toBe(true);
  const attemptEvent = readDocumentOperationJournal(
    uid,
    documentId,
    window.localStorage
  )[0];
  const snapshot = captureDocumentOperationRollbackSnapshot({
    uid,
    documentId,
    operation,
    ...(delegated ? { approvalActor: actor } : {}),
    attemptEvent,
    target: operation.target,
    beforeContent: beforeDocument,
    afterContent: afterDocument,
    storage: window.localStorage,
    now: 2_000
  });
  expect(snapshot).not.toBeNull();
  expect(appendDocumentOperationResult({
    uid,
    documentId,
    operation,
    result: operationResult(operation, beforeDocument, afterDocument),
    storage: window.localStorage,
    now: 201
  })).toBe(true);
  return { afterDocument, beforeDocument, editor, operation, snapshot };
};

const createAdapter = (editor, start = 10_000, overrides = {}) => {
  let current = start;
  return createDocumentOperationRollbackAdapter({
    actor,
    documentId,
    editor,
    now: () => current++,
    storage: window.localStorage,
    uid,
    ...overrides
  });
};

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  editors.splice(0).forEach((editor) => {
    if (!editor.isDestroyed) editor.destroy();
  });
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("successful document operation rollback", () => {
  it("accepts the production user actor convention and rejects a cross-owner actor", async () => {
    const fixture = await establishOriginalSectionApply();
    expect(fixture.snapshot.originalOperation.actor).toBe(`user:${fixture.snapshot.uid}`);
    expect(() => createDocumentOperationRollbackOperation({
      actor: "user:other-owner",
      snapshot: fixture.snapshot
    })).toThrow(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.INVALID_INPUT);
    expect(createDocumentOperationRollbackAdapter({
      actor: "user:other-owner",
      documentId,
      editor: fixture.editor,
      uid
    })).toBeNull();
  });

  it("rolls back a runtime operation only through its authenticated approval actor", async () => {
    const fixture = await establishOriginalRootApply({ delegated: true });
    expect(fixture.snapshot).toMatchObject({
      approvalActor: actor,
      originalOperation: {
        actor: expect.stringMatching(/^actor-v1-[a-f0-9]{32}$/)
      }
    });
    expect(createDocumentOperationRollbackOperation({
      actor,
      snapshot: fixture.snapshot
    })).toMatchObject({ actor, source: DOCUMENT_OPERATION_SOURCES.MANUAL });
    expect(() => createDocumentOperationRollbackOperation({
      actor: "user:other-owner",
      snapshot: fixture.snapshot
    })).toThrow(DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.INVALID_INPUT);

    const adapter = createAdapter(fixture.editor);
    expect(adapter.inspect()).toMatchObject({
      entries: [{ status: DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.AVAILABLE }],
      status: DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES.VALID
    });
    expect(adapter.rollback({
      confirmed: true,
      originalOperationId: fixture.snapshot.originalOperationId
    })).toMatchObject({ ok: true, result: "applied" });
  });

  it("lists only evidence-bound reopen candidates without mutating document or journal", async () => {
    const fixture = await establishOriginalSectionApply();
    replaceBlockText(fixture.editor, "block-outside", "Outside later edit");
    const beforeDocument = fixture.editor.getJSON();
    const beforeJournal = readDocumentOperationJournal(uid, documentId, window.localStorage);
    const adapter = createAdapter(fixture.editor);
    const inspection = adapter.inspect();
    const rollbackOperation = createDocumentOperationRollbackOperation({
      actor,
      snapshot: fixture.snapshot
    });

    expect(inspection).toEqual({
      entries: [{
        createdAt: fixture.snapshot.createdAt,
        expiresAt: fixture.snapshot.expiresAt,
        originalOperationId: fixture.snapshot.originalOperationId,
        persistenceStatus: null,
        rollbackOperationId: getDocumentOperationId(rollbackOperation),
        status: DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.AVAILABLE,
        targetKind: "section",
        targetStableId: "block-summary"
      }],
      status: DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES.VALID
    });
    expect(Object.isFrozen(inspection)).toBe(true);
    expect(Object.isFrozen(inspection.entries[0])).toBe(true);
    expect(fixture.editor.getJSON()).toEqual(beforeDocument);
    expect(readDocumentOperationJournal(uid, documentId, window.localStorage))
      .toEqual(beforeJournal);

    expect(adapter.rollback({
      confirmed: true,
      originalOperationId: fixture.snapshot.originalOperationId
    })).toMatchObject({ ok: true, result: "applied" });
    expect(adapter.inspect()).toMatchObject({
      entries: [{
        originalOperationId: fixture.snapshot.originalOperationId,
        persistenceStatus: "pending",
        status: DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.ROLLED_BACK
      }],
      status: DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES.VALID
    });
  });

  it("settles the host only after rollback result evidence exists", async () => {
    const fixture = await establishOriginalSectionApply();
    const settlements = [];
    const adapter = createAdapter(fixture.editor, 10_000, {
      onDocumentOperationSettled: ({ operation, result }) => {
        settlements.push({
          currentContent: currentSection(fixture.editor, operation),
          journalKinds: readDocumentOperationJournal(
            uid,
            documentId,
            window.localStorage
          ).filter(({ operationId }) => operationId === result.operationId)
            .map(({ kind }) => kind),
          result
        });
        return true;
      }
    });
    const result = adapter.rollback({
      confirmed: true,
      originalOperationId: fixture.snapshot.originalOperationId
    });
    expect(result).toMatchObject({ journalRecorded: true, ok: true, result: "applied" });
    expect(settlements).toEqual([{
      currentContent: fixture.beforeContent,
      journalKinds: ["attempt", "applied"],
      result: expect.objectContaining({ ok: true, operationId: result.operationId })
    }]);

    expect(adapter.rollback({
      confirmed: true,
      originalOperationId: fixture.snapshot.originalOperationId
    })).toEqual(result);
    expect(settlements).toHaveLength(1);
  });

  it("fails closed when reopen inspection finds drift, expiry, or an unresolved attempt", async () => {
    const drifted = await establishOriginalSectionApply();
    replaceBlockText(drifted.editor, "block-summary-new", "Human target edit");
    expect(createAdapter(drifted.editor).inspect()).toMatchObject({
      entries: [{ status: DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.TARGET_STALE }],
      status: DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES.VALID
    });

    window.localStorage.clear();
    const expired = await establishOriginalSectionApply({ snapshotNow: 1_000 });
    expect(createAdapter(expired.editor, expired.snapshot.expiresAt).inspect()).toMatchObject({
      entries: [{ status: DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.EXPIRED }],
      status: DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES.VALID
    });

    window.localStorage.clear();
    const unresolved = await establishOriginalSectionApply();
    const rollbackOperation = createDocumentOperationRollbackOperation({
      actor,
      snapshot: unresolved.snapshot
    });
    const rollbackOperationId = getDocumentOperationId(rollbackOperation);
    expect(appendDocumentOperationAttempt({
      uid,
      documentId,
      operation: rollbackOperation,
      operationId: rollbackOperationId,
      storage: window.localStorage,
      now: 5_000
    })).toBe(true);
    const beforeDocument = unresolved.editor.getJSON();
    const adapter = createAdapter(unresolved.editor);
    expect(adapter.inspect()).toMatchObject({
      entries: [{
        rollbackOperationId,
        status: DOCUMENT_OPERATION_ROLLBACK_CANDIDATE_STATUSES.RECOVERY_REQUIRED
      }],
      status: DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES.VALID
    });
    expect(adapter.rollback({
      confirmed: true,
      originalOperationId: unresolved.snapshot.originalOperationId
    })).toMatchObject({
      error: DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.RECOVERY_REQUIRED,
      ok: false,
      operationId: rollbackOperationId
    });
    expect(unresolved.editor.getJSON()).toEqual(beforeDocument);
  });

  it("reports corrupt reopen evidence without exposing snapshot content", async () => {
    const fixture = await establishOriginalSectionApply();
    window.localStorage.setItem(
      createDocumentOperationRollbackSnapshotKey(uid, documentId),
      "corrupt"
    );
    expect(createAdapter(fixture.editor).inspect()).toEqual({
      entries: [],
      status: DOCUMENT_OPERATION_ROLLBACK_INSPECTION_STATUSES.CORRUPT
    });
  });

  it("rolls back one section, preserves later outside edits, and replays from journal evidence", async () => {
    const fixture = await establishOriginalSectionApply();
    replaceBlockText(fixture.editor, "block-outside", "Outside later edit");
    const beforeRollback = fixture.editor.getJSON();
    const undoBefore = undoDepth(fixture.editor.state);
    const metadata = [];
    let changedTransactions = 0;
    fixture.editor.on("transaction", ({ transaction }) => {
      if (!transaction.docChanged) return;
      changedTransactions += 1;
      const operationMetadata = transaction.getMeta(DOCUMENT_OPERATION_TRANSACTION_META_KEY);
      if (operationMetadata) metadata.push(operationMetadata);
    });

    const adapter = createAdapter(fixture.editor);
    const result = adapter.rollback({
      confirmed: true,
      originalOperationId: fixture.snapshot.originalOperationId
    });
    expect(result).toMatchObject({
      changedStableIds: ["block-summary"],
      error: null,
      journalRecorded: true,
      ok: true,
      operationType: DOCUMENT_OPERATION_TYPES.ROLLBACK,
      result: "applied",
      source: DOCUMENT_OPERATION_SOURCES.MANUAL
    });
    expect(currentSection(fixture.editor, createDocumentOperationRollbackOperation({
      actor,
      snapshot: fixture.snapshot
    }))).toEqual(fixture.beforeContent);
    expect(findBlock(fixture.editor, "block-outside").node.textContent).toBe("Outside later edit");
    expect(changedTransactions).toBe(1);
    expect(undoDepth(fixture.editor.state)).toBe(undoBefore + 1);
    expect(metadata).toEqual([
      expect.objectContaining({
        operationId: result.operationId,
        operationType: DOCUMENT_OPERATION_TYPES.ROLLBACK,
        source: DOCUMENT_OPERATION_SOURCES.MANUAL,
        targetStableId: "block-summary"
      })
    ]);

    expect(fixture.editor.commands.undo()).toBe(true);
    expect(fixture.editor.getJSON()).toEqual(beforeRollback);
    expect(fixture.editor.commands.redo()).toBe(true);
    expect(currentSection(fixture.editor, createDocumentOperationRollbackOperation({
      actor,
      snapshot: fixture.snapshot
    }))).toEqual(fixture.beforeContent);
    const beforeReplayTransactions = changedTransactions;
    const reopenedAdapter = createAdapter(fixture.editor, 20_000);
    expect(reopenedAdapter.rollback({
      confirmed: true,
      originalOperationId: fixture.snapshot.originalOperationId
    })).toEqual(result);
    expect(changedTransactions).toBe(beforeReplayTransactions);

    const journal = readDocumentOperationJournal(uid, documentId, window.localStorage);
    expect(journal.filter(({ kind }) => kind === "attempt")).toHaveLength(2);
    expect(journal.filter(({ kind }) => kind === "applied")).toHaveLength(2);
    expect(journal.filter(({ kind }) => kind === "rejected" || kind === "compensation"))
      .toHaveLength(0);
  });

  it("rolls back a document root exactly and rejects any later root drift", async () => {
    const fixture = await establishOriginalRootApply();
    const operation = createDocumentOperationRollbackOperation({
      actor,
      snapshot: fixture.snapshot
    });
    expect(operation).toMatchObject({
      baseRevision: getDocumentSemanticFingerprint(fixture.afterDocument),
      requestedScope: [DOCUMENT_ROOT_STABLE_ID],
      source: DOCUMENT_OPERATION_SOURCES.MANUAL,
      target: { stableId: DOCUMENT_ROOT_STABLE_ID },
      targetFingerprint: getDocumentSemanticFingerprint(fixture.afterDocument),
      type: DOCUMENT_OPERATION_TYPES.ROLLBACK
    });
    const result = createAdapter(fixture.editor).rollback({
      confirmed: true,
      originalOperationId: fixture.snapshot.originalOperationId
    });
    expect(result).toMatchObject({ journalRecorded: true, ok: true, result: "applied" });
    expect(fixture.editor.getJSON()).toEqual(fixture.beforeDocument);

    window.localStorage.clear();
    const drifted = await establishOriginalRootApply();
    replaceBlockText(drifted.editor, "block-outside", "Root drift");
    const beforeCall = drifted.editor.getJSON();
    expect(createAdapter(drifted.editor).rollback({
      confirmed: true,
      originalOperationId: drifted.snapshot.originalOperationId
    })).toMatchObject({
      error: DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.TARGET_STALE,
      ok: false
    });
    expect(drifted.editor.getJSON()).toEqual(beforeCall);
    expect(readDocumentOperationJournal(uid, documentId, window.localStorage)
      .filter(({ type }) => type === DOCUMENT_OPERATION_TYPES.ROLLBACK)).toHaveLength(0);
  });

  it("fails closed on target drift and on missing original applied evidence", async () => {
    const drifted = await establishOriginalSectionApply();
    replaceBlockText(drifted.editor, "block-summary-new", "Human target edit");
    const driftedDocument = drifted.editor.getJSON();
    expect(createAdapter(drifted.editor).rollback({
      confirmed: true,
      originalOperationId: drifted.snapshot.originalOperationId
    })).toMatchObject({
      error: DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.TARGET_STALE,
      ok: false
    });
    expect(drifted.editor.getJSON()).toEqual(driftedDocument);

    window.localStorage.clear();
    const unresolved = await establishOriginalSectionApply({ appendApplied: false });
    const unresolvedDocument = unresolved.editor.getJSON();
    expect(createAdapter(unresolved.editor).rollback({
      confirmed: true,
      originalOperationId: unresolved.snapshot.originalOperationId
    })).toEqual({
      error: DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.ORIGINAL_OPERATION_NOT_APPLIED,
      ok: false,
      result: "rejected"
    });
    expect(unresolved.editor.getJSON()).toEqual(unresolvedDocument);
  });

  it("distinguishes attempt-only recovery from an unproven already-rolled-back state", async () => {
    const fixture = await establishOriginalSectionApply();
    const rollbackOperation = createDocumentOperationRollbackOperation({
      actor,
      snapshot: fixture.snapshot
    });
    expect(appendDocumentOperationAttempt({
      uid,
      documentId,
      operation: rollbackOperation,
      operationId: getDocumentOperationId(rollbackOperation),
      storage: window.localStorage,
      now: 5_000
    })).toBe(true);
    fixture.editor.commands.setContent(fixture.beforeDocument);
    const currentDocument = fixture.editor.getJSON();
    expect(createAdapter(fixture.editor).rollback({
      confirmed: true,
      originalOperationId: fixture.snapshot.originalOperationId
    })).toMatchObject({
      error: DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.RECOVERY_REQUIRED,
      ok: false,
      operationId: getDocumentOperationId(rollbackOperation)
    });
    expect(fixture.editor.getJSON()).toEqual(currentDocument);

    window.localStorage.clear();
    const unproven = await establishOriginalSectionApply();
    unproven.editor.commands.setContent(unproven.beforeDocument);
    expect(createAdapter(unproven.editor).rollback({
      confirmed: true,
      originalOperationId: unproven.snapshot.originalOperationId
    })).toMatchObject({
      error: DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.STATE_DIVERGED,
      ok: false
    });
  });

  it("compensates a wrong rollback output and journals one immutable rejection", async () => {
    const fixture = await establishOriginalSectionApply();
    fixture.editor.commands.setTextSelection(1);
    const beforeDocument = fixture.editor.getJSON();
    const beforeSelection = fixture.editor.state.selection.toJSON();
    const beforeUndo = undoDepth(fixture.editor.state);
    const beforeRedo = redoDepth(fixture.editor.state);
    const dispatch = fixture.editor.view.dispatch.bind(fixture.editor.view);
    let maliciousDispatches = 0;
    vi.spyOn(fixture.editor.view, "dispatch").mockImplementation((transaction) => {
      const metadata = transaction.getMeta(DOCUMENT_OPERATION_TRANSACTION_META_KEY);
      if (metadata?.operationType === DOCUMENT_OPERATION_TYPES.ROLLBACK) {
        maliciousDispatches += 1;
        let targetPosition = null;
        transaction.doc.descendants((node, position) => {
          if (targetPosition === null && node.attrs?.blockId === "block-summary") {
            targetPosition = position;
          }
          return targetPosition === null;
        });
        transaction.insertText("tampered", targetPosition + 2);
      }
      dispatch(transaction);
    });

    const adapter = createAdapter(fixture.editor);
    const result = adapter.rollback({
      confirmed: true,
      originalOperationId: fixture.snapshot.originalOperationId
    });
    expect(result).toMatchObject({
      compensation: {
        reason: DOCUMENT_OPERATION_ERROR_CODES.POSTCONDITION_FAILED,
        restorationVerified: true
      },
      error: DOCUMENT_OPERATION_ERROR_CODES.POSTCONDITION_FAILED,
      journalRecorded: true,
      ok: false,
      result: "rejected"
    });
    expect(fixture.editor.getJSON()).toEqual(beforeDocument);
    expect(fixture.editor.state.selection.toJSON()).toEqual(beforeSelection);
    expect(undoDepth(fixture.editor.state)).toBe(beforeUndo);
    expect(redoDepth(fixture.editor.state)).toBe(beforeRedo);

    const replay = createAdapter(fixture.editor, 30_000).rollback({
      confirmed: true,
      originalOperationId: fixture.snapshot.originalOperationId
    });
    expect(replay).toEqual(result);
    expect(maliciousDispatches).toBe(1);
    const journal = readDocumentOperationJournal(uid, documentId, window.localStorage);
    expect(journal.filter(({ kind }) => kind === "rejected")).toHaveLength(1);
    expect(journal.filter(({ kind }) => kind === "compensation")).toHaveLength(1);
  });

  it("never mutates with corrupt or unavailable evidence and requires explicit confirmation", async () => {
    const corruptSnapshot = await establishOriginalSectionApply();
    const snapshotKey = createDocumentOperationRollbackSnapshotKey(uid, documentId);
    window.localStorage.setItem(snapshotKey, "corrupt");
    const snapshotDocument = corruptSnapshot.editor.getJSON();
    expect(createAdapter(corruptSnapshot.editor).rollback({
      confirmed: true,
      originalOperationId: corruptSnapshot.snapshot.originalOperationId
    })).toMatchObject({
      error: DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.SNAPSHOT_EVIDENCE_UNAVAILABLE,
      ok: false
    });
    expect(corruptSnapshot.editor.getJSON()).toEqual(snapshotDocument);

    window.localStorage.clear();
    const corruptJournal = await establishOriginalSectionApply();
    window.localStorage.setItem(createDocumentOperationJournalKey(uid, documentId), "corrupt");
    expect(createAdapter(corruptJournal.editor).rollback({
      confirmed: true,
      originalOperationId: corruptJournal.snapshot.originalOperationId
    })).toMatchObject({
      error: DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.JOURNAL_EVIDENCE_UNAVAILABLE,
      ok: false
    });
    expect(createAdapter(corruptJournal.editor).rollback({
      confirmed: false,
      originalOperationId: corruptJournal.snapshot.originalOperationId
    })).toEqual({
      error: DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.INVALID_INPUT,
      ok: false,
      result: "rejected"
    });
  });

  it("rejects expired evidence before appending a rollback attempt", async () => {
    const fixture = await establishOriginalSectionApply({ snapshotNow: 1_000 });
    const adapter = createAdapter(fixture.editor, fixture.snapshot.expiresAt);
    expect(adapter.rollback({
      confirmed: true,
      originalOperationId: fixture.snapshot.originalOperationId
    })).toMatchObject({
      error: DOCUMENT_OPERATION_ROLLBACK_ERROR_CODES.SNAPSHOT_EXPIRED,
      ok: false
    });
    expect(readDocumentOperationJournal(uid, documentId, window.localStorage)
      .filter(({ type }) => type === DOCUMENT_OPERATION_TYPES.ROLLBACK)).toHaveLength(0);
  });
});
