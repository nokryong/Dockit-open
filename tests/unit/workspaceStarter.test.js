/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sud-ui", () => ({
  Button: ({
    children,
    className,
    disabled,
    icon,
    loading,
    onClick,
    type,
    ...props
  }) =>
    h(
      "button",
      {
        type: type || "button",
        className,
        disabled,
        "aria-label": props["aria-label"],
        "data-loading": String(Boolean(loading)),
        onClick
      },
      icon,
      children
    ),
  Typography: ({ children, className }) => h("span", { className }, children),
  Upload: ({ children }) => h("div", { "data-testid": "upload" }, children)
}));

const roots = [];

const renderStarter = async (props = {}) => {
  const { default: WorkspaceStarter } = await import(
    "../../app/LIB/components/docs/WorkspaceStarter.js"
  );
  const container = document.createElement("div");
  const root = createRoot(container);
  document.body.appendChild(container);
  roots.push({ container, root });

  await act(async () => {
    root.render(
      h(WorkspaceStarter, {
        isFirstWorkspace: true,
        theme: "mint",
        uploadExtensions: ["dkt", "docx"],
        onCreateDocument: vi.fn(),
        onUploadFile: vi.fn(),
        ...props
      })
    );
  });

  return container;
};

const findButton = (container, label) =>
  Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent.trim() === label
  );

afterEach(() => {
  while (roots.length > 0) {
    const { container, root } = roots.pop();
    act(() => root.unmount());
    container.remove();
  }
});

describe("WorkspaceStarter", () => {
  it("starts a blank document and keeps file import without templates", async () => {
    const onCreateDocument = vi.fn();
    const container = await renderStarter({ onCreateDocument });
    expect(container.querySelector("h2").textContent).toContain("첫 문서를 시작해 보세요");
    expect(container.querySelector("[data-testid='upload']").textContent).toContain("파일 가져오기");
    expect(container.textContent).not.toMatch(/템플릿|AI 초안|리서치 노트/);
    await act(async () => findButton(container, "새 문서").click());
    expect(onCreateDocument).toHaveBeenCalledTimes(1);
  });

  it("uses folder-specific copy outside the root workspace", async () => {
    const container = await renderStarter({ isFirstWorkspace: false });

    expect(container.querySelector("h2").textContent).toContain(
      "이 폴더에서 새 작업을 시작해 보세요"
    );
  });
});
