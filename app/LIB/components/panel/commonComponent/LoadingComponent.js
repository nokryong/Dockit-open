import { useMemo } from "react";
import { rgbToHex } from "@/app/LIB/utils/lottieUtils";
import { useSetting } from "@/app/LIB/context/SettingContext";
import { useDarkMode } from "@/app/LIB/context/DarkModeContext";
import dynamic from "@/desktop/dynamic";
import useColorizedLottie from "@/app/LIB/hook/useColorizedLottie";

const Player = dynamic(
  () => import("@lottiefiles/react-lottie-player").then((mod) => mod.Player),
  { ssr: false }
);

export default function LoadingComponent({ size = "50%" }) {
  const { setting } = useSetting();
  const { currentColors } = useDarkMode();
  const theme = setting.theme;
  const colorMapping = useMemo(
    () => [
      {
        from: rgbToHex(69, 45, 28),
        to: currentColors[theme][6]
      },
      {
        from: rgbToHex(255, 184, 135),
        to: currentColors[theme][4]
      }
    ],
    [currentColors, theme]
  );
  const lottieData = useColorizedLottie(
    "/lottie/loading-spinner.json",
    colorMapping
  );

  if (!lottieData) return null;

  return (
    <Player
      src={lottieData}
      loop
      autoplay
      style={{ width: size, height: size }}
    />
  );
}
