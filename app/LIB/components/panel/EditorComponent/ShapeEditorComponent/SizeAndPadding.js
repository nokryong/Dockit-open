import { t as uiText, useI18n } from "../../../../i18n";
import {
  panelInputProps,
  panelSelectProps
} from "@/app/LIB/constant/uiProps";

import { Divider, Input, Select, Typography } from "sud-ui";

export default function SizeAndPadding({
  height,
  width,
  rotation,
  borderRadius,
  justifyContent,
  paddingTop,
  paddingBottom,
  paddingLeft,
  paddingRight,
  onUpdateStyle,
  shapeType, // element.shapeType 대신 props로 받기
  isImage = false,
  setting
}) {
  useI18n();
  const themedInputProps = panelInputProps(setting.theme);
  const themedSelectProps = panelSelectProps(setting.theme);

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex flex-col gap-2">
        <Typography pretendard="SB" color="white-1">
          {uiText("크기")}</Typography>
        <div className="flex flex-col gap-2">
          {/* 높이 */}
          <div
            className="flex items-center gap-8"
            onMouseDown={(event) => {
              if (event.target.tagName !== "INPUT") {
                event.preventDefault();
              }
            }}
          >
            <Typography size="sm" className="flex-shrink-0" color="white-1">
              {uiText("높이")}</Typography>
            <Input
              {...themedInputProps}
              type="number"
              value={height}
              onChange={(e) =>
                onUpdateStyle({ height: Number(e.target.value) }, true)
              }
              suffix="mm"
              min={0}
              max={500}
            />
          </div>
          {/* 너비 */}
          <div
            className="flex items-center gap-8"
            onMouseDown={(event) => {
              if (event.target.tagName !== "INPUT") {
                event.preventDefault();
              }
            }}
          >
            <Typography size="sm" className="flex-shrink-0" color="white-1">
              {uiText("너비")}</Typography>
            <Input
              {...themedInputProps}
              type="number"
              value={width}
              onChange={(e) =>
                onUpdateStyle({ width: Number(e.target.value) }, true)
              }
              suffix="mm"
              min={0}
              max={500}
            />
          </div>

          {/* 모서리 */}
          <div
            className="flex items-center gap-8"
            onMouseDown={(event) => {
              if (event.target.tagName !== "INPUT") {
                event.preventDefault();
              }
            }}
          >
            <Typography size="sm" className="flex-shrink-0" color="white-1">
              {uiText("모서리")}</Typography>
            <Input
              {...themedInputProps}
              type="number"
              value={
                typeof borderRadius === "string"
                  ? parseFloat(borderRadius)
                  : borderRadius
              }
              onChange={(e) =>
                onUpdateStyle({ borderRadius: Number(e.target.value) }, false)
              }
              suffix="mm"
              min={0}
              max={100}
            />
          </div>
        </div>
      </div>
      {!isImage && <Divider />}
      {!isImage && (
        <div className="flex flex-col gap-2">
          <Typography pretendard="SB" color="white-1">
            {uiText("상자 속성")}</Typography>
          <div className="flex flex-col gap-2">
            {/* 세로 맞춤 */}
            <div onMouseDown={(event) => event.preventDefault()}>
              <div className="flex items-center gap-8">
                <Typography size="sm" className="flex-shrink-0" color="white-1">
                  {uiText("세로 맞춤")}</Typography>
                <Select
                  value={justifyContent}
                  onChange={(value) =>
                    onUpdateStyle({ justifyContent: value }, false)
                  }
                  {...themedSelectProps}
                  options={[
                    { label: uiText("상단"), value: "start" },
                    { label: uiText("중앙"), value: "center" },
                    { label: uiText("하단"), value: "end" }
                  ]}
                />
              </div>
            </div>
            {/* 패딩 */}
            <div
              className="flex items-center gap-8"
              onMouseDown={(event) => {
                if (event.target.tagName !== "INPUT") {
                  event.preventDefault();
                }
              }}
            >
              <Typography size="sm" className="flex-shrink-0" color="white-1">
                {uiText("상단 여백")}</Typography>
              <Input
                {...themedInputProps}
                type="number"
                value={paddingTop}
                onChange={(e) =>
                  onUpdateStyle({ paddingTop: Number(e.target.value) }, false)
                }
                suffix="mm"
                min={0}
                max={100}
              />
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
                {uiText("하단 여백")}</Typography>
              <Input
                {...themedInputProps}
                type="number"
                value={paddingBottom}
                onChange={(e) =>
                  onUpdateStyle(
                    { paddingBottom: Number(e.target.value) },
                    false
                  )
                }
                suffix="mm"
                min={0}
                max={100}
              />
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
                {uiText("왼쪽 여백")}</Typography>
              <Input
                {...themedInputProps}
                type="number"
                value={paddingLeft}
                onChange={(e) =>
                  onUpdateStyle({ paddingLeft: Number(e.target.value) }, false)
                }
                suffix="mm"
                min={0}
                max={100}
              />
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
                {uiText("오른쪽 여백")}</Typography>
              <Input
                {...themedInputProps}
                type="number"
                value={paddingRight}
                onChange={(e) =>
                  onUpdateStyle({ paddingRight: Number(e.target.value) }, false)
                }
                suffix="mm"
                min={0}
                max={100}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
