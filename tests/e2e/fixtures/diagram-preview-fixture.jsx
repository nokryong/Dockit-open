import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { EditorContent, useEditor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import DiagramBlock from "../../../app/LIB/extensions/DiagramBlock";
import "../../../app/LIB/css/print-mode.css";

const storageKey = "dockit-diagram-preview-fixture";
const readOnly = new URLSearchParams(location.search).has("readonly");
const code = "flowchart LR\n  A[자료 확인] --> B[완료]";
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100"><rect x="10" y="10" width="280" height="80" fill="#eee" stroke="#222"/><text x="150" y="58" text-anchor="middle" font-size="20">자료 확인 → 완료</text></svg>';
const initialContent = () => ({
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "다이어그램 앞 문단" }] },
    ...Array.from({ length: 3 }, (_, index) => ({
      type: "diagramBlock",
      attrs: { code, previewCode: code, previewSvg: svg, objectId: "diagram-" + index, width: 100, height: 260, textAlign: "center" },
    })),
    { type: "paragraph", content: [{ type: "text", text: "다이어그램 뒤 문단" }] },
  ],
});

function Fixture() {
  const editor = useEditor({
    extensions: [Document, Paragraph, Text, UndoRedo, DiagramBlock],
    content: localStorage.getItem(storageKey) || initialContent(),
    editable: !readOnly,
    onUpdate: ({ editor: current }) => {
      if (!readOnly) localStorage.setItem(storageKey, current.getHTML());
    },
  });
  useEffect(() => {
    if (!editor) return;
    window.__diagramFixture = {
      snapshot: () => ({ json: editor.getJSON(), html: editor.getHTML() }),
      attrs: (index = 0) => editor.getJSON().content.filter((node) => node.type === "diagramBlock")[index].attrs,
      updateCode: (index, nextCode) => {
        let found = 0;
        editor.state.doc.descendants((node, position) => {
          if (node.type.name === "diagramBlock" && found++ === index)
            editor.commands.updateDiagramBlock(position, { code: nextCode, previewSvg: "", previewCode: "" });
        });
      },
      selection: () => ({ type: editor.state.selection.constructor.name, from: editor.state.selection.from }),
      setFont: font => editor.commands.setDiagramFontFamily(font),
      undo: () => editor.commands.undo(),
      redo: () => editor.commands.redo(),
      removeDiagrams: () => editor.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] }),
    };
    document.body.dataset.fixtureStatus = "ready";
    return () => { delete window.__diagramFixture; };
  }, [editor]);
  return <div className={"tiptap-container" + (readOnly ? " is-readonly" : "")}><EditorContent editor={editor} /></div>;
}

createRoot(document.getElementById("root")).render(<Fixture />);
