"use client";
import { t as uiText, useI18n } from "../../i18n";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

export default function TitleEditor({
  value,
  onChange,
  placeholder,
  className,
  truncateAt,
  editable = true,
  isInformation = false
}) {
  useI18n();
  const [isFocused, setIsFocused] = useState(false);
  const characters = Array.from(value || "");
  const showPreview = !isFocused && !isInformation && truncateAt > 0 && characters.length >= truncateAt;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 제목 필드에는 필요 없는 기능들을 비활성화하여 최적화
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false
      }),
      Placeholder.configure({
        placeholder: placeholder || uiText("제목을 입력하세요."),
        emptyEditorClass: "is-editor-empty"
      })
    ],
    content: value || "",
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        spellcheck: "false",
      },
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
    onUpdate: ({ editor }) => {
      if (!editable) return;
      try {
        if (isInformation) {
          onChange(editor.getHTML());
        } else {
          onChange(editor.getText());
        }
      } catch (error) {
        console.error("TitleEditor onUpdate error:", error);
      }
    }
  });

  useEffect(() => { if (editor && !editor.isDestroyed) editor.setEditable(editable, false); }, [editor, editable]);

  // 외부 값 ↔ 에디터 내용 동기화
  useEffect(() => {
    // 에디터의 현재 내용과 외부 value가 다를 때만 업데이트
    if (editor && !editor.isDestroyed && value !== editor.getText()) {
      // false를 추가하여 이 변경으로 인해 onUpdate가 다시 실행되는 것을 방지
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  // 언마운트 때 정리해 메모리 누수를 막을 수 있게 함
  useEffect(() => {
    return () => {
      if (editor) {
        editor.destroy();
      }
    };
  }, [editor]);

  return (
    <div className={className} style={{ position: "relative" }} title={showPreview ? value : undefined}>
      {showPreview && <span aria-hidden="true" className="block truncate">{characters.slice(0, truncateAt - 1).join("")}...</span>}
      <EditorContent
        editor={editor}
        style={showPreview ? { position: "absolute", inset: 0, opacity: 0 } : undefined}
      />
    </div>
  );
}
