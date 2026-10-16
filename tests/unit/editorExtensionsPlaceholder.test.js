import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sharedExtensionsPath = fileURLToPath(
  new URL("../../app/LIB/constant/editorExtensions.js", import.meta.url)
);
const contentEditorPath = fileURLToPath(
  new URL("../../app/LIB/components/write/ContentEditor.js", import.meta.url)
);

describe("editor empty-document guidance", () => {
  it("scopes the first-writing cue to the main document editor", () => {
    const sharedExtensionsSource = readFileSync(sharedExtensionsPath, "utf8");
    const contentEditorSource = readFileSync(contentEditorPath, "utf8");

    expect(contentEditorSource).toContain(
      'placeholder: "첫 문장을 입력해 문서를 시작하세요."'
    );
    expect(contentEditorSource).toContain("documentPlaceholderExtension");
    expect(contentEditorSource).toMatch(
      /\.\.\.editorExtensions,\r?\n\s+documentPlaceholderExtension/
    );
    expect(sharedExtensionsSource).not.toContain(
      "@tiptap/extension-placeholder"
    );
    expect(sharedExtensionsSource).not.toContain(
      "첫 문장을 입력해 문서를 시작하세요."
    );
  });
});
