import { describe, expect, it } from "vitest";
import {
  getSavedDiagramPreview,
  hasDiagramElements,
  parseDiagramScene,
  withDiagramChanges,
  withDiagramPreview
} from "../../app/LIB/extensions/utils/diagramSceneUtils";
import {
  closeDiagramEditor,
  getDiagramEditorSession,
  openDiagramEditor
} from "../../app/LIB/extensions/utils/diagramEditorSession";

const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20"/></svg>';
const scene = {
  elements: [{ id: "box", type: "rectangle", x: 5, version: 1 }],
  appState: { viewBackgroundColor: "#fff", customState: "preserved" },
  files: { image: { dataURL: "data:image/png;base64,AA==" } },
  customMetadata: { label: "original" }
};

describe("diagram scene persistence", () => {
  it("preserves the original scene and its files while adding a reusable SVG", () => {
    const cached = withDiagramPreview(scene, svg);
    const reopened = parseDiagramScene(JSON.stringify(cached));
    expect(reopened.elements).toEqual(scene.elements);
    expect(reopened.appState).toEqual(scene.appState);
    expect(reopened.files).toEqual(scene.files);
    expect(reopened.customMetadata).toEqual(scene.customMetadata);
    expect(getSavedDiagramPreview(reopened)).toBe(svg);
    expect(scene).not.toHaveProperty("dockitPreview");
  });

  it.each(["elements", "appState", "files"])("rejects a stale preview after %s changes", (field) => {
    const cached = withDiagramPreview(scene, svg);
    const changed = structuredClone(cached);
    if (field === "elements") changed.elements[0].x = 50;
    if (field === "appState") changed.appState.viewBackgroundColor = "#eee";
    if (field === "files") changed.files.image.dataURL = "data:image/png;base64,BB==";
    expect(getSavedDiagramPreview(changed)).toBe("");
  });

  it("keeps old metadata and invalidates the preview when an edit is applied", () => {
    const edited = withDiagramChanges(withDiagramPreview(scene, svg), [], {
      viewBackgroundColor: "#ccc",
      currentItemStrokeColor: "#123",
      currentItemBackgroundColor: "#456"
    }, scene.files);
    expect(edited.customMetadata).toEqual(scene.customMetadata);
    expect(edited.appState.customState).toBe("preserved");
    expect(edited.files).toEqual(scene.files);
    expect(edited).not.toHaveProperty("dockitPreview");
    expect(hasDiagramElements(edited)).toBe(false);
  });

  it("accepts legacy and empty scenes without overwriting malformed content", () => {
    expect(parseDiagramScene(JSON.stringify(scene))).toEqual(scene);
    expect(parseDiagramScene("{}")).toEqual({});
    for (const invalid of ["{broken", "null", "[]", '{"elements":{}}']) {
      expect(parseDiagramScene(invalid)).toBeNull();
    }
    expect(hasDiagramElements({ elements: [{ isDeleted: true }] })).toBe(false);
  });
});

it("keeps one active editor and ignores a stale owner's close", () => {
  const first = { owner: Symbol("first") };
  const second = { owner: Symbol("second") };
  openDiagramEditor(first);
  openDiagramEditor(second);
  closeDiagramEditor(first.owner);
  expect(getDiagramEditorSession()).toBe(second);
  closeDiagramEditor(second.owner);
  expect(getDiagramEditorSession()).toBeNull();
});
