import { describe, expect, it, vi } from "vitest";
import {
  DOCUMENT_OPERATION_ERROR_CODES,
  DOCUMENT_OPERATION_SOURCES,
  DOCUMENT_OPERATION_TRANSACTION_META_KEY,
  DOCUMENT_OPERATION_TYPES,
  attachDocumentOperationTransactionMetadata,
  createDocumentOperationNonce,
  createDocumentOperationExecutor,
  createDocumentRootOperation,
  getDocumentOperationId,
  getDocumentOutputFingerprint,
  getDocumentSemanticFingerprint,
  validateDocumentOperation
} from "../../app/LIB/utils/documentOperationUtils";

const document = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "before" }] }]
};
const fingerprint = getDocumentSemanticFingerprint(document);

const createOperation = (overrides = {}) =>
  createDocumentRootOperation({
    actor: "user-1",
    baseRevision: "revision-1",
    idempotencyKey: "request-1",
    payload: { mark: "bold" },
    source: DOCUMENT_OPERATION_SOURCES.MANUAL,
    targetFingerprint: fingerprint,
    type: DOCUMENT_OPERATION_TYPES.FORMAT_TOGGLE,
    ...overrides
  });

describe("DocumentOperation v1 executor", () => {
  it("validates ai-report-document payloads and compensates mismatched whole-document output", () => {
    const expected = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "expected" }] }] };
    let currentDocument = document;
    const operation = createDocumentRootOperation({
      actor: "user-1", baseRevision: fingerprint, idempotencyKey: "document-report-1",
      source: DOCUMENT_OPERATION_SOURCES.AI_DIRECT, targetFingerprint: fingerprint,
      type: DOCUMENT_OPERATION_TYPES.REPLACE_SELECTION,
      payload: { kind: "ai-report-document", proposalFingerprint: "fp-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", scopeFingerprint: "fp-v1-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", workingCopyFingerprint: "fp-v1-cccccccccccccccccccccccccccccccc", documentOutputFingerprint: getDocumentOutputFingerprint(expected) }
    });
    expect(() => validateDocumentOperation(operation)).not.toThrow();
    const executor = createDocumentOperationExecutor({ getDocument: () => currentDocument, getRevision: getDocumentSemanticFingerprint, captureDocument: (value) => JSON.parse(JSON.stringify(value)), restoreDocument: (snapshot) => { currentDocument = snapshot; return true; } });
    const result = executor.execute(operation, () => { currentDocument = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "wrong" }] }] }; return true; });
    expect(result).toMatchObject({ ok: false, error: DOCUMENT_OPERATION_ERROR_CODES.POSTCONDITION_FAILED, compensation: { restorationVerified: true } });
    expect(currentDocument).toEqual(document);
  });

  it.each([
    ["manual source", (operation) => ({ ...operation, source: DOCUMENT_OPERATION_SOURCES.MANUAL })],
    ["non-root request", (operation) => ({ ...operation, requestedScope: ["block-body"] })],
    ["expanded request", (operation) => ({ ...operation, requestedScope: ["document-root", "block-body"] })],
    ["protected scope", (operation) => ({ ...operation, protectedScope: ["block-body"] })],
    ["expanded root target", (operation) => ({ ...operation, target: { ...operation.target, fromOffset: 0 } })]
  ])("rejects forged ai-report-document authority: %s", (_name, forge) => {
    const operation = createDocumentRootOperation({
      actor: "user-1",
      baseRevision: fingerprint,
      idempotencyKey: "document-report-schema",
      payload: {
        documentOutputFingerprint: "fp-v1-dddddddddddddddddddddddddddddddd",
        kind: "ai-report-document",
        proposalFingerprint: "fp-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        scopeFingerprint: "fp-v1-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        workingCopyFingerprint: "fp-v1-cccccccccccccccccccccccccccccccc"
      },
      source: DOCUMENT_OPERATION_SOURCES.AI_DIRECT,
      targetFingerprint: fingerprint,
      type: DOCUMENT_OPERATION_TYPES.REPLACE_SELECTION
    });
    expect(() => validateDocumentOperation(forge(operation))).toThrowError(
      expect.objectContaining({ code: DOCUMENT_OPERATION_ERROR_CODES.SCHEMA_VALIDATION_FAILED })
    );
  });

  it("normalizes only runtime output identity and default attrs", () => {
    const expected = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] };
    const editorJson = { type: "doc", content: [{ type: "paragraph", attrs: { blockId: "random", textAlign: "left", indent: 0, indentLevel: 0 }, content: [{ type: "text", text: "x" }] }] };
    expect(getDocumentOutputFingerprint(editorJson)).toBe(getDocumentOutputFingerprint(expected));
    expect(getDocumentOutputFingerprint({ ...editorJson, content: [{ ...editorJson.content[0], attrs: { ...editorJson.content[0].attrs, textAlign: "center" } }] })).not.toBe(getDocumentOutputFingerprint(expected));
    expect(getDocumentOutputFingerprint({ ...editorJson, content: [{ ...editorJson.content[0], attrs: { ...editorJson.content[0].attrs, futureAttr: null } }] })).not.toBe(getDocumentOutputFingerprint(expected));
    expect(getDocumentOutputFingerprint({ ...editorJson, content: [{ ...editorJson.content[0], content: [{ type: "text", text: "changed" }] }] })).not.toBe(getDocumentOutputFingerprint(expected));
  });

  it("restores a wrong approved outline document after a revision advance", () => {
    let currentDocument = document;
    let currentRevision = "revision-1";
    const operation = createDocumentRootOperation({ actor: "user-1", baseRevision: "revision-1", idempotencyKey: "outline-1", source: DOCUMENT_OPERATION_SOURCES.AI_APPROVED, targetFingerprint: fingerprint, type: DOCUMENT_OPERATION_TYPES.REPLACE_SELECTION,
      payload: { kind: "ai-report-outline", proposalFingerprint: "fp-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", documentFingerprint: getDocumentOutputFingerprint({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "expected" }] }] }) } });
    expect(() => validateDocumentOperation(operation)).not.toThrow();
    const executor = createDocumentOperationExecutor({ getDocument: () => currentDocument, getRevision: () => currentRevision, captureDocument: (value) => ({ document: JSON.parse(JSON.stringify(value)), revision: currentRevision }), restoreDocument: (snapshot) => { currentDocument = snapshot.document; currentRevision = snapshot.revision; return true; } });
    const result = executor.execute(operation, () => { currentDocument = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "wrong" }] }] }; currentRevision = "revision-2"; return true; });
    expect(result).toMatchObject({ ok: false, error: DOCUMENT_OPERATION_ERROR_CODES.POSTCONDITION_FAILED, compensation: { restorationVerified: true } });
    expect(currentDocument).toEqual(document);
    expect(currentRevision).toBe("revision-1");

  });

  it("does not claim restoration when the document is restored but the revision is not", () => {
    const expected = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "expected" }] }] };
    let currentDocument = document;
    let currentRevision = "revision-1";
    const operation = createDocumentRootOperation({
      actor: "user-1",
      baseRevision: "revision-1",
      idempotencyKey: "outline-partial-restore",
      source: DOCUMENT_OPERATION_SOURCES.AI_APPROVED,
      targetFingerprint: fingerprint,
      type: DOCUMENT_OPERATION_TYPES.REPLACE_SELECTION,
      payload: {
        kind: "ai-report-outline",
        proposalFingerprint: "fp-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        documentFingerprint: getDocumentOutputFingerprint(expected)
      }
    });
    const executor = createDocumentOperationExecutor({
      getDocument: () => currentDocument,
      getRevision: () => currentRevision,
      captureDocument: (value) => ({ document: JSON.parse(JSON.stringify(value)), revision: currentRevision }),
      restoreDocument: (snapshot) => {
        currentDocument = snapshot.document;
        return true;
      }
    });
    const result = executor.execute(operation, () => {
      currentDocument = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "wrong" }] }] };
      currentRevision = "revision-2";
      return true;
    });
    expect(result).toMatchObject({
      ok: false,
      error: DOCUMENT_OPERATION_ERROR_CODES.RESTORATION_FAILED,
      compensation: null
    });
    expect(currentDocument).toEqual(document);
    expect(currentRevision).toBe("revision-2");
  });

  it("rejects and restores an exact approved output when its revision did not advance", () => {
    const expected = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "expected" }] }] };
    let currentDocument = document;
    let currentRevision = "revision-1";
    const operation = createDocumentRootOperation({
      actor: "user-1",
      baseRevision: "revision-1",
      idempotencyKey: "outline-no-revision",
      source: DOCUMENT_OPERATION_SOURCES.AI_APPROVED,
      targetFingerprint: fingerprint,
      type: DOCUMENT_OPERATION_TYPES.REPLACE_SELECTION,
      payload: {
        kind: "ai-report-outline",
        proposalFingerprint: "fp-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        documentFingerprint: getDocumentOutputFingerprint(expected)
      }
    });
    const executor = createDocumentOperationExecutor({
      getDocument: () => currentDocument,
      getRevision: () => currentRevision,
      captureDocument: (value) => ({ document: JSON.parse(JSON.stringify(value)), revision: currentRevision }),
      restoreDocument: (snapshot) => {
        currentDocument = snapshot.document;
        currentRevision = snapshot.revision;
        return true;
      }
    });
    const result = executor.execute(operation, () => {
      currentDocument = expected;
      return true;
    });
    expect(result).toMatchObject({
      ok: false,
      error: DOCUMENT_OPERATION_ERROR_CODES.POSTCONDITION_FAILED,
      compensation: { restorationVerified: true }
    });
    expect(currentDocument).toEqual(document);
    expect(currentRevision).toBe("revision-1");

    [undefined, null, "", "   ", 2, { revision: "revision-2" }].forEach(
      (invalidRevision) => {
        let invalidDocument = document;
        let invalidCurrentRevision = "revision-1";
        const invalidExecutor = createDocumentOperationExecutor({
          getDocument: () => invalidDocument,
          getRevision: () => invalidCurrentRevision,
          captureDocument: (value) => ({
            document: JSON.parse(JSON.stringify(value)),
            revision: invalidCurrentRevision
          }),
          restoreDocument: (snapshot) => {
            invalidDocument = snapshot.document;
            invalidCurrentRevision = snapshot.revision;
            return true;
          }
        });
        const invalidResult = invalidExecutor.execute(operation, () => {
          invalidDocument = expected;
          invalidCurrentRevision = invalidRevision;
          return true;
        });
        expect(invalidResult).toMatchObject({
          ok: false,
          error: DOCUMENT_OPERATION_ERROR_CODES.POSTCONDITION_FAILED,
          compensation: { restorationVerified: true }
        });
        expect(invalidDocument).toEqual(document);
        expect(invalidCurrentRevision).toBe("revision-1");
      }
    );
  });

  it("rejects an identity-only outline rewrite as a semantic no-op", () => {
    const before = { type: "doc", content: [{ type: "paragraph", attrs: { blockId: "before-id" }, content: [{ type: "text", text: "same" }] }] };
    const after = { type: "doc", content: [{ type: "paragraph", attrs: { blockId: "after-id" }, content: [{ type: "text", text: "same" }] }] };
    let currentDocument = before;
    const operation = createDocumentRootOperation({
      actor: "user-1",
      baseRevision: "revision-1",
      idempotencyKey: "outline-no-op",
      source: DOCUMENT_OPERATION_SOURCES.AI_APPROVED,
      targetFingerprint: getDocumentSemanticFingerprint(before),
      type: DOCUMENT_OPERATION_TYPES.REPLACE_SELECTION,
      payload: {
        kind: "ai-report-outline",
        proposalFingerprint: "fp-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        documentFingerprint: getDocumentOutputFingerprint(after)
      }
    });
    const executor = createDocumentOperationExecutor({
      getDocument: () => currentDocument,
      getRevision: () => "revision-1",
      captureDocument: (value) => JSON.parse(JSON.stringify(value)),
      restoreDocument: (snapshot) => { currentDocument = snapshot; return true; }
    });
    const result = executor.execute(operation, () => { currentDocument = after; return true; });
    expect(result).toMatchObject({
      ok: false,
      error: DOCUMENT_OPERATION_ERROR_CODES.POSTCONDITION_FAILED,
      compensation: { restorationVerified: true }
    });
    expect(currentDocument).toEqual(before);
  });
  it("creates nonce identities without Math.random and falls back after crypto failures", () => {
    expect(
      createDocumentOperationNonce({
        crypto: { randomUUID: () => "uuid-value" }
      })
    ).toBe("uuid-value");
    expect(
      createDocumentOperationNonce({
        crypto: {
          getRandomValues: (values) => {
            values.set([1, 2, 3, 4]);
            return values;
          }
        }
      })
    ).toBe("00000001000000020000000300000004");

    const firstFallback = createDocumentOperationNonce({
      crypto: { getRandomValues: () => { throw new Error("blocked"); } },
      now: () => 1,
      performance: { timeOrigin: 10, now: () => 0.25 },
      processId: 1
    });
    const secondFallback = createDocumentOperationNonce({
      crypto: null,
      now: () => 1,
      performance: { timeOrigin: 11, now: () => 0.25 },
      processId: 1
    });
    expect(firstFallback).not.toBe(secondFallback);
    expect(firstFallback).toMatch(/^fallback-1-/);
    expect(firstFallback.split("-")).toHaveLength(6);
  });

  it("derives deterministic IDs from the complete canonical operation input", () => {
    const first = createOperation();
    const reordered = Object.fromEntries(Object.entries(first).reverse());

    expect(getDocumentOperationId(first)).toBe(getDocumentOperationId(reordered));
    expect(getDocumentOperationId(first)).toMatch(/^dop-v1-[a-f0-9]{32}$/);
    expect(getDocumentOperationId(first)).not.toBe(
      getDocumentOperationId(createOperation({ idempotencyKey: "request-2" }))
    );
    expect(getDocumentOperationId(first)).not.toBe(
      getDocumentOperationId(createOperation({ targetFingerprint: "fp-v1-other" }))
    );
    expect(getDocumentOperationId(first)).not.toBe(
      getDocumentOperationId(createOperation({ protectedScope: ["document-root"] }))
    );
  });

  it("applies once, records immutable pending history, and replays a duplicate result", () => {
    let currentDocument = document;
    const apply = vi.fn(() => {
      currentDocument = {
        ...document,
        content: [{ type: "paragraph", content: [{ type: "text", text: "after" }] }]
      };
      return true;
    });
    const executor = createDocumentOperationExecutor({
      getDocument: () => currentDocument,
      getRevision: () => "revision-1"
    });
    const operation = createOperation();

    const first = executor.execute(operation, apply);
    const retry = executor.execute(operation, apply);

    expect(first).toBe(retry);
    expect(first).toMatchObject({
      ok: true,
      operationType: DOCUMENT_OPERATION_TYPES.FORMAT_TOGGLE,
      persistenceStatus: "pending",
      changedStableIds: ["document-root"]
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.changedStableIds)).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(executor.getHistory()).toEqual([first]);
  });

  it.each([
    [
      "missing operation",
      null,
      DOCUMENT_OPERATION_ERROR_CODES.SCHEMA_VALIDATION_FAILED
    ],
    [
      "invalid schema",
      { ...createOperation(), schemaVersion: 2 },
      DOCUMENT_OPERATION_ERROR_CODES.SCHEMA_VALIDATION_FAILED
    ],
    [
      "schema-outside payload",
      createOperation({ payload: { mark: "bold", rawHtml: "<p>unsafe</p>" } }),
      DOCUMENT_OPERATION_ERROR_CODES.SCHEMA_VALIDATION_FAILED
    ],
    [
      "stale revision",
      createOperation({ baseRevision: "old" }),
      DOCUMENT_OPERATION_ERROR_CODES.REVISION_CONFLICT
    ],
    [
      "stale target",
      createOperation({ targetFingerprint: "fp-v1-old" }),
      DOCUMENT_OPERATION_ERROR_CODES.TARGET_MISMATCH
    ],
    [
      "protected scope",
      createOperation({ protectedScope: ["document-root"] }),
      DOCUMENT_OPERATION_ERROR_CODES.PROTECTED_RANGE_VIOLATION
    ],
    [
      "out of scope",
      { ...createOperation(), requestedScope: [] },
      DOCUMENT_OPERATION_ERROR_CODES.PRECONDITION_FAILED
    ]
  ])("rejects %s before the mutation callback", (_label, operation, error) => {
    const apply = vi.fn();
    const executor = createDocumentOperationExecutor({
      getDocument: () => document,
      getRevision: () => "revision-1"
    });

    expect(executor.execute(operation, apply)).toMatchObject({
      ok: false,
      error,
      result: "rejected",
      afterFingerprint: fingerprint
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it("records manual and approved-AI mutations in one ordered history boundary", () => {
    let currentDocument = document;
    const executor = createDocumentOperationExecutor({
      getDocument: () => currentDocument,
      getRevision: (value) => getDocumentSemanticFingerprint(value)
    });
    const initialFingerprint = getDocumentSemanticFingerprint(currentDocument);
    const manual = createDocumentRootOperation({
      actor: "user-1",
      baseRevision: initialFingerprint,
      idempotencyKey: "manual-bold-1",
      payload: { mark: "bold" },
      source: DOCUMENT_OPERATION_SOURCES.MANUAL,
      targetFingerprint: initialFingerprint,
      type: DOCUMENT_OPERATION_TYPES.FORMAT_TOGGLE
    });

    expect(
      executor.execute(manual, () => {
        currentDocument = {
          ...document,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", marks: [{ type: "bold" }], text: "before" }]
            }
          ]
        };
        return true;
      }).ok
    ).toBe(true);

    const afterManualFingerprint = getDocumentSemanticFingerprint(currentDocument);
    const ai = createDocumentRootOperation({
      actor: "user-1",
      baseRevision: afterManualFingerprint,
      idempotencyKey: "ai-proposal-1",
      payload: { kind: "rewrite" },
      source: DOCUMENT_OPERATION_SOURCES.AI_APPROVED,
      targetFingerprint: afterManualFingerprint,
      type: DOCUMENT_OPERATION_TYPES.REPLACE_SELECTION
    });

    expect(
      executor.execute(ai, () => {
        currentDocument = {
          ...document,
          content: [{ type: "paragraph", content: [{ type: "text", text: "rewritten" }] }]
        };
        return true;
      }).ok
    ).toBe(true);

    expect(executor.getHistory().map(({ source, operationType }) => ({
      operationType,
      source
    }))).toEqual([
      {
        operationType: DOCUMENT_OPERATION_TYPES.FORMAT_TOGGLE,
        source: DOCUMENT_OPERATION_SOURCES.MANUAL
      },
      {
        operationType: DOCUMENT_OPERATION_TYPES.REPLACE_SELECTION,
        source: DOCUMENT_OPERATION_SOURCES.AI_APPROVED
      }
    ]);
  });

  it.each([
    ["insertNote", null],
    ["convertNoteKind", null],
    ["updateNoteBody", "footnote"],
    ["deleteNote", "endnote"]
  ])("rejects mismatched note payload action %s and kind %s", (action, kind) => {
    const apply = vi.fn();
    const executor = createDocumentOperationExecutor({
      getDocument: () => document,
      getRevision: () => "revision-1"
    });
    const operation = createOperation({
      payload: { action, kind },
      type: DOCUMENT_OPERATION_TYPES.NOTE_MUTATION
    });

    expect(executor.execute(operation, apply)).toMatchObject({
      ok: false,
      error: DOCUMENT_OPERATION_ERROR_CODES.SCHEMA_VALIDATION_FAILED,
      result: "rejected"
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it("attaches the same operation identity to the editor transaction without payload text", () => {
    const setMeta = vi.fn();
    const nextChain = { run: vi.fn() };
    const chain = {
      command: vi.fn((callback) => {
        expect(callback({ tr: { setMeta } })).toBe(true);
        return nextChain;
      })
    };
    const operation = createOperation();
    const operationId = getDocumentOperationId(operation);

    expect(
      attachDocumentOperationTransactionMetadata(chain, { operation, operationId })
    ).toBe(nextChain);
    expect(setMeta).toHaveBeenCalledWith(
      DOCUMENT_OPERATION_TRANSACTION_META_KEY,
      expect.objectContaining({
        operationId,
        operationType: DOCUMENT_OPERATION_TYPES.FORMAT_TOGGLE,
        source: DOCUMENT_OPERATION_SOURCES.MANUAL,
        type: "document-operation"
      })
    );
    expect(JSON.stringify(setMeta.mock.calls)).not.toContain("rawHtml");
  });
});
