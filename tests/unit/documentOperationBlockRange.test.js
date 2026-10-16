/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { Editor, Node } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import { redoDepth, undoDepth } from "@tiptap/pm/history";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import { CustomParagraph } from "../../app/LIB/extensions/ParagraphFontSync";
import HeadingWithId from "../../app/LIB/extensions/HeadingWithId";
import BlockIdentity from "../../app/LIB/extensions/BlockIdentity";
import {
  createDocumentBlockRangeOperation,
  createDocumentOperationExecutor,
  attachDocumentOperationTransactionMetadata,
  captureEditorDocumentOperationSnapshot,
  getDocumentOperationId,
  getDocumentSemanticFingerprint,
  restoreEditorDocumentOperationSnapshot
} from "../../app/LIB/utils/documentOperationUtils";
import {
  createSemanticSelectionAnchor,
  resolveSemanticSelectionAnchor
} from "../../app/LIB/utils/semanticSelectionUtils";
import {
  createDockitDocumentSnapshot,
  normalizeDockitDocumentForImport
} from "../../app/LIB/utils/dktDocumentUtils";

const StructuredBlock = Node.create({
  name: "structuredBlock",
  group: "block",
  atom: true,
  addAttributes: () => ({ value: { default: "original" } }),
  parseHTML: () => [{ tag: "figure[data-structured-block]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "figure",
    { ...HTMLAttributes, "data-structured-block": "true" }
  ]
});

const createEditor = (content) => new Editor({
  extensions: [
    Document,
    CustomParagraph,
    HeadingWithId,
    Text,
    Bold,
    StructuredBlock,
    UndoRedo,
    BlockIdentity
  ],
  content
});

const blockIds = (editor) => {
  const ids = [];
  editor.state.doc.descendants((node) => {
    if (["paragraph", "heading"].includes(node.type.name)) ids.push(node.attrs.blockId);
  });
  return ids;
};

describe("DocumentOperation C2 block ranges", () => {
  const settleEditor = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("assigns unique paragraph and heading IDs, serializes them, and repairs duplicates", async () => {
    const editor = createEditor(
      "<p data-dockit-block-id='same'>one</p>" +
      "<h2 data-dockit-block-id='same'>two</h2>" +
      "<p data-dockit-block-id='document-root'>three</p>"
    );
    await settleEditor();
    const ids = blockIds(editor);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids).not.toContain("document-root");
    expect(editor.getHTML()).toContain("data-dockit-block-id");
    expect(editor.getJSON().content.map((node) => node.attrs.blockId)).toEqual(ids);

    const snapshot = createDockitDocumentSnapshot({
      content: editor.getHTML(),
      title: "stable block test"
    });
    const imported = normalizeDockitDocumentForImport(snapshot);
    const reopened = createEditor(imported.content);
    expect(blockIds(reopened)).toEqual(ids);
    editor.destroy();
    reopened.destroy();
  });

  it("resolves a captured anchor after a positional shift before its block", async () => {
    const editor = createEditor("<p>before</p><p>target text</p>");
    await settleEditor();
    editor.commands.setTextSelection({ from: 9, to: 15 });
    const anchor = createSemanticSelectionAnchor(editor.state);
    expect(anchor).toMatchObject({ fromOffset: 0, toOffset: 6 });
    editor.commands.insertContentAt(1, "shift ");
    expect(resolveSemanticSelectionAnchor(editor.state.doc, anchor)).toMatchObject({
      from: 15,
      to: 21,
      blockId: anchor.stableId
    });
    editor.destroy();
  });

  it("fails closed when one stable block ID resolves to multiple blocks", () => {
    const textChild = { isText: true };
    const duplicateBlock = {
      attrs: { blockId: "block-duplicate" },
      content: { size: 6 },
      forEach: (callback) => callback(textChild),
      nodeSize: 8,
      type: { name: "paragraph" }
    };
    const duplicateDocument = {
      descendants: (callback) => {
        callback(duplicateBlock, 0);
        callback(duplicateBlock, 10);
      }
    };

    expect(resolveSemanticSelectionAnchor(duplicateDocument, {
      blockFingerprint: "fp-v1-unused",
      fromOffset: 0,
      stableId: "block-duplicate",
      toOffset: 3
    })).toBeNull();
  });

  it("rejects missing or duplicate blocks, offsets, stale fingerprints, and scope before apply", async () => {
    const editor = createEditor("<p>target text</p>");
    await settleEditor();
    editor.commands.setTextSelection({ from: 1, to: 7 });
    const anchor = createSemanticSelectionAnchor(editor.state);
    const makeOperation = (target = anchor, overrides = {}) => createDocumentBlockRangeOperation({
      actor: "user-1", baseRevision: anchor.blockFingerprint, idempotencyKey: `request-${Math.random()}`,
      payload: { kind: "rewrite" }, source: "ai-approved", target, type: "replace-selection", ...overrides
    });
    const executor = createDocumentOperationExecutor({
      getDocument: () => editor.state.doc,
      resolveBlockRange: resolveSemanticSelectionAnchor
    });
    const apply = vi.fn(() => true);
    [
      { ...anchor, stableId: "missing" },
      { ...anchor, fromOffset: 9, toOffset: 20 },
      { ...anchor, blockFingerprint: "fp-v1-stale" }
    ].forEach((target) => expect(executor.execute(makeOperation(target), apply).ok).toBe(false));
    expect(executor.execute(makeOperation(anchor, { protectedScope: [anchor.stableId] }), apply).ok).toBe(false);
    expect(executor.execute({ ...makeOperation(), requestedScope: [] }, apply).ok).toBe(false);
    expect(executor.execute({ ...makeOperation(), baseRevision: "fp-v1-other" }, apply)).toMatchObject({
      error: "RevisionConflict",
      ok: false
    });
    expect(executor.execute({ ...makeOperation(), targetFingerprint: "fp-v1-other" }, apply)).toMatchObject({
      error: "TargetMismatch",
      ok: false
    });
    expect(apply).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("includes the semantic target in operation identity and applies a duplicate only once", async () => {
    const editor = createEditor("<p>target text</p>");
    await settleEditor();
    editor.commands.setTextSelection({ from: 1, to: 7 });
    const anchor = createSemanticSelectionAnchor(editor.state);
    const operation = createDocumentBlockRangeOperation({
      actor: "user-1", baseRevision: anchor.blockFingerprint, idempotencyKey: "same",
      payload: { mark: "bold" }, source: "manual", target: anchor, type: "format-toggle"
    });
    const shifted = { ...operation, target: { ...operation.target, fromOffset: 1, toOffset: 2 } };
    expect(getDocumentOperationId(operation)).not.toBe(getDocumentOperationId(shifted));
    const apply = vi.fn(({ resolvedRange }) => {
      editor.commands.setTextSelection(resolvedRange);
      return editor.commands.toggleBold();
    });
    const executor = createDocumentOperationExecutor({
      getDocument: () => editor.state.doc,
      resolveBlockRange: resolveSemanticSelectionAnchor
    });
    expect(executor.execute(operation, apply).ok).toBe(true);
    expect(executor.execute(operation, apply).ok).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(getDocumentSemanticFingerprint(editor.state.doc)).toBeTruthy();
    editor.destroy();
  });

  it("proves every out-of-range semantic block is unchanged after a valid apply", async () => {
    const editor = createEditor("<p>target text</p><p>outside text</p>");
    await settleEditor();
    editor.commands.setTextSelection({ from: 1, to: 7 });
    const anchor = createSemanticSelectionAnchor(editor.state);
    const outsideBefore = getDocumentSemanticFingerprint(editor.state.doc.child(1));
    const operation = createDocumentBlockRangeOperation({
      actor: "user-1", baseRevision: anchor.blockFingerprint, idempotencyKey: "scope-proof",
      payload: { mark: "bold" }, source: "manual", target: anchor, type: "format-toggle"
    });
    const executor = createDocumentOperationExecutor({
      getDocument: () => editor.state.doc,
      resolveBlockRange: resolveSemanticSelectionAnchor,
      restoreDocument: (snapshot) => editor.commands.setContent(snapshot)
    });

    expect(executor.execute(operation, ({ resolvedRange }) => {
      editor.commands.setTextSelection(resolvedRange);
      return editor.commands.toggleBold();
    })).toMatchObject({ ok: true });
    expect(getDocumentSemanticFingerprint(editor.state.doc.child(1))).toBe(outsideBefore);
    editor.destroy();
  });

  it("restores the exact pre-operation document when a buggy callback mutates outside scope", async () => {
    const editor = createEditor("<p>target text</p><p>outside text</p>");
    await settleEditor();
    editor.commands.setTextSelection({ from: 1, to: 7 });
    const anchor = createSemanticSelectionAnchor(editor.state);
    const beforeFingerprint = getDocumentSemanticFingerprint(editor.state.doc);
    const operation = createDocumentBlockRangeOperation({
      actor: "user-1", baseRevision: anchor.blockFingerprint, idempotencyKey: "malicious-scope",
      payload: { mark: "bold" }, source: "manual", target: anchor, type: "format-toggle"
    });
    const restoreDocument = vi.fn((snapshot) => editor.commands.setContent(snapshot));
    const executor = createDocumentOperationExecutor({
      getDocument: () => editor.state.doc,
      resolveBlockRange: resolveSemanticSelectionAnchor,
      restoreDocument
    });

    const result = executor.execute(operation, ({ resolvedRange }) => {
      editor.commands.setTextSelection(resolvedRange);
      editor.commands.toggleBold();
      return editor.commands.insertContentAt(editor.state.doc.content.size, "<p>malicious</p>");
    });
    expect(result).toMatchObject({
      ok: false,
      error: "OutOfRangeMutation",
      compensation: { originalOperationId: result.operationId, restorationVerified: true }
    });
    expect(restoreDocument).toHaveBeenCalledTimes(1);
    expect(getDocumentSemanticFingerprint(editor.state.doc)).toBe(beforeFingerprint);
    editor.destroy();
  });

  it("rejects target prefix, suffix, and non-ID structured-node mutations", async () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "prefix target suffix" }]
        },
        { type: "structuredBlock", attrs: { value: "original" } }
      ]
    });
    await settleEditor();
    editor.commands.setTextSelection({ from: 8, to: 14 });
    const anchor = createSemanticSelectionAnchor(editor.state);
    const operation = createDocumentBlockRangeOperation({
      actor: "user-1", baseRevision: anchor.blockFingerprint, idempotencyKey: "complete-scope-proof",
      payload: { kind: "rewrite" }, source: "ai-approved", target: anchor, type: "replace-selection"
    });
    const before = editor.getJSON();
    const executor = createDocumentOperationExecutor({
      getDocument: () => editor.state.doc,
      resolveBlockRange: resolveSemanticSelectionAnchor,
      restoreDocument: (snapshot) => editor.commands.setContent(snapshot)
    });

    const prefixMutation = JSON.parse(JSON.stringify(before));
    prefixMutation.content[0].content[0].text = "PREFIX target suffix";
    expect(executor.execute(operation, () => editor.commands.setContent(prefixMutation))).toMatchObject({
      ok: false,
      error: "OutOfRangeMutation"
    });
    expect(editor.getJSON()).toEqual(before);

    const freshOperation = { ...operation, idempotencyKey: "structured-node-proof" };
    const structuredMutation = JSON.parse(JSON.stringify(before));
    structuredMutation.content[0].content[0].text = "prefix changed suffix";
    structuredMutation.content[1].attrs.value = "tampered";
    expect(executor.execute(freshOperation, () => editor.commands.setContent(structuredMutation))).toMatchObject({
      ok: false,
      error: "OutOfRangeMutation"
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it.each([
    ["returns false", () => false],
    ["throws", () => { throw new Error("apply exploded"); }]
  ])("restores a mutation when apply %s", async (_label, settleApply) => {
    const editor = createEditor("<p>target text</p><p>outside text</p>");
    await settleEditor();
    editor.commands.setTextSelection({ from: 1, to: 7 });
    const anchor = createSemanticSelectionAnchor(editor.state);
    const beforeFingerprint = getDocumentSemanticFingerprint(editor.state.doc);
    const operation = createDocumentBlockRangeOperation({
      actor: "user-1", baseRevision: anchor.blockFingerprint, idempotencyKey: `mutated-${_label}`,
      payload: { kind: "rewrite" }, source: "ai-approved", target: anchor, type: "replace-selection"
    });
    const executor = createDocumentOperationExecutor({
      getDocument: () => editor.state.doc,
      resolveBlockRange: resolveSemanticSelectionAnchor,
      restoreDocument: (snapshot) => editor.commands.setContent(snapshot)
    });

    const result = executor.execute(operation, () => {
      editor.commands.insertContentAt(editor.state.doc.content.size, "<p>invalid</p>");
      return settleApply();
    });
    expect(result).toMatchObject({
      ok: false,
      error: "PostconditionFailed",
      compensation: { restorationVerified: true }
    });
    expect(getDocumentSemanticFingerprint(editor.state.doc)).toBe(beforeFingerprint);
    editor.destroy();
  });

  it("restores the exact pre-apply undo and redo branches after compensation", async () => {
    const editor = createEditor("<p>target text</p><p>outside text</p>");
    await settleEditor();
    editor.commands.insertContentAt(editor.state.doc.content.size, "<p>existing redo branch</p>");
    const existingRedoFingerprint = getDocumentSemanticFingerprint(editor.state.doc);
    expect(editor.commands.undo()).toBe(true);
    editor.commands.setTextSelection({ from: 1, to: 7 });
    const anchor = createSemanticSelectionAnchor(editor.state);
    const beforeFingerprint = getDocumentSemanticFingerprint(editor.state.doc);
    const beforeUndoDepth = undoDepth(editor.state);
    const beforeRedoDepth = redoDepth(editor.state);
    expect(beforeRedoDepth).toBeGreaterThan(0);
    const operation = createDocumentBlockRangeOperation({
      actor: "user-1", baseRevision: anchor.blockFingerprint, idempotencyKey: "history-safe-rollback",
      payload: { mark: "bold" }, source: "manual", target: anchor, type: "format-toggle"
    });
    const executor = createDocumentOperationExecutor({
      getDocument: () => editor.state.doc,
      resolveBlockRange: resolveSemanticSelectionAnchor,
      captureDocument: (document) =>
        captureEditorDocumentOperationSnapshot(editor, document),
      restoreDocument: (snapshot) =>
        restoreEditorDocumentOperationSnapshot(editor, snapshot)
    });

    const result = executor.execute(operation, ({ operationId, resolvedRange }) => {
      let chain = editor.chain().setTextSelection(resolvedRange);
      chain = attachDocumentOperationTransactionMetadata(chain, { operation, operationId });
      return chain
        .toggleBold()
        .insertContentAt(editor.state.doc.content.size, "<p>invalid</p>")
        .run();
    });
    expect(result).toMatchObject({
      ok: false,
      error: "OutOfRangeMutation",
      compensation: { restorationVerified: true }
    });
    expect(getDocumentSemanticFingerprint(editor.state.doc)).toBe(beforeFingerprint);
    expect(undoDepth(editor.state)).toBe(beforeUndoDepth);
    expect(redoDepth(editor.state)).toBe(beforeRedoDepth);
    expect(editor.commands.redo()).toBe(true);
    expect(getDocumentSemanticFingerprint(editor.state.doc)).toBe(existingRedoFingerprint);
    editor.destroy();
  });

  it("does not claim compensation when a required restoration cannot be verified", async () => {
    const editor = createEditor("<p>target text</p><p>outside text</p>");
    await settleEditor();
    editor.commands.setTextSelection({ from: 1, to: 7 });
    const anchor = createSemanticSelectionAnchor(editor.state);
    const operation = createDocumentBlockRangeOperation({
      actor: "user-1", baseRevision: anchor.blockFingerprint, idempotencyKey: "failed-restore",
      payload: { mark: "bold" }, source: "manual", target: anchor, type: "format-toggle"
    });
    const executor = createDocumentOperationExecutor({
      getDocument: () => editor.state.doc,
      resolveBlockRange: resolveSemanticSelectionAnchor,
      restoreDocument: () => false
    });

    expect(executor.execute(operation, () =>
      editor.commands.insertContentAt(editor.state.doc.content.size, "<p>malicious</p>")
    )).toMatchObject({
      ok: false,
      error: "RestorationFailed",
      compensation: null
    });
    editor.destroy();
  });
});
