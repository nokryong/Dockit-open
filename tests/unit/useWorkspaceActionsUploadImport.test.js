/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_DKT_BYTES } from "../../app/LIB/utils/dktDocumentUtils.js";
const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  createData: vi.fn(),
  deleteData: vi.fn(),
  updateData: vi.fn(),
  moveData: vi.fn(),
  convertOfficeFileToDocument: vi.fn(),
  toastDanger: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn()
}));

vi.mock("../../app/LIB/utils/dataUtils", () => ({
  createData: mocks.createData,
  deleteData: mocks.deleteData,
  updateData: mocks.updateData,
  moveData: mocks.moveData
}));

vi.mock("../../app/LIB/utils/officeFileImportUtils", () => ({
  convertOfficeFileToDocument: mocks.convertOfficeFileToDocument
}));

vi.mock("sud-ui", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    toast: {
      danger: mocks.toastDanger,
      success: mocks.toastSuccess,
      info: mocks.toastInfo,
      warning: vi.fn()
    }
  };
});

const roots = [];

const createFile = (name, size = 2048) => ({
  name,
  size,
  arrayBuffer: async () => new ArrayBuffer(8)
});

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const renderHook = async ({
  currentFolderId = null,
  fetchContent = vi.fn().mockResolvedValue(undefined),
  fetchFolderTree = vi.fn().mockResolvedValue(undefined),
  navigateToDocument = vi.fn().mockResolvedValue(undefined),
  openDocumentWidget = vi.fn().mockResolvedValue(undefined)
} = {}) => {
  const { useWorkspaceActions } = await import(
    "../../app/docs/hooks/useWorkspaceActions.js"
  );
  const snapshots = [];
  const Capture = ({ folderId }) => {
    snapshots.push(
      useWorkspaceActions({
        user: { uid: "user-1" },
        currentFolderId: folderId,
        fetchContent,
        fetchFolderTree,
        folderTree: [],
        navigateToDocument,
        openDocumentWidget
      })
    );
    return null;
  };
  const container = document.createElement("div");
  const root = createRoot(container);

  document.body.appendChild(container);
  roots.push({ container, root });

  await act(async () => {
    root.render(h(Capture, { folderId: currentFolderId }));
  });
  snapshots.setCurrentFolderId = async (folderId) => {
    await act(async () => {
      root.render(h(Capture, { folderId }));
    });
  };

  return snapshots;
};

beforeEach(() => {
  mocks.createData.mockReset().mockResolvedValue({ content: {} });
  mocks.convertOfficeFileToDocument.mockReset();
  mocks.toastDanger.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.toastInfo.mockReset();
});

afterEach(() => {
  while (roots.length > 0) {
    const { container, root } = roots.pop();
    act(() => {
      root.unmount();
    });
    container.remove();
  }
});

