import { t as uiText, useI18n } from "../../i18n";
import WidgetCard from "./WidgetCard";
import { Typography } from "sud-ui";
import { useDocMemo } from "../../context/MemoContext";
import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import TypeBubble from "../write/TypeBubble";
import { TbNote } from "react-icons/tb";
import { editorExtensions } from "../../constant/editorExtensions";

export default function Memo({ dragHandleProps }) {
  useI18n();
  const [mounted, setMounted] = useState(false);
  const { memo, setMemo, memoLoading, error } = useDocMemo();

  // SSR 환경에서 클라이언트에서만 렌더링하기 위한 트릭
  useEffect(() => setMounted(true), []);

  // Tiptap 에디터 설정
  const editor = useEditor({
    extensions: editorExtensions,
    content: memo?.memo || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        spellcheck: "false",
      },
    },
    onUpdate: ({ editor }) => {
      const currentHtml = editor.getHTML();
      // MemoContext의 setMemo로 상태 업데이트 (자동저장 포함)
      setMemo({ memo: currentHtml });
    }
  });

  // MemoContext에서 memo가 변경되었을 때 에디터에 반영
  useEffect(() => {
    if (editor && memo?.memo && memo.memo !== editor.getHTML()) {
      editor.commands.setContent(memo.memo);
    }
  }, [memo?.memo, editor]);

  // 에디터 인스턴스 파괴 로직
  useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed) {
        editor.destroy();
      }
    };
  }, [editor]);

  if (!mounted || memoLoading) {
    return (
      <WidgetCard
        icon={TbNote}
        title={uiText("메모")}
        dragHandleProps={dragHandleProps}
        widgetType="memo"
      >
        <div className="w-full flex flex-col gap-2">
          <Typography color={"cool-gray-7"} size="sm">{uiText("로딩 중...")}</Typography>
        </div>
      </WidgetCard>
    );
  }

  // JSX 렌더링
  return (
    <WidgetCard
      icon={TbNote}
      title={uiText("메모")}
      dragHandleProps={dragHandleProps}
      widgetType="memo"
    >
      <div className="w-full flex flex-col gap-2  max-h-[350px] overflow-y-auto">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
            <Typography color="red-7" size="sm">
              {uiText("메모 저장 상태를 확인하지 못했습니다. 로컬 편집 내용은 유지됩니다.")}</Typography>
          </div>
        )}
        <div style={{ flex: 1 }} className="tiptap-container">
          {editor && <TypeBubble editor={editor} />}
          <div>
            <EditorContent editor={editor} className="tiptap" />
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}
