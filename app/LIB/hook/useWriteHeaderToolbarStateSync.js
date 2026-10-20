import { useEffect } from "react";
import { isCaptionInsertionEnabled } from "@/app/LIB/utils/captionUtils";

export default function useWriteHeaderToolbarStateSync(
  editor,
  setCurrentFontSize,
  setFont,
  setInlineTagColor,
  setCaptionButtonEnabled
) {
  useEffect(() => {
    if (!editor) return;
    // 툴바 상태(폰트 크기, 글꼴) 한번에 업데이트
    const updateToolbarState = () => {
      // 1. 현재 커서의 textStyle 속성을 한번에 가져옵니다.
      const attrs = editor.getAttributes("textStyle");

      // 2. 폰트 크기 상태를 업데이트합니다.
      const fontSize = attrs?.fontSize;
      if (fontSize) {
        setCurrentFontSize(parseInt(fontSize, 10));
      } else {
        const paraAttrs = editor.getAttributes("paragraph");
        setCurrentFontSize(
          paraAttrs?.fontSize ? parseInt(paraAttrs.fontSize, 10) : 12
        );
      }

      // 3. 폰트 패밀리(글꼴) 상태를 업데이트합니다.
      const diagram = editor.state.selection.node;
      const fontFamily = diagram?.type.name === "diagramBlock"
        ? diagram.attrs.fontFamily || "sans-serif"
        : attrs?.fontFamily;
      if (fontFamily) {
        setFont(fontFamily);
      } else {
        setFont("PretendardMedium"); // 기본값
      }

      const inlineTagAttrs = editor.getAttributes("inlineTag");

      if (inlineTagAttrs?.color) {
        setInlineTagColor(inlineTagAttrs.color);
      }

      setCaptionButtonEnabled(isCaptionInsertionEnabled(editor));
    };

    // 4. 에디터의 내용이나 선택 영역이 변경될 때마다 툴바 상태를 업데이트합니다.
    editor.on("transaction", updateToolbarState);
    editor.on("selectionUpdate", updateToolbarState);

    // 5. 컴포넌트가 처음 로드될 때 초기 상태를 설정합니다.
    updateToolbarState();

    // 6. 컴포넌트가 사라질 때 이벤트 리스너를 정리합니다.
    return () => {
      editor.off("transaction", updateToolbarState);
      editor.off("selectionUpdate", updateToolbarState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]); // 의존성 배열은 그대로 [editor] 입니다.
}
