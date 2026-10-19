import { useEffect, useState } from "react";
import { loadAndColorifyLottie } from "@/app/LIB/utils/lottieUtils";

const DEFAULT_COLOR_MAPPING = [];

export default function useColorizedLottie(
  jsonPath,
  colorMapping = DEFAULT_COLOR_MAPPING
) {
  const [lottieData, setLottieData] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadLottie = async () => {
      const data = await loadAndColorifyLottie(jsonPath, colorMapping);

      if (isMounted) {
        setLottieData(data);
      }
    };

    loadLottie();

    return () => {
      isMounted = false;
    };
  }, [jsonPath, colorMapping]);

  return lottieData;
}
