"use client";
import { t as uiText, useI18n } from "../../i18n";

import { useMemo } from "react";
import dynamic from "@/desktop/dynamic";
import { Typography } from "sud-ui";

const Player = dynamic(
  () => import("@lottiefiles/react-lottie-player").then((mod) => mod.Player),
  { ssr: false }
);
import { rgbToHex } from "../../utils/lottieUtils";
import { useSetting } from "../../context/SettingContext";
import { useDarkMode } from "../../context/DarkModeContext";
import useColorizedLottie from "../../hook/useColorizedLottie";

export const LoadingAnimation = () => {
  useI18n();
  const { setting } = useSetting();
  const { currentColors } = useDarkMode();
  const theme = setting.theme || "mint";
  const colorMapping = useMemo(
    () => [
      {
        from: rgbToHex(19, 194, 194),
        to: currentColors[theme][9]
      },
      {
        from: rgbToHex(229, 235, 234),
        to: currentColors[theme][6]
      },
      {
        from: rgbToHex(243, 246, 246),
        to: currentColors[theme][1]
      },
      {
        from: rgbToHex(235, 235, 235),
        to: currentColors[theme][1]
      },
      {
        from: rgbToHex(181, 245, 236),
        to: currentColors[theme][7]
      },
      {
        from: rgbToHex(245, 255, 254),
        to: currentColors.white[10]
      }
    ],
    [currentColors, theme]
  );
  const lottieData = useColorizedLottie("/lottie/document-search.json", colorMapping);

  if (!lottieData) return null;

  return (
    <div className="flex justify-center w-full items-center py-12">
      <Player
        autoplay
        loop
        src={lottieData}
        style={{ height: "auto", width: "50%" }}
      />
    </div>
  );
};

export const EmptyList = ({ message }) => {
  useI18n();
  return (
    <div className="flex justify-center w-full text-center py-12">
      <Typography color="cool-gray-7">
        {message ?? (
          <>
            {uiText("컨텐츠가 없습니다.")}<br /> {uiText(" 마우스 우클릭으로 새 문서 또는 폴더를 만들어주세요.")}</>
        )}
      </Typography>
    </div>
  );
};