describe("useWorkspaceActions document upload", () => {
  it("allows a new create after create failure", async () => {
    const fetchContent = vi.fn().mockResolvedValue(undefined);
    const fetchFolderTree = vi.fn().mockResolvedValue(undefined);
    const navigateToDocument = vi.fn().mockResolvedValue(undefined);
    mocks.createData
      .mockRejectedValueOnce(new Error("create failed"))
      .mockResolvedValueOnce({ content: { _id: "report-after-failure" } });
    const snapshots = await renderHook({
      fetchContent,
      fetchFolderTree,
      navigateToDocument
    });

    let result;
    await act(async () => {
      result = await snapshots.at(-1).handleCreateDocument({ title: "report" }, {
        openAfterCreate: true
      });
    });

    expect(result).toBeNull();
    expect(fetchContent).not.toHaveBeenCalled();
    expect(fetchFolderTree).not.toHaveBeenCalled();
    expect(navigateToDocument).not.toHaveBeenCalled();
    expect(mocks.toastDanger).toHaveBeenCalledWith(
      "문서 생성에 실패했습니다."
    );
    expect(snapshots.at(-1).documentCreationState).toEqual({
      status: "failed",
      documentId: null,
      failurePhase: "create"
    });

    await act(async () => {
      result = await snapshots.at(-1).handleCreateDocument({ title: "report" }, {
        openAfterCreate: true
      });
    });

    expect(mocks.createData).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      content: { _id: "report-after-failure" }
    });
    expect(fetchContent).toHaveBeenCalledTimes(1);
    expect(fetchFolderTree).toHaveBeenCalledTimes(1);
    expect(navigateToDocument).toHaveBeenCalledWith(
      "report-after-failure"
    );
    expect(snapshots.at(-1).documentCreationState).toEqual({
      status: "idle",
      documentId: null,
      failurePhase: null
    });
  });

  it("opens the created document even when list refresh fails", async () => {
    const fetchContent = vi.fn().mockRejectedValue(new Error("refresh failed"));
    const fetchFolderTree = vi.fn().mockResolvedValue(undefined);
    const navigateToDocument = vi.fn().mockResolvedValue(undefined);
    mocks.createData.mockResolvedValue({ content: { _id: "report-2" } });
    const snapshots = await renderHook({
      fetchContent,
      fetchFolderTree,
      navigateToDocument
    });

    await act(async () => {
      await snapshots.at(-1).handleCreateDocument({ title: "report" }, {
        openAfterCreate: true
      });
    });

    expect(mocks.createData).toHaveBeenCalledTimes(1);
    expect(navigateToDocument).toHaveBeenCalledWith("report-2");
    expect(snapshots.at(-1).documentCreationState).toEqual({
      status: "idle",
      documentId: null,
      failurePhase: null
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "문서가 생성되었습니다."
    );
  });

  it("waits for every refresh and retries only the failed refresh", async () => {
    const folderTreeDeferred = createDeferred();
    const fetchContent = vi
      .fn()
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValue(undefined);
    const fetchFolderTree = vi
      .fn()
      .mockReturnValueOnce(folderTreeDeferred.promise);
    mocks.createData.mockResolvedValue({ content: { _id: "blank-1" } });
    const snapshots = await renderHook({ fetchContent, fetchFolderTree });

    let createPromise;
    let inFlightRetryPromise;
    await act(async () => {
      createPromise = snapshots
        .at(-1)
        .handleCreateDocument({ title: "새 문서" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(snapshots.at(-1).documentCreationState).toEqual({
      status: "finalizing",
      documentId: "blank-1",
      failurePhase: null
    });

    await act(async () => {
      inFlightRetryPromise = snapshots
        .at(-1)
        .retryPendingDocumentCreation();
      await Promise.resolve();
    });

    expect(fetchContent).toHaveBeenCalledTimes(1);
    expect(fetchFolderTree).toHaveBeenCalledTimes(1);

    await act(async () => {
      folderTreeDeferred.resolve(undefined);
      await Promise.all([createPromise, inFlightRetryPromise]);
    });

    expect(snapshots.at(-1).documentCreationState).toEqual({
      status: "retryable",
      documentId: "blank-1",
      failurePhase: "refresh"
    });

    await act(async () => {
      await snapshots.at(-1).retryPendingDocumentCreation();
    });

    expect(mocks.createData).toHaveBeenCalledTimes(1);
    expect(fetchContent).toHaveBeenCalledTimes(2);
    expect(fetchFolderTree).toHaveBeenCalledTimes(1);
    expect(snapshots.at(-1).documentCreationState).toEqual({
      status: "idle",
      documentId: null,
      failurePhase: null
    });
  });

  it("retries only failed refresh and navigation with the created ID", async () => {
    const fetchContent = vi
      .fn()
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValue(undefined);
    const fetchFolderTree = vi.fn().mockResolvedValue(undefined);
    const navigateToDocument = vi
      .fn()
      .mockRejectedValueOnce(new Error("navigation failed"))
      .mockResolvedValue(undefined);
    const openDocumentWidget = vi.fn().mockResolvedValue(undefined);
    mocks.createData.mockResolvedValue({ content: { _id: "research-1" } });
    const snapshots = await renderHook({
      fetchContent,
      fetchFolderTree,
      navigateToDocument,
      openDocumentWidget
    });

    await act(async () => {
      await snapshots.at(-1).handleCreateDocument({ title: "research-note" }, {
        openAfterCreate: true,
        widgetId: "prism"
      });
    });

    expect(snapshots.at(-1).documentCreationState).toEqual({
      status: "retryable",
      documentId: "research-1",
      failurePhase: "navigation"
    });

    await act(async () => {
      await snapshots.at(-1).retryPendingDocumentCreation();
    });

    expect(mocks.createData).toHaveBeenCalledTimes(1);
    expect(fetchContent).toHaveBeenCalledTimes(2);
    expect(fetchFolderTree).toHaveBeenCalledTimes(1);
    expect(openDocumentWidget).toHaveBeenCalledTimes(1);
    expect(openDocumentWidget).toHaveBeenCalledWith("prism");
    expect(navigateToDocument).toHaveBeenCalledTimes(2);
    expect(navigateToDocument).toHaveBeenLastCalledWith("research-1");
    expect(snapshots.at(-1).documentCreationState).toEqual({
      status: "idle",
      documentId: null,
      failurePhase: null
    });
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("imports a schema-v1 DKT through the allowlist", async () => {
    const snapshots = await renderHook();
    const file = new File(
      [
        JSON.stringify({
          fileType: "dkt-document",
          schemaVersion: 1,
          title: "local report",
          content: "<p>local content</p>",
          docSetting: { pageWidth: 210 },
          bulletStyle: { disc: "•" },
          viewPage: true,
          pageNumber: "center",
          focus: 4,
          _id: "private-id",
          user_uid: "private-user",
          teamMembers: ["viewer"],
          contentURL: "https://storage.example/private-token"
        })
      ],
      "local-report.dkt",
      { type: "application/json" }
    );

    await act(async () => {
      await snapshots.at(-1).handleUploadFile(file, vi.fn());
    });

    expect(mocks.createData).toHaveBeenCalledWith("documents", null, {
      title: "local report",
      content: "<p>local content</p>",
      docSetting: { pageWidth: 210 },
      bulletStyle: { disc: "•" },
      viewPage: true,
      pageNumber: "center",
      focus: 4
    });
    expect(mocks.toastDanger).not.toHaveBeenCalled();
  });

  it("rejects an oversized DKT before FileReader or document creation", async () => {
    const snapshots = await renderHook();
    const file = createFile("oversized.dkt", MAX_DKT_BYTES + 1);

    await act(async () => {
      await snapshots.at(-1).handleUploadFile(file, vi.fn());
    });

    expect(mocks.createData).not.toHaveBeenCalled();
    expect(mocks.toastDanger).toHaveBeenCalledWith(
      "50MB를 초과하는 Dockit 문서는 불러올 수 없습니다."
    );
  });

  it("creates a document from the IR-converted DOCX payload without a warning toast", async () => {
    mocks.convertOfficeFileToDocument.mockResolvedValue({
      title: "report",
      content: "<p>IR docx content</p>",
      sourceFileName: "report.docx",
      warningTotal: 0
    });

    const snapshots = await renderHook();
    const file = createFile("report.docx");

    await act(async () => {
      await snapshots.at(-1).handleUploadFile(file, vi.fn());
    });

    expect(mocks.convertOfficeFileToDocument).toHaveBeenCalledWith(file);
    expect(mocks.createData).toHaveBeenCalledTimes(1);
    const [contentType, parentId, newDoc] = mocks.createData.mock.calls[0];
    expect(contentType).toBe("documents");
    expect(parentId).toBeNull();
    expect(newDoc).toEqual({
      title: "report",
      content: "<p>IR docx content</p>",
      sourceFileName: "report.docx"
    });
    expect(mocks.toastInfo).not.toHaveBeenCalled();
    expect(mocks.toastDanger).not.toHaveBeenCalled();
  });

  it("creates a document from the IR-converted HWPX payload and shows an info toast when warnings exist", async () => {
    mocks.convertOfficeFileToDocument.mockResolvedValue({
      title: "notes",
      content: "<p>IR hwpx content</p>",
      sourceFileName: "notes.hwpx",
      warningTotal: 3
    });

    const snapshots = await renderHook();
    const file = createFile("notes.hwpx");

    await act(async () => {
      await snapshots.at(-1).handleUploadFile(file, vi.fn());
    });

    expect(mocks.convertOfficeFileToDocument).toHaveBeenCalledWith(file);
    expect(mocks.createData).toHaveBeenCalledTimes(1);
    const [, , newDoc] = mocks.createData.mock.calls[0];
    expect(newDoc.title).toBe("notes");
    expect(newDoc.sourceFileName).toBe("notes.hwpx");
    expect(mocks.toastInfo).toHaveBeenCalledTimes(1);
    expect(mocks.toastInfo.mock.calls[0][0]).toContain("확인할 항목 3개");
  });

  it("blocks the upload and shows the classified failure message when the IR preview is blocked", async () => {
    const error = new Error("적용 전 해결이 필요한 항목이 있습니다.");
    error.conversionFailure = {
      category: "blocked",
      title: "적용 전 확인 필요",
      message: "적용 전 해결이 필요한 항목이 있습니다. 자세히 보기에서 차단 사유를 확인해 주세요.",
      action: "review-blocking-items",
      blocked: true
    };
    mocks.convertOfficeFileToDocument.mockRejectedValue(error);

    const snapshots = await renderHook();
    const file = createFile("broken.docx");

    await act(async () => {
      await snapshots.at(-1).handleUploadFile(file, vi.fn());
    });

    expect(mocks.createData).not.toHaveBeenCalled();
    expect(mocks.toastDanger).toHaveBeenCalledTimes(1);
    expect(mocks.toastDanger.mock.calls[0][0]).toBe(
      "적용 전 확인 필요 적용 전 해결이 필요한 항목이 있습니다. 자세히 보기에서 차단 사유를 확인해 주세요."
    );
  });

  it("shows the classified failure message instead of a generic server-error toast for a corrupt DOCX", async () => {
    const error = new Error("압축 패키지를 열지 못했거나 필수 문서 항목이 없어 현재 문서는 변경하지 않았습니다.");
    error.conversionFailure = {
      category: "invalid-package",
      title: "올바른 HWPX/DOCX 파일이 아닙니다",
      message: "압축 패키지를 열지 못했거나 필수 문서 항목이 없어 현재 문서는 변경하지 않았습니다.",
      action: "reselect-package",
      blocked: false
    };
    mocks.convertOfficeFileToDocument.mockRejectedValue(error);

    const snapshots = await renderHook();
    const file = createFile("corrupt.docx");

    await act(async () => {
      await snapshots.at(-1).handleUploadFile(file, vi.fn());
    });

    expect(mocks.createData).not.toHaveBeenCalled();
    expect(mocks.toastDanger).toHaveBeenCalledTimes(1);
    expect(mocks.toastDanger.mock.calls[0][0]).toBe(
      "올바른 HWPX/DOCX 파일이 아닙니다 압축 패키지를 열지 못했거나 필수 문서 항목이 없어 현재 문서는 변경하지 않았습니다."
    );
  });
});
