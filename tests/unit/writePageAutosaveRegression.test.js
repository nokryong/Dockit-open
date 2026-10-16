/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendAppliedDocumentOperation,
  appendDocumentOperationAttempt,
  createDocumentOperationJournalKey,
  readDocumentOperationJournal,
  transitionDocumentOperationsThrough
} from "../../app/LIB/utils/documentOperationJournal.js";
import {
  createDocumentOperationRollbackSnapshotCandidate,
  createDocumentOperationRollbackSnapshotKey,
  readDocumentOperationRollbackSnapshot
} from "../../app/LIB/utils/documentOperationRollbackSnapshot.js";
import {
  DOCUMENT_OPERATION_SOURCES,
  DOCUMENT_OPERATION_TYPES,
  createDocumentRootOperation,
  getDocumentOperationId,
  getDocumentOutputFingerprint,
  getDocumentSemanticFingerprint
} from "../../app/LIB/utils/documentOperationUtils.js";
import {
  applyDOCXImportPreviewToEditor,
  runDOCXImportDryRun,
  startDOCXImportDryRun,
  validateDOCXImportFile
} from "../../app/LIB/utils/docxImportButtonUtils";
import {
  applyHWPXImportPreviewToEditor,
  runHWPXImportDryRun,
  startHWPXImportDryRun,
  validateHWPXImportFile
} from "../../app/LIB/utils/hwpxImportButtonUtils";

vi.mock("@/app/LIB/context/SettingContext", () => ({
  useSetting: () => ({ setting: { autoSave: true, autoSaveDelay: 0 } })
}));

const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  documentContext: null,
  contentEditorProps: null,
  editorContext: null,
  notifyDocumentOperationRollbackChanged: vi.fn(),
  routerPush: vi.fn(),
  saveDocument: vi.fn(),
  setContent: vi.fn(),
  setDocxExportAction: vi.fn(),
  setDocxImportAction: vi.fn(),
  setFocus: vi.fn(),
  setHwpxExportAction: vi.fn(),
  setHwpxImportAction: vi.fn(),
  setPrintAction: vi.fn(),
  setSaveAction: vi.fn(),
  toastDanger: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  editorDraftHtml: "<p>pending editor transaction</p>",
  user: null,
  useDebounceOverride: null
}));

vi.mock("@/desktop/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush })
}));

vi.mock("sud-ui", () => ({
  Button: ({ children, ...props }) => h("button", props, children),
  Div: ({ children, ...props }) => h("div", props, children),
  Modal: ({ children, open }) => (open ? h("div", null, children) : null),
  Typography: ({ as = "span", children, ...props }) => h(as, props, children),
  toast: {
    danger: mocks.toastDanger,
    danger: mocks.toastDanger,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning
  }
}));

vi.mock("@/app/LIB/context/DocumentContext", () => ({
  useDocument: () => mocks.documentContext
}));

vi.mock("@/app/LIB/context/UserContext", () => ({
  useUser: () => ({ user: mocks.user })
}));

vi.mock("@/app/LIB/context/EditorContext", () => ({
  useEditor: () => mocks.editorContext
}));

vi.mock("@/app/LIB/context/LayoutContext", () => ({
  useLayout: () => ({ layoutMode: "desktop" })
}));

vi.mock("@/app/LIB/context/DarkModeContext", () => ({
  useDarkMode: () => ({ isDarkMode: false })
}));

vi.mock("@/app/LIB/hook/useDebounce", () => ({
  useDebounce: (value) => mocks.useDebounceOverride ?? value
}));

vi.mock("katex/dist/katex.min.css", () => ({}));

vi.mock("@/app/LIB/components/write/ContentEditor", () => ({
  default: function MockContentEditor({
    value,
    onChange,
    onNotePersistenceRejected,
    onNotePersistenceStatus,
    ...remainingProps
  }) {
    mocks.contentEditorProps = {
      value,
      onChange,
      onNotePersistenceRejected,
      onNotePersistenceStatus,
      ...remainingProps
    };
    return h("div", null, [
      h(
        "button",
        {
          key: "draft",
          "data-editor-value": value,
          "data-testid": "emit-pending-editor-draft",
          onClick: () => onChange?.(mocks.editorDraftHtml)
        },
        "editor"
      ),
      h(
        "button",
        {
          key: "reject",
          "data-testid": "reject-note-persistence",
          onClick: () => onNotePersistenceRejected?.({
            code: "NOTE_PERSISTENCE_SEMANTIC_INVALID"
          })
        },
        "reject note persistence"
      ),
      h(
        "button",
        {
          key: "valid",
          "data-testid": "report-valid-note-snapshot",
          onClick: () => onNotePersistenceStatus?.({
            source: "editor",
            status: "valid"
          })
        },
        "report valid note snapshot"
      )
    ]);
  }
}));

