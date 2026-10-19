/* @vitest-environment jsdom */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const readApplicationSources = (directory) =>
  readdirSync(resolve(process.cwd(), directory), {
    recursive: true,
    withFileTypes: true
  })
    .filter(
      (entry) =>
        entry.isFile() && /\.(?:js|jsx|ts|tsx)$/.test(entry.name)
    )
    .map((entry) =>
      readFileSync(resolve(entry.parentPath, entry.name), "utf8")
    )
    .join("\n");

describe("document editor focus and persistence regressions", () => {
  it("preserves the Tiptap title editor and never autofocuses the body", () => {
    const titleEditor = readSource(
      "app/LIB/components/write/TitleEditor.js"
    );
    const contentEditor = readSource(
      "app/LIB/components/write/ContentEditor.js"
    );
    const writePage = readSource("app/docs/[id]/page.js");

    expect(titleEditor).toMatch(/@tiptap\/react/);
    expect(titleEditor).toMatch(/useEditor/);
    expect(titleEditor).toMatch(/EditorContent/);
    expect(contentEditor).toContain("autofocus: false");
    expect(contentEditor).not.toMatch(/autofocus:\s*focus/);
    expect(writePage).not.toMatch(/<ContentEditor[\s\S]*?\sfocus=/);
  });

  it("does not let closed color pickers focus the body editor", () => {
    const writeHeader = readSource(
      "app/LIB/components/clientLayout/header/WriteHeader.js"
    );

    expect(writeHeader).toMatch(
      /handleInlineTagColorChange[\s\S]*?if \(!inlineTagColorPickerOpen\) return;[\s\S]*?editor\?\.chain\(\)\?\.focus\(\)/
    );
    expect(writeHeader).toMatch(
      /open=\{fontColorPickerOpen\}[\s\S]*?onChange=\{\(color\) => \{\s*if \(!fontColorPickerOpen\) return;[\s\S]*?editor\?\.chain\(\)\?\.focus\(\)/
    );
    expect(writeHeader).toMatch(
      /open=\{fontBackgroundColorPickerOpen\}[\s\S]*?onChange=\{\(color\) => \{\s*if \(!fontBackgroundColorPickerOpen\) return;[\s\S]*?editor\?\.chain\(\)\?\.focus\(\)/
    );
  });

  it("uses the sud-ui danger toast contract throughout application code", () => {
    const applicationSources = readApplicationSources("app");

    expect(applicationSources).not.toMatch(/toast\.error\s*\(/);
    expect(applicationSources).toMatch(/toast\.danger\s*\(/);
  });

  it("has no local draft storage, recovery modal, or editor capture wiring", () => {
    const contentEditor = readSource(
      "app/LIB/components/write/ContentEditor.js"
    );
    const writePage = readSource("app/docs/[id]/page.js");

    expect(
      existsSync(resolve(process.cwd(), "app/LIB/utils/localDraftJournal.js"))
    ).toBe(false);
    expect(
      existsSync(
        resolve(process.cwd(), "app/LIB/hook/useEditorDraftLifecycle.js")
      )
    ).toBe(false);
    expect(writePage).not.toMatch(/localDraft|로컬 초안|onDraftCapture|draftCaptureEnabled/i);
    expect(contentEditor).not.toMatch(
      /useEditorDraftLifecycle|onDraftCapture|draftCaptureEnabled/
    );
  });
});
