/* @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ExternalLinkPreviewPopover from "../../app/LIB/components/write/ExternalLinkPreviewPopover";

vi.mock("sud-ui", () => ({
  Typography: ({ children }) => React.createElement("span", null, children),
  toast: { success: vi.fn(), danger: vi.fn() }
}));
vi.mock("../../app/LIB/context/DarkModeContext", () => ({
  useDarkMode: () => ({ isDarkMode: false, currentColors: { white: {}, black: {} } })
}));
vi.mock("../../app/LIB/constant/uiProps", () => ({ withOverlayShadow: () => ({}) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("shows and copies a link offline without requesting metadata", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { clipboard: { writeText } }));
  const preview = { href: "https://example.com/document", hostname: "example.com", left: 10, top: 20 };
  const { rerender } = render(React.createElement(ExternalLinkPreviewPopover, { preview }));
  expect(screen.getByRole("link").getAttribute("href")).toBe(preview.href);
  expect(document.querySelector("img")).toBeNull();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "링크 복사" })));
  expect(writeText).toHaveBeenCalledWith(preview.href);
  expect(screen.getByRole("button", { name: "복사됨" })).toBeTruthy();
  rerender(React.createElement(ExternalLinkPreviewPopover, { preview: { ...preview, href: "https://example.com/another" } }));
  expect(screen.getByRole("button", { name: "링크 복사" })).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});
