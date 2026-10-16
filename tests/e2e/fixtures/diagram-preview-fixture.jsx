import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { EditorContent, useEditor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import DiagramBlock from "../../../app/LIB/extensions/DiagramBlock";
import { withDiagramPreview } from "../../../app/LIB/extensions/utils/diagramSceneUtils";
import "../../../app/LIB/css/print-mode.css";

const storageKey = "dockit-diagram-preview-fixture";
const query = new URLSearchParams(location.search);
window.EXCALIDRAW_ASSET_PATH = "/node_modules/@excalidraw/excalidraw/dist/prod/";
const readOnly = query.has("readonly");
const rect = {
  id: "original-box", type: "rectangle", x: 30, y: 30, width: 160, height: 80,
  angle: 0, strokeColor: "#1b1b1f", backgroundColor: "#d0ebff", fillStyle: "solid",
  strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [],
  frameId: null, index: "a0", roundness: null, seed: 123, version: 1,
  versionNonce: 1, isDeleted: false, boundElements: null, updated: 1,
  link: null, locked: false
};
const sourceScene = {
  elements: [rect, {
    ...rect, id: "original-label", type: "text", index: "a1", x: 45, y: 55,
    width: 130, height: 25, backgroundColor: "transparent", fontSize: 20,
    fontFamily: 2, text: "자료 확인", originalText: "자료 확인", autoResize: true,
    textAlign: "center", verticalAlign: "middle", containerId: null, lineHeight: 1.25
  }], appState: { viewBackgroundColor: "#ffffff" }, files: {},
  originalMetadata: { preserved: true }
};
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="112" viewBox="0 0 192 112"><rect x="16" y="16" width="160" height="80" fill="#d0ebff" stroke="#1b1b1f" stroke-width="2"/><text x="96" y="64" text-anchor="middle" font-size="20">자료 확인</text></svg>';
const initialContent = () => ({
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "다이어그램 앞 문단" }] },
    ...Array.from({ length: 3 }, (_, index) => ({
      type: "diagramBlock",
      attrs: {
        sceneData: JSON.stringify(query.has("legacy") ? sourceScene : withDiagramPreview(sourceScene, svg)),
        objectId: `diagram-${index}`, width: 100, height: 260, textAlign: "center"
      }
    })),
    { type: "paragraph", content: [{ type: "text", text: "다이어그램 뒤 문단" }] }
  ]
});

function Fixture() {
  const editor = useEditor({
    extensions: [Document, Paragraph, Text, UndoRedo, DiagramBlock],
    content: localStorage.getItem(storageKey) || initialContent(),
    editable: !readOnly,
    onUpdate: ({ editor: current }) => {
      if (!readOnly) localStorage.setItem(storageKey, current.getHTML());
    }
  });
  useEffect(() => {
    if (!editor) return;
    window.__diagramFixture = {
      snapshot: () => ({ json: editor.getJSON(), html: editor.getHTML() }),
      scene: (index = 0) => JSON.parse(editor.getJSON().content.filter((node) => node.type === "diagramBlock")[index].attrs.sceneData),
      updateScene: (index, scene) => {
        let found = 0;
        editor.state.doc.descendants((node, position) => {
          if (node.type.name !== "diagramBlock") return;
          if (found++ === index) editor.commands.updateDiagramBlock(position, { sceneData: JSON.stringify(scene) });
        });
      },
      undo: () => editor.commands.undo(),
      redo: () => editor.commands.redo(),
      removeDiagrams: () => editor.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] })
    };
    document.body.dataset.fixtureStatus = "ready";
    return () => { delete window.__diagramFixture; };
  }, [editor]);
  return <div className={`tiptap-container${readOnly ? " is-readonly" : ""}`}><EditorContent editor={editor} /></div>;
}

createRoot(document.getElementById("root")).render(<Fixture />);
