import { t as uiText, useI18n } from "../../../../i18n";
import { inputProps } from "@/app/LIB/constant/uiProps";
import { Input, Typography } from "sud-ui";

export default function ImageEffects({
  brightness,
  contrast,
  grayscale,
  opacity,
  onUpdateStyle,
  setting
}) {
  useI18n();
  // 1. 통합 필터 업데이트 핸들러
  // 하나의 값만 바뀌어도 전체 filter 문자열을 다시 조합해야 함
  const handleFilterChange = (key, value) => {
    const newValues = {
      brightness: key === "brightness" ? value : brightness,
      contrast: key === "contrast" ? value : contrast,
      grayscale: key === "grayscale" ? value : grayscale,
      opacity: key === "opacity" ? value : opacity // [수정1] opacity 상태 추적 추가
    };

    // CSS filter 문자열 생성
    const filterString = `brightness(${newValues.brightness}%) contrast(${newValues.contrast}%) grayscale(${newValues.grayscale}%)`;

    onUpdateStyle({
      filterBrightness: newValues.brightness,
      filterContrast: newValues.contrast,
      filterGrayscale: newValues.grayscale,
      filter: filterString,
      // [수정2] opacity 키 추가 및 0~100 값을 0.0~1.0으로 변환하여 전달
      opacity: newValues.opacity / 100
    });
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* ■■■■■■■■ 섹션 1: 이미지 색감 조정 ■■■■■■■■ */}
      <div className="flex flex-col gap-2">
        <Typography pretendard="SB" color="white-1">
          {uiText("이미지 조정")}</Typography>

        {/* 필터 입력창들 (활성화된 경우에만 표시하거나, 비활성 시 흐리게 처리) */}
        <div className="flex flex-col gap-2">
          {/* 1. 밝기 (Brightness) */}
          <div
            className="flex items-center gap-8"
            onMouseDown={(event) => {
              if (event.target.tagName !== "INPUT") {
                event.preventDefault();
              }
            }}
          >
            <Typography size="sm" className="flex-shrink-0" color="white-1">
              {uiText("밝기")}</Typography>
            <Input
              {...inputProps}
              type="number"
              value={brightness}
              onChange={(e) =>
                handleFilterChange("brightness", Number(e.target.value))
              }
              suffix="%"
              max={200}
              background={`${setting.theme}-1`}
            />
          </div>

          {/* 2. 대비 (Contrast) */}
          <div
            className="flex items-center gap-8"
            onMouseDown={(event) => {
              if (event.target.tagName !== "INPUT") {
                event.preventDefault();
              }
            }}
          >
            <Typography size="sm" className="flex-shrink-0" color="white-1">
              {uiText("대비")}</Typography>
            <Input
              {...inputProps}
              type="number"
              value={contrast}
              onChange={(e) =>
                handleFilterChange("contrast", Number(e.target.value))
              }
              suffix="%"
              max={200}
              background={`${setting.theme}-1`}
            />
          </div>

          {/* 3. 흑백 (Grayscale) */}
          <div
            className="flex items-center gap-8"
            onMouseDown={(event) => {
              if (event.target.tagName !== "INPUT") {
                event.preventDefault();
              }
            }}
          >
            <Typography size="sm" className="flex-shrink-0" color="white-1">
              {uiText("흑백")}</Typography>
            <Input
              {...inputProps}
              type="number"
              value={grayscale}
              onChange={(e) =>
                handleFilterChange("grayscale", Number(e.target.value))
              }
              suffix="%"
              max={100}
              background={`${setting.theme}-1`}
            />
          </div>

          {/* 4. 투명도 */}
          <div
            className="flex items-center gap-8"
            onMouseDown={(event) => {
              if (event.target.tagName !== "INPUT") {
                event.preventDefault();
              }
            }}
          >
            <Typography size="sm" className="flex-shrink-0" color="white-1">
              {uiText("투명도")}</Typography>
            <Input
              {...inputProps}
              type="number"
              value={opacity}
              onChange={(e) =>
                handleFilterChange("opacity", Number(e.target.value))
              }
              suffix="%"
              max={100}
              background={`${setting.theme}-1`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