vi.mock("@/app/LIB/components/docs/DocumentLoadingAnimation", () => ({
  default: () => h("div", { "data-testid": "load-doc" })
}));

vi.mock("@/app/LIB/components/common/ScrollReveal", () => ({
  default: ({ children }) => h("div", null, children)
}));

vi.mock("@/app/LIB/components/docs/HwpxWarningDetailModal", () => ({
  default: () => null,
  HwpxWarningDetailTrigger: () => null
}));

vi.mock("@/app/LIB/components/docs/DocxWarningDetailModal", () => ({
  default: () => null,
  DocxWarningDetailTrigger: () => null
}));

vi.mock("@/app/LIB/components/docs/HwpxImportPreviewModal", () => ({
  default: () => null
}));

vi.mock("@/app/LIB/components/docs/ConversionReadinessCard", () => ({
  default: ({ onApply, onCancel, onViewDetails }) =>
    h("div", { "data-testid": "conversion-readiness-card" }, [
      h("button", {
        key: "details",
        type: "button",
        "data-testid": "conversion-readiness-details",
        onClick: onViewDetails
      }, "details"),
      h("button", {
        key: "cancel",
        type: "button",
        "data-testid": "conversion-readiness-cancel",
        onClick: onCancel
      }, "cancel"),
      h("button", {
        key: "apply",
        type: "button",
        "data-testid": "conversion-readiness-apply",
        onClick: onApply
      }, "apply")
    ])
}));

vi.mock("@/app/LIB/ir/fromProseMirror", () => ({
  fromEditorStateToIR: vi.fn()
}));

vi.mock("@/app/LIB/ir/docxImport", () => ({
  importDOCXToIR: vi.fn()
}));

vi.mock("@/app/LIB/ir/hwpxImport", () => ({
  importHWPXToIR: vi.fn()
}));

vi.mock("@/app/LIB/ir/toProseMirror", () => ({
  irToProseMirror: vi.fn()
}));

vi.mock("@/app/LIB/ir/proseMirrorProjectionValidation", () => ({
  validateProseMirrorProjection: vi.fn()
}));

vi.mock("@/app/LIB/ir/hwpxMinimalExport", () => ({
  createHWPXV0ExportInput: vi.fn(),
  exportIRToHWPXV0: vi.fn(),
  summarizeHWPXV0Warnings: vi.fn()
}));

vi.mock("@/app/LIB/ir/docxMinimalExport", () => ({
  createDOCXMinimalExportInput: vi.fn(),
  exportIRToMinimalDOCX: vi.fn()
}));

vi.mock("@/app/LIB/ir/hwpxRemoteImageResolver", () => ({
  resolveHWPXV0RemoteImageSources: vi.fn()
}));

vi.mock("@/app/LIB/utils/docxExportButtonUtils", () => ({
  DOCX_V0_EXPORT_ERROR_MESSAGE: "DOCX export failed",
  DOCX_V0_MIME_TYPE: "application/docx",
  buildDOCXV0ExportNotice: vi.fn(),
  createDOCXV0DownloadFileName: vi.fn(),
  createDOCXV0WarningDetails: vi.fn(),
  finishDOCXV0Export: vi.fn(),
  isDOCXV0PackageBytes: vi.fn(),
  startDOCXV0Export: vi.fn(),
  summarizeDOCXV0Warnings: vi.fn()
}));

vi.mock("@/app/LIB/utils/hwpxExportButtonUtils", () => ({
  HWPX_V0_EXPORT_ERROR_MESSAGE: "HWPX export failed",
  HWPX_V0_MIME_TYPE: "application/hwpx",
  buildHWPXV0ExportNotice: vi.fn(),
  createHWPXV0DownloadFileName: vi.fn(),
  createHWPXV0ExportInput: vi.fn(),
  createHWPXV0PageSettingsFromDocSetting: vi.fn(),
  createHWPXV0WarningDetails: vi.fn(),
  isHWPXV0PackageBytes: vi.fn(),
  summarizeHWPXV0Warnings: vi.fn()
}));

vi.mock("@/app/LIB/utils/docxImportButtonUtils", () => ({
  DOCX_IMPORT_ERROR_MESSAGE: "DOCX import failed",
  applyDOCXImportPreviewToEditor: vi.fn(),
  finishDOCXImportDryRun: vi.fn(),
  runDOCXImportDryRun: vi.fn(),
  startDOCXImportDryRun: vi.fn(),
  validateDOCXImportFile: vi.fn()
}));

vi.mock("@/app/LIB/utils/hwpxImportButtonUtils", () => ({
  HWPX_IMPORT_ERROR_MESSAGE: "HWPX import failed",
  applyHWPXImportPreviewToEditor: vi.fn(),
  finishHWPXImportDryRun: vi.fn(),
  runHWPXImportDryRun: vi.fn(),
  startHWPXImportDryRun: vi.fn(),
  validateHWPXImportFile: vi.fn()
}));

const roots = [];

