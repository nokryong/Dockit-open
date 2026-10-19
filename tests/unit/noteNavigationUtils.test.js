import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const resolve = (relativePath) => path.join(root, relativePath);
const read = (relativePath) =>
  fs.readFileSync(resolve(relativePath), "utf8").replace(/\r\n/g, "\n");

describe("U4 legacy note navigation removal", () => {
  it("deletes the manual panel and its navigation utility", () => {
    expect(fs.existsSync(resolve(
      "app/LIB/components/write/NoteManualEditorPanel.js"
    ))).toBe(false);
    expect(fs.existsSync(resolve(
      "app/LIB/utils/noteNavigationUtils.js"
    ))).toBe(false);
  });

  it("removes panel state, activation events, and manual-panel CSS from production", () => {
    const contentEditor = read(
      "app/LIB/components/write/ContentEditor.js"
    );
    const editorContext = read("app/LIB/context/EditorContext.js");
    const css = read("app/LIB/css/tiptap.css");

    expect(contentEditor).not.toMatch(
      /NoteManualEditorPanel|notePanelRequest|activeNoteId|dockit-note-activate/
    );
    expect(editorContext).not.toMatch(/notePanelRequest|setNotePanelRequest/);
    expect(css).not.toContain("dockit-note-manual-panel");
  });

  it("keeps marker navigation selector-safe and body-scoped", () => {
    const reference = read("app/LIB/extensions/NoteReference.js");

    expect(reference).toContain("querySelectorAll(NOTE_BODY_SELECTOR)");
    expect(reference).toContain(
      'element.getAttribute("data-dockit-note-id") === noteId'
    );
    expect(reference).not.toMatch(/querySelector\(`[^`]*\$\{noteId\}/);
  });

  it("keeps the 420px marker hit area at the mobile accessibility minimum", () => {
    const css = read("app/LIB/css/tiptap.css");
    const mobileRule = css.match(
      /@media screen and \(max-width: 420px\) \{[\s\S]*?\.dockit-note-reference::after \{([\s\S]*?)\n  \}\n\}/
    )?.[1] || "";

    expect(mobileRule).toContain("width: 44px");
    expect(mobileRule).toContain("height: 44px");
    expect(mobileRule).toContain("position: absolute");
  });
});
