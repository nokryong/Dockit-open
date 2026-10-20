import { t as uiText, useI18n, translateMessage } from "../../../i18n";
import { Button, Card, Divider, Tooltip, Typography } from "sud-ui";
import { useState, useEffect } from "react";
import { MdStyle } from "react-icons/md";
import { TbFolder } from "react-icons/tb";
import Template from "./DrawerTemplate";
import { themeOptions } from "@/app/LIB/constant/themeOptions";
import { useSetting } from "@/app/LIB/context/SettingContext";
import { useDarkMode } from "@/app/LIB/context/DarkModeContext";
import {
  newShadowDarkSm,
  newShadowLightSm,
  withOverlayShadow,
} from "@/app/LIB/constant/uiProps";
import { flushLocalData, localBridge } from "@/app/LIB/utils/localBridge";
import ChatGPTConnection from "./settings/ChatGPTConnection";
import CodexConnection from "./settings/CodexConnection";
import { SmallButton, TitleComponent } from "./settings/CommonComponents";
import { version } from "../../../../../package.json";

export default function SettingsDrawer({
  openSettingsDrawer,
  setOpenSettingsDrawer,
}) {
  useI18n();
  const { setting, setSetting, saveSetting, error: saveError } = useSetting();
  const { isDarkMode, currentColors } = useDarkMode();
  const [paths, setPaths] = useState(null);
  const [error, setError] = useState("");
  const [appVersion, setAppVersion] = useState(version);
  useEffect(() => {
    const updates = window.dockitLocal?.updates;
    if (!updates) return;
    let active = true;
    updates.status().then(({ currentVersion }) => {
      if (active && currentVersion) setAppVersion(currentVersion);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (openSettingsDrawer)
      localBridge()
        .paths()
        .then(setPaths)
        .catch((failure) => setError(failure.message));
  }, [openSettingsDrawer]);
  const chooseFolder = async () => {
    try {
      await flushLocalData();
      const selected = await localBridge().chooseDocuments();
      if (selected) {
        window.location.hash = "/docs";
        window.location.reload();
      }
    } catch (failure) {
      setError(failure.message);
    }
  };

  return (
    <Template
      open={openSettingsDrawer}
      onClose={() => setOpenSettingsDrawer(false)}
      title={uiText("설정")}
      content={
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="interface-language" className="font-semibold">{uiText("언어 / Language")}</label>
            <select
              id="interface-language"
              value={setting.language || "system"}
              onChange={async (event) => {
                const language = event.target.value;
                try { await saveSetting({ language }); }
                catch (failure) { setError(failure.message); }
              }}
              className="w-full rounded-lg border border-current/20 bg-transparent px-3 py-2 text-sm"
            >
              <option value="system">{uiText("시스템 언어 사용")}</option>
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
          </div>
          <Divider style={{ margin: 0 }} />
          <ChatGPTConnection />
          <Divider style={{ margin: 0 }} />
          <CodexConnection />
          <Divider style={{ margin: 0 }} />
          {(error || saveError) && (
            <div role="alert">
              <Typography color="volcano">
                {translateMessage(error || saveError.message)}
              </Typography>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <TitleComponent icon={MdStyle}>{uiText("테마설정")}</TitleComponent>
            <div className="grid grid-cols-13 items-center gap-2">
              {themeOptions.map((option) => {
                const isActive = option.value === setting.theme;
                const optionHex = currentColors[option.value][7];

                return (
                  <Tooltip
                    key={option.value}
                    background={`${option.value}-7`}
                    border={false}
                    content={
                      <Typography size="xs" color={`${option.value}-1`}>
                        {option.label}
                      </Typography>
                    }
                    style={withOverlayShadow({}, isDarkMode)}
                  >
                    <Button
                      ariaLabel={uiText("테마 {0}", option.label)}
                      className="hover-scale-8"
                      background={`${option.value}-7`}
                      color={`${option.value}-1`}
                      borderColor={`${option.value}-7`}
                      key={option.value}
                      disabled={isActive}
                      onClick={() =>
                        setSetting((prev) => ({
                          ...prev,
                          theme: option.value,
                        }))
                      }
                      size="sm"
                      shape="circle"
                      style={{
                        width: "100%",
                        background: `linear-gradient(315deg, ${optionHex} 50%, ${currentColors.white[10]} 50%)`,
                        ...(isDarkMode ? newShadowDarkSm : newShadowLightSm)
                          .style,
                      }}
                    />
                  </Tooltip>
                );
              })}
            </div>
          </div>

          <Divider style={{ margin: 0 }} />
          <div className="flex flex-col gap-2">
            <TitleComponent icon={TbFolder}>{uiText("기본 폴더")}</TitleComponent>
            <div className="flex flex-col gap-2">
              <Typography pretendard="SB" size="sm">
                {uiText("문서 폴더")}</Typography>
              <Card
                width="100%"
                shadow="none"
                border={false}
                background={`${setting.theme}-1`}
              >
                <Typography size="sm" style={{ overflowWrap: "anywhere" }}>
                  {paths?.documentsPath}
                </Typography>
              </Card>
              <div className="flex justify-end">
                <SmallButton onClick={chooseFolder}>{uiText("문서 폴더 변경")}</SmallButton>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Typography pretendard="SB" size="sm">
                {uiText("데이터 폴더")}</Typography>
              <Card
                width="100%"
                shadow="none"
                border={false}
                background={`${setting.theme}-1`}
              >
                <Typography size="sm" style={{ overflowWrap: "anywhere" }}>
                  {paths?.dataPath}
                </Typography>
              </Card>
            </div>
          </div>
          <Typography as="div" size="xs" color="black-6" className="text-center">
            v{appVersion}
          </Typography>
        </>
      }
    />
  );
}
