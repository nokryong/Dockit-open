/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  fetchData: vi.fn(),
  fetchDocumentContent: vi.fn(),
  html2canvas: vi.fn(),
  updateData: vi.fn(),
}));

vi.mock("../../app/LIB/utils/dataUtils", () => ({
  fetchData: mocks.fetchData,
  fetchDocumentContent: mocks.fetchDocumentContent,
  updateData: mocks.updateData
}));

vi.mock("html2canvas", () => ({
  default: mocks.html2canvas
}));

const roots = [];
let latestContext;

const pageSetting = {
  lineHeight: 1.6,
  paddingBottom: 20,
  paddingLeft: 20,
  paddingRight: 20,
  paddingTop: 20,
  pageHeight: 297,
  pageWidth: 210
};

const renderDocumentProvider = async () => {
  const { DocumentProvider, useDocument } = await import(
    "../../app/LIB/context/DocumentContext.js"
  );

  const Probe = () => {
    latestContext = useDocument();
    return null;
  };

  const container = document.createElement("div");
  const root = createRoot(container);

  document.body.appendChild(container);
  roots.push({ container, root });

  await act(async () => {
    root.render(h(DocumentProvider, null, h(Probe)));
  });

  return { root };
};

const primeDocumentState = async (overrides = {}) => {
  const nextDocument = {
    _id: "doc-1",
    content: "<p>old</p>",
    revision: "revision-1",
    title: "Document",
    ...overrides.document
  };

  await act(async () => {
    latestContext.setDocument(nextDocument);
    latestContext.setTitle(nextDocument.title);
    latestContext.setContent(nextDocument.content);
    latestContext.setDocSetting(pageSetting);
    latestContext.setBulletStyle(null);
    latestContext.setFocus(0);
    latestContext.setViewPage(false);
    latestContext.setPageNumber("none");
  });

  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  latestContext = null;
  mocks.fetchData.mockReset();
  mocks.fetchDocumentContent.mockReset();
  mocks.fetchDocumentContent.mockResolvedValue("<p>loaded</p>");
  mocks.html2canvas.mockReset();
  mocks.updateData.mockReset();
  let revision = 1;
  mocks.updateData.mockImplementation(async (type, id, payload) => {
    revision += 1;
    const { content, expectedRevision, ...metadata } = payload;
    void content;
    void expectedRevision;
    return {
      content: {
        _id: id,
        ...metadata,
        revision: `revision-${revision}`,
        updated_at: `2026-07-18T00:00:0${revision}`
      }
    };
  });
});

afterEach(() => {
  while (roots.length > 0) {
    const { container, root } = roots.pop();
    act(() => {
      root.unmount();
    });
    container.remove();
  }
  document.getElementById("pages")?.remove();
});

