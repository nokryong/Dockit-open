import { Tabs } from "sud-ui";
import { useState } from "react";
import { CgColorBucket } from "react-icons/cg";
import ColorAndBorder from "./ShapeEditorComponent/ColorAndBorder";
import SizeAndPadding from "./ShapeEditorComponent/SizeAndPadding";
import { RiCustomSize } from "react-icons/ri";
import { BsLayersHalf } from "react-icons/bs";
import LayerEtc from "./ShapeEditorComponent/LayerEtc";
import { MdPhotoFilter } from "react-icons/md";
import ImageEffects from "./ShapeEditorComponent/ImageEffects";
import { useSetting } from "@/app/LIB/context/SettingContext";
import { PiCropBold } from "react-icons/pi";
import ImageCrop from "./ShapeEditorComponent/ImageCrop";

export default function ShapeEditor({
  element,
  onUpdateStyle,
  onUpdateSrc,
  isImage = false,
  isDarkMode
}) {
  const { setting } = useSetting();
  // 현재 스타일 값들
  const backgroundColor = element?.style?.backgroundColor || "#ffffffff";
  const borderColor = element?.style?.borderColor || "#000000ff";
  const borderWidth = parseInt(element?.style?.borderWidth) || 0;
  const borderStyle = element?.style?.borderStyle || "solid";
  const borderRadius = element?.style?.borderRadius || 0;
  const width = element?.size?.width || 200;
  const height = element?.size?.height || 200;
  const rotation = element?.style?.rotation || 0;
  const justifyContent = element?.style?.justifyContent || "center";
  const paddingTop = element?.style?.paddingTop || 0;
  const paddingBottom = element?.style?.paddingBottom || 0;
  const paddingLeft = element?.style?.paddingLeft || 0;
  const paddingRight = element?.style?.paddingRight || 0;

  const backgroundImage = element?.style?.backgroundImage || "";
  const backgroundSize = element?.style?.backgroundSize || "cover";
  const backgroundPosition = element?.style?.backgroundPosition || "center";
  const backgroundRepeat = element?.style?.backgroundRepeat || "no-repeat";

  const shadowOffsetX = element?.style?.shadowOffsetX || 0;
  const shadowOffsetY = element?.style?.shadowOffsetY || 0;
  const shadowBlur = element?.style?.shadowBlur || 10;
  const shadowSpread = element?.style?.shadowSpread || 1;
  const shadowColor = element?.style?.shadowColor || "#000000ff";
  const shadowInset = element?.style?.shadowInset || false;
  const shadowEnabled = element?.style?.shadowEnabled || false;

  const filterBrightness = element?.style?.filterBrightness || 100; // % 단위
  const filterContrast = element?.style?.filterContrast || 100; // % 단위
  const filterGrayscale = element?.style?.filterGrayscale || 0;
  const filterOpacity = element?.style?.opacity || 100; // % 단위

  // ColorPicker 열림 상태
  const [bgColorPickerOpen, setBgColorPickerOpen] = useState(false);
  const [borderColorPickerOpen, setBorderColorPickerOpen] = useState(false);

  const handleCropCompleteRaw = (croppedBlob, newWidth, newHeight) => {
    if (!onUpdateSrc) return;

    const newImageUrl = URL.createObjectURL(croppedBlob);

    // ★ Blob URL과 함께, 새로 받은 사이즈도 같이 넘김
    onUpdateSrc(newImageUrl, newWidth, newHeight);
  };
  // 공통 탭: 색상/테두리, 크기/패딩, 그림자
  const commonTabs = [
    {
      key: "colorAndBorder",
      label: <CgColorBucket />,
      children: (
        <ColorAndBorder
          bgColorPickerOpen={bgColorPickerOpen}
          setBgColorPickerOpen={setBgColorPickerOpen}
          backgroundColor={backgroundColor}
          borderColor={borderColor}
          borderColorPickerOpen={borderColorPickerOpen}
          setBorderColorPickerOpen={setBorderColorPickerOpen}
          borderWidth={borderWidth}
          borderStyle={borderStyle}
          onUpdateStyle={onUpdateStyle}
          isImage={isImage}
          setting={setting}
          backgroundImage={backgroundImage}
          backgroundSize={backgroundSize}
          backgroundPosition={backgroundPosition}
          backgroundRepeat={backgroundRepeat}
          isDarkMode={isDarkMode}
        />
      )
    },
    {
      key: "sizeAndPadding",
      label: <RiCustomSize />,
      children: (
        <SizeAndPadding
          height={height}
          width={width}
          rotation={rotation}
          borderRadius={borderRadius}
          justifyContent={justifyContent}
          paddingTop={paddingTop}
          paddingBottom={paddingBottom}
          paddingLeft={paddingLeft}
          paddingRight={paddingRight}
          onUpdateStyle={onUpdateStyle}
          shapeType={element.shapeType}
          isImage={isImage}
          isDarkMode={isDarkMode}
          setting={setting}
        />
      )
    },
    {
      key: "layer",
      label: <BsLayersHalf />,
      children: (
        <LayerEtc
          shadowEnabled={shadowEnabled}
          shadowOffsetX={shadowOffsetX}
          shadowOffsetY={shadowOffsetY}
          shadowBlur={shadowBlur}
          shadowSpread={shadowSpread}
          shadowColor={shadowColor}
          shadowInset={shadowInset}
          onUpdateStyle={onUpdateStyle}
          isImage={isImage}
          setting={setting}
          isDarkMode={isDarkMode}
        />
      )
    }
  ];

  // 이미지 전용 탭: 효과, 자르기
  const imageTabs = [
    {
      key: "imageEffects",
      label: <MdPhotoFilter />,
      children: (
        <ImageEffects
          src={element.attrs.src}
          brightness={filterBrightness}
          contrast={filterContrast}
          grayscale={filterGrayscale}
          opacity={filterOpacity}
          onUpdateStyle={onUpdateStyle}
          isDarkMode={isDarkMode}
          setting={setting}
        />
      )
    },
    {
      key: "imageCrop",
      label: <PiCropBold />,
      children: (
        <ImageCrop
          src={element.attrs.src}
          onCropCompleteRaw={handleCropCompleteRaw}
          currentHeight={height}
          currentWidth={width}
          isDarkMode={isDarkMode}
          setting={setting}
        />
      )
    }
  ];

  const tabOptions = isImage ? [...commonTabs, ...imageTabs] : commonTabs;

  return (
    <div className="flex flex-col gap-4 w-full">
      <Tabs
        options={tabOptions}
        color={{
          active: `white-1`,
          inactive: "cool-gray-5"
        }}
      />
    </div>
  );
}