const pageSetting = {
  lineHeight: 1.6,
  paddingBottom: 20,
  paddingLeft: 20,
  paddingRight: 20,
  paddingTop: 20,
  pageHeight: 297,
  pageWidth: 210
};

const recoveryOperation = {
  actor: "user:user-1",
  schemaVersion: 1,
  source: "manual",
  target: { stableId: "block-1" },
  targetFingerprint: "fp-target",
  type: "format-toggle",
  payload: { mark: "bold" }
};

const createRecoverableOperationJournal = () => {
  const operationId = "write-page-recovery-operation";
  expect(
    appendDocumentOperationAttempt({
      uid: "user-1",
      documentId: "doc-1",
      operation: recoveryOperation,
      operationId,
      now: 1
    })
  ).toBe(true);
  expect(
    appendAppliedDocumentOperation({
      uid: "user-1",
      documentId: "doc-1",
      operation: recoveryOperation,
      result: {
        ok: true,
        operationId,
        beforeFingerprint: "fp-before",
        afterFingerprint: "fp-after"
      },
      now: 2
    })
  ).toBe(true);
  const appliedEvent = readDocumentOperationJournal("user-1", "doc-1").at(-1);
  expect(appliedEvent.kind).toBe("applied");
  expect(
    transitionDocumentOperationsThrough({
      uid: "user-1",
      documentId: "doc-1",
      coveredThroughSequence: appliedEvent.sequence,
      acknowledgementId: "failed-save",
      persistenceStatus: "recovery-required",
      now: 3
    })
  ).toBe(true);
  return appliedEvent;
};

const createDocumentContext = (overrides = {}) => ({
  bulletStyle: null,
  content: "<p>initial</p>",
  docSetting: pageSetting,
  document: {
    _id: "doc-1",
    content: "<p>initial</p>",
    title: "Document"
  },
  error: null,
  focus: 0,
  isSaving: false,
  hasQueuedSave: false,
  lastSaveResult: null,
  loading: false,
  pageNumber: true,
  saveDocument: mocks.saveDocument,
  setContent: mocks.setContent,
  setFocus: mocks.setFocus,
  viewPage: false,
  ...overrides
});

const createEditorContext = (overrides = {}) => ({
  editor: {
    commands: {},
    getHTML: vi.fn(() => "<p>editor</p>"),
    isDestroyed: false,
    state: {
      selection: {
        anchor: 42
      }
    },
    view: {
      dom: document.createElement("div")
    }
  },
  setDocxExportAction: mocks.setDocxExportAction,
  setDocxImportAction: mocks.setDocxImportAction,
  setHwpxExportAction: mocks.setHwpxExportAction,
  setHwpxImportAction: mocks.setHwpxImportAction,
  notifyDocumentOperationRollbackChanged: mocks.notifyDocumentOperationRollbackChanged,
  setPrintAction: mocks.setPrintAction,
  setSaveAction: mocks.setSaveAction,
  ...overrides
});

