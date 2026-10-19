import { t as uiText, useI18n } from "../../../../i18n";
import {
  newShadowDarkSm,
  newShadowLightSm,
  panelInputProps,
  panelSelectProps,
} from "@/app/LIB/constant/uiProps";
import { CgColorBucket } from "react-icons/cg";
import { useRef } from "react";
import {
  Button,
  ColorPicker,
  Divider,
  Input,
  Select,
  Switch,
  Typography
} from "sud-ui";
import { PhotoOutline } from "sud-icons";

export default function ColorAndBorder({
  bgColorPickerOpen,
  setBgColorPickerOpen,
  backgroundColor = "#FFFFFF",
  onUpdateStyle,
  borderColor = "#000000",
  borderColorPickerOpen,
  setBorderColorPickerOpen,
  borderWidth = 0,
  borderStyle = "solid",
  isImage = false,
  setting,
  backgroundImage = "",
  backgroundSize = "cover",
  backgroundPosition = "center",
  backgroundRepeat = "no-repeat",
  isDarkMode
}) {
  useI18n();
  const fileInputRef = useRef(null);
  const themedInputProps = panelInputProps(setting.theme);
  const themedSelectProps = panelSelectProps(setting.theme, isDarkMode);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = new window.Image();
    img.onload = () => {
      const MAX = 1200;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(img.src);
      onUpdateStyle({ backgroundImage: compressed });
    };
    img.src = URL.createObjectURL(file);
    e.target.value = "";
  };
  // 1. 현재 투명도 계산 (0~100 사이 숫자로 추출)
  const getOpacityFromHex = (hex) => {
    if (!hex || hex.length < 7) return 100;
    if (hex.length === 9) {
      const alphaHex = hex.slice(7, 9);
      return Math.round((parseInt(alphaHex, 16) / 255) * 100);
    }
    return 100; // 6자리(#FFFFFF)인 경우 100%
  };

  const backgroundOpacity = getOpacityFromHex(backgroundColor);
  const borderOpacity = getOpacityFromHex(borderColor);

  // 배경색/선색이 활성화되어 있는지 체크 (투명이 아니면 활성화)
  const isBgEnabled =
    backgroundColor !== "transparent" && backgroundOpacity > 0;
  const isBorderEnabled = borderColor !== "transparent" && borderOpacity > 0;

  // 2. 배경색 변경 핸들러 (순수 색상만 업데이트)
  const handleColorChange = (color, type) => {
    const newColor = color.hex;
    const currentColor = type === "background" ? backgroundColor : borderColor;
    const alphaHex =
      currentColor.length === 9 ? currentColor.slice(7, 9) : "FF";

    const finalHex = `${newColor}${alphaHex}`.toUpperCase();
    if (currentColor.toUpperCase() === finalHex) return;

    if (type === "background") {
      onUpdateStyle({ backgroundColor: finalHex });
    } else {
      onUpdateStyle({ borderColor: finalHex });
    }
  };

  // 3. 투명도 변경 핸들러 - 실시간 적용
  const handleOpacityChange = (percent, type) => {
    const currentColor = type === "background" ? backgroundColor : borderColor;
    const baseColor = currentColor.slice(0, 7); // #RRGGBB 추출
    const alpha = Math.round((percent / 100) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

    const finalHex = `${baseColor}${alpha}`.toUpperCase();

    // 값이 변했을 때만 업데이트 호출
    if (currentColor.toUpperCase() !== finalHex) {
      if (type === "background") {
        onUpdateStyle({ backgroundColor: finalHex });
      } else {
        onUpdateStyle({ borderColor: finalHex });
      }
    }
  };

  // 4. 활성화 스위치 핸들러
  const handleEnableToggle = (checked, type) => {
    if (type === "background") {
      if (checked) {
        onUpdateStyle({ backgroundColor: "#FFFFFFFF" });
      } else {
        onUpdateStyle({ backgroundColor: "transparent" });
      }
    } else {
      if (checked) {
        // 활성화: 테두리 복원 (width가 0이면 1로 설정)
        onUpdateStyle({
          borderColor: "#000000FF",
          borderWidth: borderWidth > 0 ? borderWidth : 1
        });
      } else {
        // 비활성화: 테두리 완전 제거
        onUpdateStyle({ borderColor: "transparent", borderWidth: 0 });
      }
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {!isImage && (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Typography pretendard="SB" color="white-1">
                {uiText("배경색")}</Typography>
              <Switch
                size="sm"
                checked={isBgEnabled}
                onChange={(checked) =>
                  handleEnableToggle(checked, "background")
                }
                onColor={`${setting.theme}-7`}
              />
            </div>
            <div className="flex flex-col gap-2">
              {isBgEnabled && (
                <>
                  <div className="flex items-center justify-between">
                    <Typography size="sm" color="white-1">
                      {uiText("배경색")}</Typography>
                    <ColorPicker
                      open={bgColorPickerOpen}
                      setOpen={setBgColorPickerOpen}
                      color={backgroundColor.slice(0, 7)}
                      onChange={(color) =>
                        handleColorChange(color, "background")
                      }
                      mode="preset"
                    >
                      <Button
                        icon={<CgColorBucket />}
                        border={false}
                        {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
                        background={"white-10"}
                        color={"white-1"}
                      />
                    </ColorPicker>
                  </div>

                  <div
                    className="flex items-center gap-8"
                    onMouseDown={(event) => {
                      if (event.target.tagName !== "INPUT") {
                        event.preventDefault();
                      }
                    }}
                  >
                    <Typography
                      size="sm"
                      className="flex-shrink-0"
                      color="white-1"
                    >
                      {uiText("투명도")}</Typography>
                    <Input
                      {...themedInputProps}
                      type="number"
                      value={backgroundOpacity}
                      onChange={(e) =>
                        handleOpacityChange(
                          Number(e.target.value),
                          "background"
                        )
                      }
                      suffix="%"
                      min={0}
                      max={100}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
          <Divider />
          {/* 배경 이미지 */}
          <div className="flex flex-col gap-2">
            <Typography pretendard="SB" color="white-1">
              {uiText("배경 이미지")}</Typography>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleImageUpload}
              />
              <div className="flex items-center gap-2">
                {backgroundImage && (
                  <img
                    src={backgroundImage}
                    alt="preview"
                    style={{
                      width: 36,
                      height: 36,
                      objectFit: "cover",
                      borderRadius: 4,
                      border: "1px solid #ddd",
                      flexShrink: 0
                    }}
                  />
                )}
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  border={false}
                  {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
                  color={"white-1"}
                  background={"white-10"}
                  icon={<PhotoOutline size={20} />}
                >
                  {backgroundImage ? uiText("변경") : uiText("업로드")}
                </Button>
                {backgroundImage && (
                  <Button
                    size="sm"
                    onClick={() => onUpdateStyle({ backgroundImage: "" })}
                    border={false}
                    {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
                    color={"white-1"}
                    background={"white-10"}
                  >
                    {uiText("제거")}</Button>
                )}
              </div>
              {backgroundImage && (
                <>
                  <div onMouseDown={(e) => e.preventDefault()}>
                    <div className="flex items-center gap-8">
                      <Typography
                        size="sm"
                        className="shrink-0"
                        color="white-1"
                      >
                        {uiText("크기")}</Typography>
                      <Select
                        value={backgroundSize}
                        onChange={(value) =>
                          onUpdateStyle({ backgroundSize: value })
                        }
                        {...themedSelectProps}
                        options={[
                          { label: uiText("채우기"), value: "cover" },
                          { label: uiText("맞추기"), value: "contain" },
                          { label: uiText("원본"), value: "auto" },
                          { label: uiText("늘리기"), value: "100% 100%" }
                        ]}
                      />
                    </div>
                  </div>
                  <div onMouseDown={(e) => e.preventDefault()}>
                    <div className="flex items-center gap-8">
                      <Typography
                        size="sm"
                        className="shrink-0"
                        color="white-1"
                      >
                        {uiText("위치")}</Typography>
                      <Select
                        value={backgroundPosition}
                        onChange={(value) =>
                          onUpdateStyle({ backgroundPosition: value })
                        }
                        {...themedSelectProps}
                        options={[
                          { label: uiText("가운데"), value: "center" },
                          { label: uiText("상단"), value: "top center" },
                          { label: uiText("하단"), value: "bottom center" },
                          { label: uiText("왼쪽"), value: "center left" },
                          { label: uiText("오른쪽"), value: "center right" }
                        ]}
                      />
                    </div>
                  </div>
                  <div onMouseDown={(e) => e.preventDefault()}>
                    <div className="flex items-center gap-8">
                      <Typography
                        size="sm"
                        className="shrink-0"
                        color="white-1"
                      >
                        {uiText("반복")}</Typography>
                      <Select
                        value={backgroundRepeat}
                        onChange={(value) =>
                          onUpdateStyle({ backgroundRepeat: value })
                        }
                        {...themedSelectProps}
                        options={[
                          { label: uiText("없음"), value: "no-repeat" },
                          { label: uiText("전체"), value: "repeat" },
                          { label: uiText("가로"), value: "repeat-x" },
                          { label: uiText("세로"), value: "repeat-y" }
                        ]}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <Divider />
        </>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Typography pretendard="SB" color="white-1">
            {uiText("테두리")}</Typography>
          <Switch
            size="sm"
            checked={isBorderEnabled}
            onChange={(checked) => handleEnableToggle(checked, "border")}
            onColor={`${setting.theme}-7`}
          />
        </div>
        <div className="flex flex-col gap-2">
          {isBorderEnabled && (
            <>
              <div className="flex items-center justify-between">
                <Typography size="sm" color="white-1">
                  {uiText("선색")}</Typography>
                <ColorPicker
                  open={borderColorPickerOpen}
                  setOpen={setBorderColorPickerOpen}
                  color={borderColor.slice(0, 7)}
                  onChange={(color) => handleColorChange(color, "border")}
                  mode="preset"
                >
                  <Button
                    icon={<CgColorBucket />}
                    border={false}
                    {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
                    color={`white-1`}
                    background={"white-10"}
                  />
                </ColorPicker>
              </div>
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
                  {...themedInputProps}
                  type="number"
                  value={borderOpacity}
                  onChange={(e) =>
                    handleOpacityChange(Number(e.target.value), "border")
                  }
                  suffix="%"
                  min={0}
                  max={100}
                />
              </div>
              {/* 선 두께 */}
              <div
                className="flex items-center gap-8"
                onMouseDown={(event) => {
                  if (event.target.tagName !== "INPUT") {
                    event.preventDefault();
                  }
                }}
              >
                <Typography size="sm" className="flex-shrink-0" color="white-1">
                  {uiText("선 두께")}</Typography>
                <Input
                  {...themedInputProps}
                  type="number"
                  value={borderWidth}
                  onChange={(e) =>
                    onUpdateStyle({ borderWidth: Number(e.target.value) })
                  }
                  suffix="pt"
                  min={0}
                  max={20}
                />
              </div>
              <div onMouseDown={(event) => event.preventDefault()}>
                <div className="flex items-center gap-8">
                  <Typography
                    size="sm"
                    className="flex-shrink-0"
                    color="white-1"
                  >
                    {uiText("선 타입")}</Typography>
                  <Select
                    value={borderStyle}
                    onChange={(value) => onUpdateStyle({ borderStyle: value })}
                    {...themedSelectProps}
                    options={[
                      { label: uiText("실선"), value: "solid" },
                      { label: uiText("대시선"), value: "dashed" },
                      { label: uiText("점선"), value: "dotted" },
                      { label: uiText("이중선"), value: "double" },
                      { label: uiText("없음"), value: "none" }
                    ]}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
