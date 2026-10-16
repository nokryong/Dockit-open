"use client";

import React, { useMemo } from "react";
import dynamic from "@/desktop/dynamic";

const Player = dynamic(
  () => import("@lottiefiles/react-lottie-player").then((mod) => mod.Player),
  { ssr: false }
);
import { rgbToHex } from "@/app/LIB/utils/lottieUtils";
import { useSetting } from "../../context/SettingContext";
import { useDarkMode } from "../../context/DarkModeContext";
import useColorizedLottie from "../../hook/useColorizedLottie";

export default function DocumentLoadingAnimation() {
  const { setting } = useSetting();
  const { currentColors } = useDarkMode();
  const theme = setting.theme || "mint";
  const colorMapping = useMemo(
    () => [
      {
        from: rgbToHex(65, 175, 175),
        to: currentColors[theme][7]
      },
      {
        from: rgbToHex(241, 248, 247),
        to: currentColors[theme][1]
      }
    ],
    [currentColors, theme]
  );
  const lottieData = useColorizedLottie("/lottie/document-loading.json", colorMapping);

  if (!lottieData) return null;

  return (
    <Player
      autoplay
      loop
      src={lottieData}
      style={{ height: "auto", width: "50%" }}
    />
  );
}
