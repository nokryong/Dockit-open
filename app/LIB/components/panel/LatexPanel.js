import { t as uiText, useI18n } from "../../i18n";
import { Input } from "sud-ui";
import WidgetCard from "./WidgetCard";
import { TbMath } from "react-icons/tb";
import { inputProps } from "../../constant/uiProps";
import { useEditor } from "../../context/EditorContext";
import { useState } from "react";
import { useSetting } from "../../context/SettingContext";

export default function LatexPanel({ dragHandleProps }) {
  useI18n();
  const { editor } = useEditor();
  const { setting } = useSetting();
  const [latex, setLatex] = useState("");

  const insertLatex = (latex) => {
    if (editor && latex) {
      editor.chain().insertInlineMath({ latex }).focus().run();
      setLatex(""); // 입력 후 필드 초기화
    }
  };

  return (
    <WidgetCard
      icon={TbMath}
      title="LATEX"
      dragHandleProps={dragHandleProps}
      widgetType="latex"
    >
      <div className="w-full flex flex-col gap-2">
        <Input
          {...inputProps}
          onEnter={() => insertLatex(latex)}
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          placeholder={uiText("LATEX 수식 입력 후 Enter")}
          background={`${setting.theme}-1`}
        />
      </div>
    </WidgetCard>
  );
}
