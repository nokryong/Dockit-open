/* @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ReferencePreviewSurface from "../../app/LIB/components/panel/referenceDoc/ReferencePreviewSurface";
import { useDocument } from "../../app/LIB/context/DocumentContext";

vi.mock("../../app/LIB/context/EditorContext", () => ({ EditorProvider: ({ children }) => children }));
vi.mock("../../app/LIB/components/write/ContentEditor", () => ({
  default: function PreviewEditor({ value, editable }) {
    const { title, content } = useDocument();
    return React.createElement("div", { "data-testid": "preview", "data-editable": String(editable) }, title, value, content);
  }
}));
afterEach(cleanup);

it("switches local reference documents without account or sharing state", () => {
  const previewDocument = { _id: "local-1", title: "첫 문서", content: "로컬 내용", docSetting: { pageWidth: 210, pageHeight: 297 } };
  const { rerender } = render(React.createElement(ReferencePreviewSurface, { previewDocument }));
  expect(screen.getByTestId("preview").textContent).toContain("첫 문서로컬 내용");
  expect(screen.getByTestId("preview").getAttribute("data-editable")).toBe("false");
  rerender(React.createElement(ReferencePreviewSurface, { previewDocument: { ...previewDocument, _id: "local-2", title: "두 번째 문서", content: "다른 내용" } }));
  expect(screen.getByTestId("preview").textContent).toContain("두 번째 문서다른 내용");
  expect(screen.getByTestId("preview").textContent).not.toContain("로컬 내용");
  rerender(React.createElement(ReferencePreviewSurface, { previewDocument: null }));
  expect(screen.queryByTestId("preview")).toBeNull();
});
