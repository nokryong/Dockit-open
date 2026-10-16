import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const readSource = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("semantic editor UI wiring", () => {
  it("wires the shared document-structure editor into every selected object surface", () => {
    const objectEditor = readSource(
      "app/LIB/components/panel/ObjectEditor.js"
    );
    const objectContract = readSource(
      "app/LIB/utils/editorContractUtils.js"
    );

    expect(objectEditor).toContain("getObjectSemanticEditorTarget");
    expect(objectEditor).toContain("<SemanticAttributesEditor");
    expect(objectContract).toContain(
      'OBJECT_PANEL_IMMEDIATE_TYPES = ["chartBlock", "diagramBlock"]'
    );
  });

  it("keeps the same compact editor available for cursor and text-selection bubbles", () => {
    const typeBubble = readSource(
      "app/LIB/components/write/TypeBubble.js"
    );

    expect(typeBubble).toContain("getTextSemanticEditorTarget");
    expect(typeBubble).toContain('data-testid="semantic-structure-button"');
    expect(typeBubble).toContain("semanticPromptOverlay");
    expect(typeBubble).toContain("layoutMode === \"mobile\"");
    expect(typeBubble).toContain('maxHeight: "calc(100vh - 48px)"');
    expect(typeBubble).toContain('overflowY: "auto"');
    expect(typeBubble).toContain("onRequestClose={closeSemanticPanel}");
  });

  it("presents human-readable fields without exposing storage syntax", () => {
    const editorSource = readSource(
      "app/LIB/components/common/semantic/SemanticAttributesEditor.js"
    );

    expect(editorSource).toContain("고유 이름");
    expect(editorSource).toContain("역할");
    expect(editorSource).toContain("이름·역할 지우기");
    expect(editorSource).not.toContain("JSON.stringify");
    expect(editorSource).not.toContain("<textarea");
  });
});
