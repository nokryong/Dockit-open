import { t as uiText, useI18n, translateMessage } from "../../i18n";
import { Button, Divider, Input, Typography } from "sud-ui";
import WidgetCard from "./WidgetCard";
import { MdAdd } from "react-icons/md";
import { useEditor } from "@/app/LIB/context/EditorContext";
import { useChar } from "@/app/LIB/context/CharContext";
import {
  inputProps,
  newShadowDarkSm,
  newShadowLightSm
} from "../../constant/uiProps";
import { useState } from "react";
import { SettingOutline } from "sud-icons";
import { TbMathSymbols } from "react-icons/tb";
import { useDarkMode } from "../../context/DarkModeContext";
import { useSetting } from "../../context/SettingContext";

export default function SpecialChar({ dragHandleProps }) {
  useI18n();
  const { editor } = useEditor();
  const { setting } = useSetting();
  const { char, setChar, charLoading, error } = useChar();
  const { isDarkMode } = useDarkMode();
  const [newChar, setNewChar] = useState("");
  const [isSettingMode, setIsSettingMode] = useState(false);

  const insertSpecialChar = (char) => {
    if (editor) {
      editor.chain().focus().insertContent(char).run();
    }
  };

  const addNewChar = () => {
    if ([...newChar].length === 1) {
      // 이미 존재하는 특수문자인지 확인
      if (char.char.some((item) => item.key === newChar)) {
        return;
      }
      setChar({
        ...char,
        char: [...char.char, { key: newChar, char: newChar }]
      });
      setNewChar("");
    }
  };

  const deleteChar = (charKey) => {
    setChar({
      ...char,
      char: char.char.filter((item) => item.key !== charKey)
    });
  };

  return (
    <WidgetCard
      icon={TbMathSymbols}
      title={uiText("특수문자 즐겨찾기")}
      dragHandleProps={dragHandleProps}
      widgetType="specialChar"
      titleBtn={
        <Button
          ariaLabel={uiText("특수문자 즐겨찾기 편집")}
          icon={<SettingOutline size={14} />}
          shadow="none"
          border={false}
          onClick={() => setIsSettingMode(!isSettingMode)}
        />
      }
    >
      <div className="w-full flex flex-col gap-2">
        {error && <p role="alert">{uiText("즐겨찾기를 저장하지 못했습니다: ")}{translateMessage(error.message)}</p>}
        <div className="grid grid-cols-7 gap-2">
          {!charLoading &&
            char?.char?.length > 0 &&
            char.char.map(({ key, char }) => (
              <div key={key} className="flex  justify-center items-center w-full relative">
                <Button
                  size="sm"
                  onClick={() =>
                    isSettingMode ? deleteChar(char) : insertSpecialChar(char)
                  }
                  shadow="none"
                  ariaLabel={uiText("특수문자 {0} 삽입", char)}
                  role="button"
                  tabIndex={0}
                  border={false}
                  style={{
                    width: "100%",
                    ...(isDarkMode ? newShadowDarkSm : newShadowLightSm).style
                  }}
                  background={isSettingMode ? "neutral-3" : `white-10`}
                >
                  {char}
                </Button>
              </div>
            ))}
        </div>
        {isSettingMode && (
          <Typography size="sm" color="volcano" pretendard="B">
            {uiText("※ 버튼을 클릭하면 특수문자를 삭제할 수 있습니다.")}</Typography>
        )}
        {isSettingMode && <Divider style={{ margin: 0 }} />}
        {isSettingMode && (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "1fr 40px" }}
          >
            <Input
              {...inputProps}
              value={newChar}
              background={`${setting.theme}-1`}
              placeholder={uiText("문자를 한 글자 입력하세요")}
              onChange={(e) => setNewChar(e.target.value)}
              length={1}
              minLength={1}
            />
            <Button
              size="sm"
              onClick={addNewChar}
              shadow="none"
              ariaLabel={uiText("특수문자 추가")}
              role="button"
              disabled={[...newChar].length !== 1}
              background={`white-10`}
              color={`white-1`}
              border={false}
              style={{
                ...(isDarkMode ? newShadowDarkSm : newShadowLightSm).style
              }}
            >
              <MdAdd />
            </Button>
          </div>
        )}
      </div>
    </WidgetCard>
  );
}
