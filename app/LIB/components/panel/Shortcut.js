import { t as uiText, useI18n } from "../../i18n";
import { Div, Divider, Tag, Typography } from "sud-ui";
import { shortcuts } from "../../constant/shortcut";
import WidgetCard from "./WidgetCard";
import { MdKeyboardCommandKey } from "react-icons/md";
import { useSetting } from "../../context/SettingContext";
import {
  TbHexagonNumber1Filled,
  TbHexagonNumber2Filled,
  TbHexagonNumber3Filled,
  TbHexagonNumber4Filled,
  TbHexagonNumber5Filled,
  TbHexagonNumber6Filled,
  TbHexagonNumber7Filled,
  TbHexagonNumber8Filled,
  TbHexagonNumber9Filled
} from "react-icons/tb";

export default function Shortcut({ dragHandleProps }) {
  useI18n();
  const { setting } = useSetting();
  const numberList = [
    <TbHexagonNumber1Filled key={1} size={20} />,
    <TbHexagonNumber2Filled key={2} size={20} />,
    <TbHexagonNumber3Filled key={3} size={20} />,

    <TbHexagonNumber4Filled key={4} size={20} />,
    <TbHexagonNumber5Filled key={5} size={20} />,
    <TbHexagonNumber6Filled key={6} size={20} />,
    <TbHexagonNumber7Filled key={7} size={20} />,

    <TbHexagonNumber8Filled key={8} size={20} />,
    <TbHexagonNumber9Filled key={9} size={20} />
  ];

  return (
    <WidgetCard
      icon={MdKeyboardCommandKey}
      title={uiText("단축키")}
      dragHandleProps={dragHandleProps}
      widgetType="shortcut"
    >
      <div className="w-full flex flex-col gap-2 max-h-[350px] overflow-y-auto">
        {shortcuts.map((s, index) => (
          <Div
            key={s.title}
            shadow="none"
            className="flex flex-col gap-2 rounded-xl p-2.5"
            width="100%"
            background={`${setting.theme}-1`}
          >
            {/* 제목 */}

            <Divider
              content={
                <Typography pretendard="SB" style={{ textAlign: "center" }}>
                  {s.title}
                </Typography>
              }
              style={{ margin: 0 }}
              borderColor={`${setting.theme}-3`}
            />

            {/* 단축키 */}
            <div className="flex flex-col gap-2">
              {s.shortcuts.map((shortcut, index) => (
                <div key={shortcut.name} className="flex justify-between">
                  <Typography as="div" className="flex items-center gap-1">
                    <Div color={`${setting.theme}-7`}>
                      {numberList[index] && numberList[index]}
                    </Div>
                    {shortcut.name}
                  </Typography>
                  <Tag
                    className="flex items-center"
                    background={`${setting.theme}-2`}
                  >
                    {shortcut.shortcut.map((s, index) => (
                      <Typography size="sm" key={s}>
                        {s} {index < shortcut.shortcut.length - 1 && "+ "}
                      </Typography>
                    ))}
                  </Tag>
                </div>
              ))}
            </div>
          </Div>
        ))}
      </div>
    </WidgetCard>
  );
}