const waitFor = async (assertion) => {
  let lastError;

  for (let i = 0; i < 20; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

const getRegisteredAction = (setterMock) => {
  const actionSetter = [...setterMock.mock.calls]
    .map(([action]) => action)
    .reverse()
    .find(Boolean);

  return typeof actionSetter === "function" ? actionSetter() : actionSetter;
};

const getRegisteredSaveAction = () => getRegisteredAction(mocks.setSaveAction);
const getRegisteredPrintAction = () => getRegisteredAction(mocks.setPrintAction);
const getRegisteredHwpxImportAction = () =>
  getRegisteredAction(mocks.setHwpxImportAction);
const getRegisteredDocxImportAction = () =>
  getRegisteredAction(mocks.setDocxImportAction);

const renderWritePage = async () => {
  const { default: WritePage } = await import("../../app/docs/[id]/page.js");
  const container = document.createElement("div");
  const root = createRoot(container);

  document.body.appendChild(container);
  roots.push({ container, root });

  await act(async () => {
    root.render(h(WritePage));
  });

  return { container, root, WritePage };
};

beforeEach(() => {
  window.localStorage.clear();
  window.print = vi.fn();
  mocks.documentContext = createDocumentContext();
  mocks.contentEditorProps = null;
  mocks.user = null;
  mocks.editorDraftHtml = "<p>pending editor transaction</p>";
  mocks.editorContext = createEditorContext();
  mocks.routerPush.mockClear();
  mocks.saveDocument.mockReset();
  mocks.saveDocument.mockResolvedValue(true);
  mocks.setContent.mockClear();
  mocks.notifyDocumentOperationRollbackChanged.mockClear();
  mocks.setDocxExportAction.mockClear();
  mocks.setDocxImportAction.mockClear();
  mocks.setFocus.mockClear();
  mocks.setHwpxExportAction.mockClear();
  mocks.setHwpxImportAction.mockClear();
  mocks.setPrintAction.mockClear();
  mocks.setSaveAction.mockClear();
  mocks.toastDanger.mockClear();
  mocks.toastDanger.mockClear();
  mocks.toastInfo.mockClear();
  mocks.toastSuccess.mockClear();
  mocks.toastWarning.mockClear();
  mocks.useDebounceOverride = null;
  applyDOCXImportPreviewToEditor.mockReset();
  applyHWPXImportPreviewToEditor.mockReset();
  runDOCXImportDryRun.mockReset();
  runHWPXImportDryRun.mockReset();
  startDOCXImportDryRun.mockReset();
  startHWPXImportDryRun.mockReset();
  validateDOCXImportFile.mockReset();
  validateHWPXImportFile.mockReset();
  startDOCXImportDryRun.mockReturnValue(true);
  startHWPXImportDryRun.mockReturnValue(true);
  validateDOCXImportFile.mockReturnValue({ valid: true, message: "ready" });
  validateHWPXImportFile.mockReturnValue({ valid: true, message: "ready" });
});

afterEach(() => {
  while (roots.length > 0) {
    const { container, root } = roots.pop();
    act(() => {
      root.unmount();
    });
    container.remove();
  }

  window.document.getElementById("dynamic-page-style")?.remove();
});

describe("WritePage autosave lint regression guard", () => {
  it("persists an operation-bound rollback snapshot before apply and removes it after rejection", async () => {
    mocks.user = { uid: "user-1" };
    await renderWritePage();
    await waitFor(() => {
      expect(typeof mocks.contentEditorProps?.onDocumentOperationWillApply).toBe("function");
      expect(typeof mocks.contentEditorProps?.onDocumentOperationSettled).toBe("function");
    });

    const beforeContent = {
      content: [{
        attrs: { blockId: "block-before" },
        content: [{ text: "Before", type: "text" }],
        type: "paragraph"
      }],
      type: "doc"
    };
    const afterContent = {
      content: [{
        attrs: { blockId: "block-after" },
        content: [{ text: "After", type: "text" }],
        type: "paragraph"
      }],
      type: "doc"
    };
    const createOperation = (idempotencyKey) => createDocumentRootOperation({
      actor: "user:user-1",
      baseRevision: getDocumentSemanticFingerprint(beforeContent),
      idempotencyKey,
      payload: {
        documentOutputFingerprint: getDocumentOutputFingerprint(afterContent),
        kind: "ai-report-document",
        proposalFingerprint: getDocumentSemanticFingerprint({ idempotencyKey, proposal: true }),
        scopeFingerprint: getDocumentSemanticFingerprint({ idempotencyKey, scope: true }),
        workingCopyFingerprint: getDocumentSemanticFingerprint({ idempotencyKey, workingCopy: true })
      },
      source: DOCUMENT_OPERATION_SOURCES.AI_APPROVED,
      targetFingerprint: getDocumentSemanticFingerprint(beforeContent),
      type: DOCUMENT_OPERATION_TYPES.REPLACE_SELECTION
    });
    const prepare = (operation) => mocks.contentEditorProps.onDocumentOperationWillApply({
      operation,
      operationId: getDocumentOperationId(operation),
      rollbackSnapshotCandidate: createDocumentOperationRollbackSnapshotCandidate({
        beforeContent,
        afterContent,
        operation
      })
    });

    const appliedOperation = createOperation("write-page-rollback-applied");
    const appliedOperationId = getDocumentOperationId(appliedOperation);
    expect(prepare(appliedOperation)).toBe(true);
    expect(readDocumentOperationRollbackSnapshot(
      "user-1",
      "doc-1",
      appliedOperationId
    )).toMatchObject({ originalOperationId: appliedOperationId });
    expect(mocks.contentEditorProps.onDocumentOperationSettled({
      operation: appliedOperation,
      result: {
        afterFingerprint: getDocumentSemanticFingerprint(afterContent),
        beforeFingerprint: getDocumentSemanticFingerprint(beforeContent),
        ok: true,
        operationId: appliedOperationId
      }
    })).toBe(true);
    expect(readDocumentOperationJournal("user-1", "doc-1")
      .filter(({ operationId }) => operationId === appliedOperationId)
      .map(({ kind }) => kind)).toEqual(["attempt", "applied"]);
    expect(mocks.notifyDocumentOperationRollbackChanged).toHaveBeenCalledTimes(1);

    const rejectedOperation = createOperation("write-page-rollback-rejected");
    const rejectedOperationId = getDocumentOperationId(rejectedOperation);
    expect(prepare(rejectedOperation)).toBe(true);
    expect(readDocumentOperationRollbackSnapshot(
      "user-1",
      "doc-1",
      rejectedOperationId
    )).not.toBeNull();
    expect(mocks.contentEditorProps.onDocumentOperationSettled({
      operation: rejectedOperation,
      result: {
        afterFingerprint: getDocumentSemanticFingerprint(beforeContent),
        beforeFingerprint: getDocumentSemanticFingerprint(beforeContent),
        error: "PreconditionFailed",
        ok: false,
        operationId: rejectedOperationId
      }
    })).toBe(true);
    expect(readDocumentOperationRollbackSnapshot(
      "user-1",
      "doc-1",
      rejectedOperationId
    )).toBeNull();
    expect(mocks.notifyDocumentOperationRollbackChanged).toHaveBeenCalledTimes(2);

    window.localStorage.setItem(
      createDocumentOperationRollbackSnapshotKey("user-1", "doc-1"),
      "corrupt"
    );
    const blockedOperation = createOperation("write-page-rollback-storage-blocked");
    const blockedOperationId = getDocumentOperationId(blockedOperation);
    expect(prepare(blockedOperation)).toBe(false);
    expect(readDocumentOperationJournal("user-1", "doc-1")
      .filter(({ operationId }) => operationId === blockedOperationId)
      .map(({ kind, error }) => ({ kind, error }))).toEqual([
      { error: undefined, kind: "attempt" },
      { error: "RollbackSnapshotUnavailable", kind: "rejected" }
    ]);
  });

  it("keeps a corrupt operation journal out of the editor while never replaying it", async () => {
    window.localStorage.setItem(
      createDocumentOperationJournalKey("user-1", "doc-1"),
      "not-json"
    );
    mocks.user = { uid: "user-1" };
    const { container } = await renderWritePage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="emit-pending-editor-draft"]')).not.toBeNull();
    });
    expect(
      container.querySelector('[aria-label="문서 작업 저장 상태"]')
    ).toBeNull();
    expect(mocks.setContent).not.toHaveBeenCalled();
  });

  it("does not autosave immediately when the debounced content matches the loaded document content", async () => {
    await renderWritePage();

    await waitFor(() => {
      expect(mocks.setSaveAction).toHaveBeenCalled();
    });

    expect(mocks.saveDocument).not.toHaveBeenCalled();
  });

  it("autosaves changed debounced content with the current editor focus", async () => {
    const { root, WritePage } = await renderWritePage();

    await waitFor(() => {
      expect(mocks.setSaveAction).toHaveBeenCalled();
    });

    mocks.documentContext = createDocumentContext({
      content: "<p>changed</p>"
    });

    await act(async () => {
      root.render(h(WritePage));
    });

    await waitFor(() => {
      expect(mocks.saveDocument).toHaveBeenCalledWith(
        "doc-1",
        {
          content: "<p>changed</p>",
          focus: 42,
        },
        true
      );
    });
  });

  it("notifies rollback inspection after an exact save acknowledges journal evidence", async () => {
    mocks.user = { uid: "user-1" };
    const operationId = "write-page-rollback-save-ack";
    expect(appendDocumentOperationAttempt({
      uid: "user-1",
      documentId: "doc-1",
      operation: recoveryOperation,
      operationId,
      now: 1
    })).toBe(true);
    expect(appendAppliedDocumentOperation({
      uid: "user-1",
      documentId: "doc-1",
      operation: recoveryOperation,
      result: {
        afterFingerprint: "fp-after",
        beforeFingerprint: "fp-before",
        ok: true,
        operationId
      },
      now: 2
    })).toBe(true);
    const { root, WritePage } = await renderWritePage();
    await waitFor(() => expect(mocks.setSaveAction).toHaveBeenCalled());
    mocks.notifyDocumentOperationRollbackChanged.mockClear();

    await act(async () => {
      mocks.contentEditorProps.onChange("<p>changed</p>");
    });

    mocks.documentContext = createDocumentContext({ content: "<p>changed</p>" });
    await act(async () => {
      root.render(h(WritePage));
    });
    await waitFor(() => {
      expect(readDocumentOperationJournal("user-1", "doc-1")).toContainEqual(
        expect.objectContaining({
          kind: "transition",
          operationId,
          persistenceStatus: "durable"
        })
      );
    });
    expect(mocks.notifyDocumentOperationRollbackChanged).toHaveBeenCalled();
  });

  it("does not render failed save status inside the write page", async () => {
    const failedAt = new Date("2026-06-18T05:30:00.000Z").getTime();

    mocks.documentContext = createDocumentContext({
      lastSaveResult: {
        completedAt: failedAt,
        id: "doc-1",
        ok: false
      }
    });

    const { container } = await renderWritePage();

    expect(container.querySelector('[data-testid="write-save-status"]')).toBeNull();
    expect(container.textContent).not.toContain("저장 실패");
    expect(container.textContent).not.toContain("저장 완료");
  });

  it("does not render saved status inside the write page", async () => {
    const savedAt = new Date("2026-06-18T05:31:00.000Z").getTime();

    mocks.documentContext = createDocumentContext({
      lastSaveResult: {
        completedAt: savedAt,
        id: "doc-1",
        ok: true
      }
    });

    const { container } = await renderWritePage();

    expect(container.querySelector('[data-testid="write-save-status"]')).toBeNull();
    expect(container.textContent).not.toContain("저장 완료");
    expect(container.textContent).not.toContain("저장 실패");
  });

  it("does not render queued save status inside the write page", async () => {
    const savedAt = new Date("2026-06-18T05:31:00.000Z").getTime();

    mocks.documentContext = createDocumentContext({
      hasQueuedSave: true,
      isSaving: true,
      lastSaveResult: {
        completedAt: savedAt,
        id: "doc-1",
        ok: true
      }
    });

    const { container } = await renderWritePage();

    expect(container.querySelector('[data-testid="write-save-status"]')).toBeNull();
    expect(container.textContent).not.toContain("저장 대기 중");
    expect(container.textContent).not.toContain("저장 중");
    expect(container.textContent).not.toContain("저장 완료");
    expect(container.textContent).not.toContain("저장 실패");
  });

  it("does not mark failed autosave content as saved", async () => {
    const { root, WritePage } = await renderWritePage();

    await waitFor(() => {
      expect(mocks.setSaveAction).toHaveBeenCalled();
    });

    mocks.saveDocument.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mocks.documentContext = createDocumentContext({
      content: "<p>changed</p>"
    });

    await act(async () => {
      root.render(h(WritePage));
    });

    await waitFor(() => {
      expect(mocks.saveDocument).toHaveBeenCalledWith(
        "doc-1",
        {
          content: "<p>changed</p>",
          focus: 42,
        },
        true
      );
    });

    await waitFor(() => {
      expect(mocks.toastDanger).toHaveBeenCalled();
    });

    mocks.saveDocument.mockClear();
    mocks.toastDanger.mockClear();
    mocks.toastSuccess.mockClear();
    mocks.editorContext = createEditorContext({
      editor: {
        ...createEditorContext().editor,
        state: {
          selection: {
            anchor: 84
          }
        }
      }
    });

    await act(async () => {
      root.render(h(WritePage));
    });

    await waitFor(() => {
      expect(mocks.saveDocument).toHaveBeenCalledWith(
        "doc-1",
        {
          content: "<p>changed</p>",
          focus: 84,
        },
        true
      );
    });
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it("does not autosave without a document id", async () => {
    mocks.documentContext = createDocumentContext({
      content: "<p>changed</p>",
      document: null
    });

    await renderWritePage();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.saveDocument).not.toHaveBeenCalled();
  });

  it("does not autosave when switching to a loaded empty document", async () => {
    const { root, WritePage } = await renderWritePage();

    await waitFor(() => {
      expect(mocks.setSaveAction).toHaveBeenCalled();
    });

    mocks.saveDocument.mockClear();
    mocks.documentContext = createDocumentContext({
      content: "",
      document: {
        _id: "doc-empty",
        content: "",
        title: "Empty document"
      }
    });

    await act(async () => {
      root.render(h(WritePage));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.saveDocument).not.toHaveBeenCalled();
  });

  it("does not autosave when switching to a loaded non-empty document", async () => {
    const { root, WritePage } = await renderWritePage();

    await waitFor(() => {
      expect(mocks.setSaveAction).toHaveBeenCalled();
    });

    mocks.saveDocument.mockClear();
    mocks.documentContext = createDocumentContext({
      content: "<h1>생성된 문서</h1><p>초안 본문</p>",
      document: {
        _id: "doc-generated",
        content: "<h1>생성된 문서</h1><p>초안 본문</p>",
        title: "생성된 문서"
      }
    });

    await act(async () => {
      root.render(h(WritePage));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.saveDocument).not.toHaveBeenCalled();
  });

  it("does not autosave stale debounced content after switching documents", async () => {
    const { root, WritePage } = await renderWritePage();

    await waitFor(() => {
      expect(mocks.setSaveAction).toHaveBeenCalled();
    });

    mocks.saveDocument.mockClear();
    mocks.useDebounceOverride = "<p>previous document content</p>";
    mocks.documentContext = createDocumentContext({
      content: "<p>new document content</p>",
      document: {
        _id: "doc-new",
        content: "<p>new document content</p>",
        title: "New document"
      }
    });

    await act(async () => {
      root.render(h(WritePage));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.saveDocument).not.toHaveBeenCalled();
  });

  it("treats uppercase Ctrl+S key events as manual saves", async () => {
    await renderWritePage();

    await waitFor(() => {
      expect(mocks.setSaveAction).toHaveBeenCalled();
    });

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "S"
    });

    await act(async () => {
      window.dispatchEvent(event);
    });

    await waitFor(() => {
      expect(mocks.saveDocument).toHaveBeenCalledWith(
        "doc-1",
        {
          content: "<p>initial</p>",
          focus: 42,
          refreshThumbnail: true
        },
        true
      );
    });

    expect(event.defaultPrevented).toBe(true);
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  

  it("holds all covered write boundaries after a rejected persisted candidate until a valid editor status arrives", async () => {
    mocks.user = { uid: "user-1" };
    const { container, root, WritePage } = await renderWritePage();

    await waitFor(() => {
      expect(mocks.setSaveAction).toHaveBeenCalled();
    });
    await act(async () => {
      container
        .querySelector('[data-testid="reject-note-persistence"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      container
        .querySelector('[data-testid="emit-pending-editor-draft"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    mocks.documentContext = createDocumentContext({ content: "<p>blocked autosave</p>" });
    mocks.useDebounceOverride = "<p>blocked autosave</p>";
    await act(async () => {
      root.render(h(WritePage));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    let blockedSave;
    await act(async () => {
      blockedSave = await getRegisteredSaveAction()();
    });
    expect(blockedSave).toBe(false);
    expect(mocks.saveDocument).not.toHaveBeenCalled();

    await act(async () => {
      container
        .querySelector('[data-testid="report-valid-note-snapshot"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    let recoveredSave;
    await act(async () => {
      recoveredSave = await getRegisteredSaveAction()();
    });
    expect(recoveredSave).toBe(true);
    expect(mocks.saveDocument).toHaveBeenCalled();

  });

  

  it("does not treat Ctrl+Shift+S as the regular manual save shortcut", async () => {
    await renderWritePage();

    await waitFor(() => {
      expect(mocks.setSaveAction).toHaveBeenCalled();
    });

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "S",
      shiftKey: true
    });

    await act(async () => {
      window.dispatchEvent(event);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.saveDocument).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not report manual save success when the save queue returns failure", async () => {
    await renderWritePage();

    await waitFor(() => {
      expect(mocks.setSaveAction).toHaveBeenCalled();
    });

    mocks.saveDocument.mockResolvedValueOnce(false);
    const saveAction = getRegisteredSaveAction();
    let saveResult;

    await act(async () => {
      saveResult = await saveAction();
    });

    expect(saveResult).toBe(false);
    expect(mocks.saveDocument).toHaveBeenCalledWith(
      "doc-1",
      {
        content: "<p>initial</p>",
        focus: 42,
        refreshThumbnail: true
      },
      true
    );
    expect(mocks.setFocus).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastDanger).toHaveBeenCalledWith(
      "저장하지 못했습니다. 파일 변경 여부와 폴더 쓰기 권한을 확인해 주세요."
    );
  });

  it("persists HWPX sourceFileName after applying an analyzed import", async () => {
    const editor = {
      ...createEditorContext().editor,
      getHTML: vi.fn(() => "<p>hwpx applied</p>")
    };
    const file = { name: "minimal-styled-text.hwpx", size: 128 };

    mocks.editorContext = createEditorContext({ editor });
    runHWPXImportDryRun.mockResolvedValue({
      ok: true,
      preview: {
        summary: {
          canApply: true,
          fileName: file.name,
          importWarningCount: 0,
          lossCount: 0,
          projectionWarningCount: 0,
          validationWarningCount: 0
        }
      }
    });
    applyHWPXImportPreviewToEditor.mockReturnValue({ applied: true });

    const { container } = await renderWritePage();

    await waitFor(() => {
      expect(mocks.setHwpxImportAction).toHaveBeenCalled();
    });

    const importAction = getRegisteredHwpxImportAction();

    await act(async () => {
      await importAction(file);
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="conversion-readiness-apply"]')).not.toBeNull();
    });

    await act(async () => {
      container
        .querySelector('[data-testid="conversion-readiness-apply"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(applyHWPXImportPreviewToEditor).toHaveBeenCalled();
    expect(mocks.setContent).toHaveBeenCalledWith("<p>hwpx applied</p>");

    await waitFor(() => {
      expect(mocks.saveDocument).toHaveBeenCalledWith(
        "doc-1",
        {
          sourceFileName: "minimal-styled-text.hwpx"
        },
        true
      );
    });
  });

  it("persists DOCX sourceFileName after applying an analyzed import", async () => {
    const editor = {
      ...createEditorContext().editor,
      getHTML: vi.fn(() => "<p>docx applied</p>")
    };
    const file = { name: "real-simple-list.docx", size: 256 };

    mocks.editorContext = createEditorContext({ editor });
    runDOCXImportDryRun.mockResolvedValue({
      ok: true,
      preview: {
        summary: {
          canApply: true,
          fileName: file.name,
          importWarningCount: 0,
          projectionWarningCount: 0,
          validationWarningCount: 0
        }
      }
    });
    applyDOCXImportPreviewToEditor.mockReturnValue({ applied: true });

    const { container } = await renderWritePage();

    await waitFor(() => {
      expect(mocks.setDocxImportAction).toHaveBeenCalled();
    });

    const importAction = getRegisteredDocxImportAction();

    await act(async () => {
      await importAction(file);
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="conversion-readiness-apply"]')).not.toBeNull();
    });

    await act(async () => {
      container
        .querySelector('[data-testid="conversion-readiness-apply"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(applyDOCXImportPreviewToEditor).toHaveBeenCalled();
    expect(mocks.setContent).toHaveBeenCalledWith("<p>docx applied</p>");

    await waitFor(() => {
      expect(mocks.saveDocument).toHaveBeenCalledWith(
        "doc-1",
        {
          sourceFileName: "real-simple-list.docx"
        },
        true
      );
    });
  });

  it("does not report manual save success when the save queue throws", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      await renderWritePage();

      await waitFor(() => {
        expect(mocks.setSaveAction).toHaveBeenCalled();
      });

      mocks.saveDocument.mockRejectedValueOnce(new Error("network failed"));
      const saveAction = getRegisteredSaveAction();
      let saveResult;

      await act(async () => {
        saveResult = await saveAction();
      });

      expect(saveResult).toBe(false);
      expect(mocks.setFocus).not.toHaveBeenCalled();
      expect(mocks.toastSuccess).not.toHaveBeenCalled();
      expect(mocks.toastDanger).toHaveBeenCalledWith(
        "저장하지 못했습니다. 파일 변경 여부와 폴더 쓰기 권한을 확인해 주세요."
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("prints a ready document through both the shared action and Ctrl/Cmd+P", async () => {
    await renderWritePage();
    await waitFor(() => {
      expect(mocks.setPrintAction).toHaveBeenCalled();
    });

    let printResult;
    await act(async () => {
      printResult = await getRegisteredPrintAction()();
    });
    expect(printResult).toBe(true);
    expect(window.print).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "p",
        ctrlKey: true,
        cancelable: true
      }));
    });
    await waitFor(() => {
      expect(window.print).toHaveBeenCalledTimes(2);
    });
  });

  it("blocks native print until a footnote projection becomes ready", async () => {
    const editorRoot = document.createElement("div");
    editorRoot.setAttribute("data-dockit-footnote-print-state", "blocked");
    mocks.editorContext = createEditorContext({
      editor: {
        ...createEditorContext().editor,
        view: { dom: editorRoot }
      }
    });
    const { container } = await renderWritePage();
    await waitFor(() => {
      expect(mocks.setPrintAction).toHaveBeenCalled();
    });

    await act(async () => {
      expect(await getRegisteredPrintAction()()).toBe(false);
    });
    expect(window.print).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(container.textContent).toContain("PDF 출력 전에 해결해 주세요");
    });
    expect(
      container.querySelector('[data-testid="pdf-output-preflight-confirm"]')
    ).toBeNull();

    editorRoot.setAttribute("data-dockit-footnote-print-state", "not-required");
    await act(async () => {
      container
        .querySelector('[data-testid="pdf-output-preflight-recheck"]')
        .click();
    });
    await waitFor(() => {
      expect(window.print).toHaveBeenCalledTimes(1);
      expect(
        container.querySelector('[data-testid="pdf-output-preflight-modal"]')
      ).toBeNull();
    });
  });

  it("re-audits warning confirmation and never authorizes a newly blocked document", async () => {
    const editorRoot = document.createElement("div");
    const pendingImage = document.createElement("img");
    Object.defineProperty(pendingImage, "complete", {
      configurable: true,
      value: false
    });
    editorRoot.appendChild(pendingImage);
    mocks.editorContext = createEditorContext({
      editor: {
        ...createEditorContext().editor,
        view: { dom: editorRoot }
      }
    });
    const { container } = await renderWritePage();
    await waitFor(() => {
      expect(mocks.setPrintAction).toHaveBeenCalled();
    });

    await act(async () => {
      expect(await getRegisteredPrintAction()()).toBe(false);
    });
    await waitFor(() => {
      expect(container.textContent).toContain("PDF 출력 전에 확인해 주세요");
    });
    expect(window.print).not.toHaveBeenCalled();

    const clippedRow = document.createElement("div");
    clippedRow.className =
      "tiptap-table-row-too-tall tiptap-table-row-too-tall--clipped";
    editorRoot.appendChild(clippedRow);
    await act(async () => {
      container
        .querySelector('[data-testid="pdf-output-preflight-confirm"]')
        .click();
    });
    await waitFor(() => {
      expect(container.textContent).toContain("PDF 출력 전에 해결해 주세요");
    });
    expect(window.print).not.toHaveBeenCalled();

    clippedRow.remove();
    await act(async () => {
      container
        .querySelector('[data-testid="pdf-output-preflight-recheck"]')
        .click();
    });
    await waitFor(() => {
      expect(container.textContent).toContain("PDF 출력 전에 확인해 주세요");
    });
    await act(async () => {
      container
        .querySelector('[data-testid="pdf-output-preflight-confirm"]')
        .click();
    });
    await waitFor(() => {
      expect(window.print).toHaveBeenCalledTimes(1);
    });
  });

  
});