describe("DocumentContext save failure regression guard", () => {
  it("exposes the latest durable revision synchronously after a queued save settles", async () => {
    await renderDocumentProvider();
    await primeDocumentState();
    expect(latestContext.getDocumentRevision("doc-1")).toBe("revision-1");

    await act(async () => {
      await latestContext.saveDocument(
        "doc-1",
        { content: "<p>new durable content</p>" },
        true
      );
    });

    expect(latestContext.getDocumentRevision("doc-1")).toBe("revision-2");
    expect(latestContext.getDocumentRevision("another-doc")).toBeNull();
  });

  it("loads metadata and HTML through separate local adapter calls", async () => {
    mocks.fetchData.mockResolvedValueOnce({
      content: {
        _id: "doc-1",
        title: "Loaded",
        revision: "revision-7",
        content: "<p>inline stale</p>",
        contentURL: "https://storage.example/private-token",
        contentStoragePath: "documents/user-1/doc-1/hash.html"
      }
    });
    mocks.fetchDocumentContent.mockResolvedValueOnce("<p>canonical</p>");
    await renderDocumentProvider();

    await act(async () => {
      await latestContext.loadDocument("doc-1");
    });

    expect(mocks.fetchData).toHaveBeenCalledWith("documents", "doc-1");
    expect(mocks.fetchDocumentContent).toHaveBeenCalledWith("doc-1");
    expect(mocks.updateData).not.toHaveBeenCalled();
    expect(latestContext.document).toMatchObject({
      _id: "doc-1",
      content: "<p>canonical</p>",
      revision: "revision-7"
    });
    expect(latestContext.document).not.toHaveProperty("contentURL");
    expect(latestContext.document).not.toHaveProperty("contentStoragePath");
  });

  it("captures, persists, and refreshes the thumbnail when a content save requests it", async () => {
    const pages = document.createElement("div");
    pages.id = "pages";
    pages.innerHTML = '<div class="tiptap-main-canvas">document</div>';
    document.body.appendChild(pages);
    const thumbnail = "data:image/png;base64,refreshed";
    mocks.html2canvas.mockResolvedValue({ toDataURL: () => thumbnail });

    await renderDocumentProvider();
    await primeDocumentState();

    let saveResult;
    await act(async () => {
      saveResult = await latestContext.saveDocument(
        "doc-1",
        { content: "<p>new</p>", refreshThumbnail: true },
        true
      );
    });

    expect(saveResult).toBe(true);
    expect(mocks.html2canvas).toHaveBeenCalledTimes(1);
    expect(mocks.updateData).toHaveBeenCalledWith(
      "documents",
      "doc-1",
      expect.objectContaining({ thumbnail })
    );
    expect(latestContext.thumbnail).toBe(thumbnail);
    expect(latestContext.document.thumbnail).toBe(thumbnail);
  });

  it("excludes ProseMirror cursor separators from thumbnail capture", async () => {
    const pages = document.createElement("div");
    pages.id = "pages";
    pages.innerHTML = '<div class="tiptap-main-canvas"><img class="ProseMirror-separator" alt="" src=""></div>';
    document.body.appendChild(pages);
    mocks.html2canvas.mockResolvedValue({ toDataURL: () => "data:image/png;base64,thumbnail" });

    await renderDocumentProvider();
    await primeDocumentState();

    await act(async () => {
      await latestContext.saveDocument(
        "doc-1",
        { content: "<p>new</p>", refreshThumbnail: true },
        true
      );
    });

    const [, options] = mocks.html2canvas.mock.calls[0];
    const separator = pages.querySelector(".ProseMirror-separator");
    expect(options.ignoreElements(separator)).toBe(true);
    expect(options.ignoreElements(pages.querySelector(".tiptap-main-canvas"))).toBe(false);
  });

  it("does not capture a thumbnail for a background content save", async () => {
    await renderDocumentProvider();
    await primeDocumentState();

    let saveResult;
    await act(async () => {
      saveResult = await latestContext.saveDocument(
        "doc-1",
        { content: "<p>autosaved</p>" },
        true
      );
    });

    expect(saveResult).toBe(true);
    expect(mocks.html2canvas).not.toHaveBeenCalled();
    expect(mocks.updateData.mock.calls[0][2]).not.toHaveProperty("thumbnail");
  });

  it("still saves document content when thumbnail capture fails", async () => {
    const pages = document.createElement("div");
    pages.id = "pages";
    document.body.appendChild(pages);
    mocks.html2canvas.mockRejectedValueOnce(new Error("capture failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await renderDocumentProvider();
      await primeDocumentState();

      let saveResult;
      await act(async () => {
        saveResult = await latestContext.saveDocument(
          "doc-1",
          { content: "<p>new</p>", refreshThumbnail: true },
          true
        );
      });

      expect(saveResult).toBe(true);
      expect(mocks.updateData.mock.calls[0][2]).not.toHaveProperty("thumbnail");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("sends content and the exact base revision through the local adapter only", async () => {
    await renderDocumentProvider();
    await primeDocumentState();

    let saveResult;
    await act(async () => {
      saveResult = await latestContext.saveDocument(
        "doc-1",
        { content: "<p>new</p>" },
        true
      );
    });

    expect(saveResult).toBe(true);
    expect(mocks.updateData).toHaveBeenCalledWith(
      "documents",
      "doc-1",
      expect.objectContaining({
        content: "<p>new</p>",
        expectedRevision: "revision-1"
      })
    );
    expect(latestContext.document.revision).toBe("revision-2");
    expect(latestContext.document.content).toBe("<p>new</p>");
  });

  it("saves through the local adapter without an authenticated user", async () => {
    await renderDocumentProvider();
    await primeDocumentState();


    let saveResult;
    await act(async () => {
      saveResult = await latestContext.saveDocument(
        "doc-1",
        { content: "<p>new</p>" },
        true
      );
    });

    expect(saveResult).toBe(true);
    expect(mocks.updateData).toHaveBeenCalledWith("documents", "doc-1", expect.objectContaining({ content: "<p>new</p>", expectedRevision: "revision-1" }));
    expect(latestContext.document.revision).toBe("revision-2");
  });

  

  

  

  it("persists sourceFileName through the document save queue and local cache", async () => {
    await renderDocumentProvider();
    await primeDocumentState();

    let saveResult;
    await act(async () => {
      saveResult = await latestContext.saveDocument(
        "doc-1",
        { sourceFileName: "real-simple-list.docx" },
        true
      );
    });

    expect(saveResult).toBe(true);
    expect(mocks.updateData).toHaveBeenCalledWith(
      "documents",
      "doc-1",
      expect.objectContaining({
        sourceFileName: "real-simple-list.docx"
      })
    );
    expect(latestContext.document.sourceFileName).toBe("real-simple-list.docx");
  });

  it("keeps the base revision stable when an API save fails and retries safely", async () => {
    const updateError = new Error("network failed");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      await renderDocumentProvider();
      await primeDocumentState();

      mocks.updateData.mockRejectedValueOnce(updateError);

      let failedSaveResult;
      await act(async () => {
        failedSaveResult = await latestContext.saveDocument(
          "doc-1",
          { content: "<p>new</p>" },
          true
        );
      });

      expect(failedSaveResult).toBe(false);
      expect(mocks.updateData).toHaveBeenCalledTimes(1);
      expect(mocks.updateData.mock.calls[0][2]).toMatchObject({
        content: "<p>new</p>",
        expectedRevision: "revision-1"
      });
      expect(latestContext.document.revision).toBe("revision-1");

      mocks.updateData.mockClear();

      let retrySaveResult;
      await act(async () => {
        retrySaveResult = await latestContext.saveDocument(
          "doc-1",
          { content: "<p>new</p>" },
          true
        );
      });

      expect(retrySaveResult).toBe(true);
      expect(mocks.updateData).toHaveBeenCalledWith(
        "documents",
        "doc-1",
        expect.objectContaining({
          content: "<p>new</p>",
          expectedRevision: "revision-1"
        })
      );
      expect(latestContext.document.revision).toBe("revision-2");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("exposes a revision conflict without advancing the local CAS base", async () => {
    const onRevisionConflict = vi.fn();
    const conflict = Object.assign(new Error("stale revision"), {
      code: "RevisionConflict",
      status: 409,
      detail: {
        code: "RevisionConflict",
        currentRevision: "revision-9"
      }
    });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      await renderDocumentProvider();
      await primeDocumentState();
      mocks.updateData.mockRejectedValueOnce(conflict);

      let saveResult;
      await act(async () => {
        saveResult = await latestContext.saveDocument(
          "doc-1",
          { content: "<p>stale</p>", onRevisionConflict },
          true
        );
      });

      expect(saveResult).toBe(false);
      expect(latestContext.document.revision).toBe("revision-1");
      expect(latestContext.lastSaveConflict).toMatchObject({
        documentId: "doc-1",
        expectedRevision: "revision-1",
        currentRevision: "revision-9"
      });
      expect(latestContext.getLastSaveConflict("doc-1")).toMatchObject({
        currentRevision: "revision-9"
      });
      expect(latestContext.getLastSaveConflict("other-doc")).toBeNull();
      expect(onRevisionConflict).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: "doc-1",
          currentRevision: "revision-9"
        }),
        { content: "<p>stale</p>" }
      );
      expect(mocks.updateData.mock.calls[0][2]).not.toHaveProperty(
        "onRevisionConflict"
      );

      await act(async () => {
        await latestContext.saveDocument(
          "doc-1",
          { content: "<p>retry</p>" },
          true
        );
      });
      expect(latestContext.lastSaveConflict).toBeNull();
      expect(latestContext.getLastSaveConflict("doc-1")).toBeNull();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("chains the saved revision across queued saves", async () => {
    await renderDocumentProvider();
    await primeDocumentState();

    await act(async () => {
      expect(
        await latestContext.saveDocument(
          "doc-1",
          { content: "<p>first</p>" },
          true
        )
      ).toBe(true);
      expect(
        await latestContext.saveDocument(
          "doc-1",
          { content: "<p>second</p>" },
          true
        )
      ).toBe(true);
    });

    expect(mocks.updateData.mock.calls[0][2].expectedRevision).toBe(
      "revision-1"
    );
    expect(mocks.updateData.mock.calls[1][2].expectedRevision).toBe(
      "revision-2"
    );
    expect(latestContext.document).toMatchObject({
      content: "<p>second</p>",
      revision: "revision-3"
    });
  });
});
