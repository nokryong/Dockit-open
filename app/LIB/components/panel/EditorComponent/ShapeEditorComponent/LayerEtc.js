import { t as uiText, useI18n } from "../../../../i18n";
import {
  inputProps,
  newShadowDarkSm,
  newShadowLightSm
} from "@/app/LIB/constant/uiProps";
import { useState } from "react";
import { CgColorBucket } from "react-icons/cg";
import { Button, ColorPicker, Input, Switch, Typography } from "sud-ui";

export default function LayerEtc({
  shadowEnabled = false,
  shadowOffsetX = 0,
  shadowOffsetY = 0,
  shadowBlur = 0,
  shadowSpread = 0,
  shadowColor = "#00000040",
  shadowInset = false,
  onUpdateStyle,
  setting,
  isDarkMode
}) {
  useI18n();
  const [shadowColorPickerOpen, setShadowColorPickerOpen] = useState(false);

  // 투명도 계산
  const getOpacityFromHex = (hex) => {
    if (!hex || hex.length < 7) return 100;
    if (hex.length === 9) {
      const alphaHex = hex.slice(7, 9);
      return Math.round((parseInt(alphaHex, 16) / 255) * 100);
    }
    return 100;
  };

  const shadowOpacity = getOpacityFromHex(shadowColor);

  // 그림자 색상 변경
  const handleShadowColorChange = (color) => {
    const newColor = color.hex;
    const alphaHex = shadowColor.length === 9 ? shadowColor.slice(7, 9) : "40";
    const finalHex = `${newColor}${alphaHex}`.toUpperCase();

    if (shadowColor.toUpperCase() !== finalHex) {
      onUpdateStyle({ shadowColor: finalHex });
    }
  };

  // 그림자 투명도 변경
  const handleShadowOpacityChange = (percent) => {
    const baseColor = shadowColor.slice(0, 7);
    const alpha = Math.round((percent / 100) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
    const finalHex = `${baseColor}${alpha}`.toUpperCase();

    if (shadowColor.toUpperCase() !== finalHex) {
      onUpdateStyle({ shadowColor: finalHex });
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Typography pretendard="SB" color="white-1">
            {uiText("그림자")}</Typography>
          <Switch
            checked={shadowEnabled}
            onChange={(checked) => onUpdateStyle({ shadowEnabled: checked })}
            size="sm"
            onColor={`${setting.theme}-7`}
          />
        </div>

        {shadowEnabled && (
          <div className="flex flex-col gap-2">
            {/* X 오프셋 */}
            <div
              className="flex items-center gap-8"
              onMouseDown={(event) => {
                if (event.target.tagName !== "INPUT") {
                  event.preventDefault();
                }
              }}
            >
              <Typography size="sm" className="flex-shrink-0" color="white-1">
                {uiText("X 위치")}</Typography>
              <Input
                {...inputProps}
                background={`${setting.theme}-1`}
                type="number"
                value={shadowOffsetX}
                onChange={(e) =>
                  onUpdateStyle({ shadowOffsetX: Number(e.target.value) })
                }
                suffix="pt"
                min={-100}
                max={100}
              />
            </div>

            {/* Y 오프셋 */}
            <div
              className="flex items-center gap-8"
              onMouseDown={(event) => {
                if (event.target.tagName !== "INPUT") {
                  event.preventDefault();
                }
              }}
            >
              <Typography size="sm" className="flex-shrink-0" color="white-1">
                {uiText("Y 위치")}</Typography>
              <Input
                {...inputProps}
                type="number"
                value={shadowOffsetY}
                onChange={(e) =>
                  onUpdateStyle({ shadowOffsetY: Number(e.target.value) })
                }
                suffix="pt"
                min={-100}
                max={100}
                background={`${setting.theme}-1`}
              />
            </div>

            {/* 흐림 정도 */}
            <div
              className="flex items-center gap-8"
              onMouseDown={(event) => {
                if (event.target.tagName !== "INPUT") {
                  event.preventDefault();
                }
              }}
            >
              <Typography size="sm" className="flex-shrink-0" color="white-1">
                {uiText("흐림")}</Typography>
              <Input
                {...inputProps}
                type="number"
                value={shadowBlur}
                onChange={(e) =>
                  onUpdateStyle({ shadowBlur: Number(e.target.value) })
                }
                suffix="pt"
                min={0}
                max={100}
                background={`${setting.theme}-1`}
              />
            </div>

            {/* 확산 정도 */}
            <div
              className="flex items-center gap-8"
              onMouseDown={(event) => {
                if (event.target.tagName !== "INPUT") {
                  event.preventDefault();
                }
              }}
            >
              <Typography size="sm" className="flex-shrink-0" color="white-1">
                {uiText("확산")}</Typography>
              <Input
                {...inputProps}
                type="number"
                value={shadowSpread}
                onChange={(e) =>
                  onUpdateStyle({ shadowSpread: Number(e.target.value) })
                }
                suffix="pt"
                min={-50}
                max={50}
                background={`${setting.theme}-1`}
              />
            </div>

            {/* 그림자 색상 */}
            <div className="flex items-center justify-between">
              <Typography size="sm" color="white-1">
                {uiText("그림자 색")}</Typography>
              <ColorPicker
                open={shadowColorPickerOpen}
                setOpen={setShadowColorPickerOpen}
                color={shadowColor.slice(0, 7)}
                onChange={handleShadowColorChange}
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

            {/* 그림자 투명도 */}
            <div
              className="flex items-center gap-8"
              onMouseDown={(event) => {
                if (event.target.tagName !== "INPUT") {
                  event.preventDefault();
                }
              }}
            >
              <Typography size="sm" className="flex-shrink-0" color="white-1">
                {uiText("그림자 투명도")}</Typography>
              <Input
                {...inputProps}
                type="number"
                value={shadowOpacity}
                onChange={(e) =>
                  handleShadowOpacityChange(Number(e.target.value))
                }
                suffix="%"
                min={0}
                max={100}
                background={`${setting.theme}-1`}
              />
            </div>

            {/* 내부/외부 그림자 */}
            <div className="flex items-center justify-between">
              <Typography size="sm" color="white-1">
                {uiText("내부 그림자")}</Typography>
              <Switch
                checked={shadowInset}
                onChange={(checked) => onUpdateStyle({ shadowInset: checked })}
                size="sm"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
