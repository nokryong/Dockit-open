"use client";
import { t as uiText, useI18n } from "../../i18n";

import React, { useMemo } from "react";
import dynamic from "@/desktop/dynamic";
import { Typography } from "sud-ui";

const Player = dynamic(
  () => import("@lottiefiles/react-lottie-player").then((mod) => mod.Player),
  { ssr: false }
);
import { rgbToHex } from "@/app/LIB/utils/lottieUtils";
import { useSetting } from "../../context/SettingContext";
import { useDarkMode } from "../../context/DarkModeContext";
import useColorizedLottie from "../../hook/useColorizedLottie";

export default function SettingsSavingIndicator() {
  useI18n();
  const { setting } = useSetting();
  const { currentColors } = useDarkMode();
  const theme = setting.theme || "mint";
  const colorMapping = useMemo(
    () => [
      {
        from: rgbToHex(181, 245, 236),
        to: currentColors[theme][4]
      },
      {
        from: rgbToHex(19, 194, 194),
        to: currentColors[theme][7]
      }
    ],
    [currentColors, theme]
  );
  const lottieData = useColorizedLottie(
    "/lottie/settings-saving.json",
    colorMapping
  );

  if (!lottieData) return null;

  return (
    <div className="flex flex-col justify-center w-full items-center">
      <Player
        src={lottieData}
        loop
        autoplay
        style={{ width: "50%", height: "50%" }}
      />
      <Typography
        as="p"
        color={currentColors[setting.theme][8]}
        pretendard="SB"
        style={{ textAlign: "center" }}
      >
        {uiText("문서 설정을")}<br /> {uiText(" 변경 중입니다.")}</Typography>
    </div>
  );
}
