import { t as uiText, useI18n } from "../../../../i18n";
import React, { useRef, useState } from "react";
import Cropper from "react-cropper";
import "cropperjs/dist/cropper.css"; // ★ 스타일 필수
import { Button, Segmented, Typography } from "sud-ui";
import { MdRotateLeft, MdRotateRight, MdRefresh } from "react-icons/md";
import { CgArrowsH, CgArrowsV } from "react-icons/cg";
import { useSetting } from "@/app/LIB/context/SettingContext";
import { newShadowDarkSm, newShadowLightSm } from "@/app/LIB/constant/uiProps";

export default function ImageCrop({
  src,
  currentWidth,
  currentHeight,
  onCropCompleteRaw,
  isDarkMode
}) {
  useI18n();
  const { setting } = useSetting();
  const cropperRef = useRef(null);

  const [ratioValue, setRatioValue] = useState(1);

  // 크롭 완료 핸들러
  const handleCrop = () => {
    const imageElement = cropperRef?.current;
    const cropper = imageElement?.cropper;

    if (cropper) {
      // 1. 실제로 잘린 원본 해상도의 캔버스 (화질 유지를 위해 얘는 원본 씀)
      const canvas = cropper.getCroppedCanvas();

      // 2. 원본 이미지 데이터 가져오기 (naturalWidth, naturalHeight)
      const imageData = cropper.getImageData();

      if (!canvas || !imageData) return;

      // ■■■■■■■■ 여기가 핵심 수정 사항 ■■■■■■■■
      // "에디터에서 보고 있던 크기" / "실제 원본 크기" = "축소 비율"
      // (만약 currentWidth가 없으면 그냥 1로 둠)
      const scaleX = currentWidth ? currentWidth / imageData.naturalWidth : 1;
      const scaleY = currentHeight
        ? currentHeight / imageData.naturalHeight
        : 1;

      // 3. 잘린 캔버스 크기(원본 기준)에다가 비율을 곱해서 "에디터용 사이즈" 계산
      // 예: 원본 1000px 잘라서 500px 됨 -> 비율 0.1 곱함 -> 결과 50px (형이 원하는 값)
      const newLogicalWidth = Math.round(canvas.width * scaleX);
      const newLogicalHeight = Math.round(canvas.height * scaleY);

      canvas.toBlob((blob) => {
        if (onCropCompleteRaw) {
          // ★ Blob은 고화질로 보내고, 사이즈는 에디터에 맞춰서 계산된 값을 보냄
          onCropCompleteRaw(blob, newLogicalWidth, newLogicalHeight);
        }
      });
    }
  };

  // 헬퍼 함수들 (버튼 연결용)
  const rotate = (degree) => cropperRef.current?.cropper.rotate(degree);
  const flipX = () => {
    const cropper = cropperRef.current?.cropper;
    cropper.scaleX(cropper.getData().scaleX === 1 ? -1 : 1);
  };
  const flipY = () => {
    const cropper = cropperRef.current?.cropper;
    cropper.scaleY(cropper.getData().scaleY === 1 ? -1 : 1);
  };
  const reset = () => cropperRef.current?.cropper.reset();

  // 비율 설정 함수
  const setRatio = (ratio) => cropperRef.current?.cropper.setAspectRatio(ratio);

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="w-full h-[400px] bg-gray-900 rounded-xl overflow-hidden">
        <Cropper
          src={src}
          style={{ height: "100%", width: "100%" }}
          initialAspectRatio={1} // 초기 비율 1:1
          aspectRatio={NaN} // NaN으로 설정하면 "자유 변형" 모드 시작
          guides={true} // 가이드라인 보이기
          ref={cropperRef}
          viewMode={1} // 1: 이미지가 컨테이너를 벗어나지 않음
          dragMode="move" // 'crop': 드래그로 새 영역, 'move': 이미지 이동
          minCropBoxHeight={10}
          minCropBoxWidth={10}
          background={false} // 격자 무늬 배경 끄기 (취향껏)
          responsive={true}
          autoCropArea={1} // 처음에 이미지 꽉 채우게 선택
          checkOrientation={false}
        />
      </div>

      {/* 컨트롤 패널 */}
      <div className="flex flex-col gap-2">
        {/* 비율 버튼 */}
        <Segmented
          options={[
            { value: 1, label: <Typography size="xs">1:1</Typography> },
            { value: 4 / 3, label: <Typography size="xs">4:3</Typography> },
            { value: 16 / 9, label: <Typography size="xs">16:9</Typography> },
            { value: NaN, label: <Typography size="xs">{uiText("자유")}</Typography> }
          ]}
          value={ratioValue}
          onChange={(value) => {
            setRatio(value);
            setRatioValue(value);
          }}
          size="sm"
          block
          background={setting.theme}
          color={`${setting.theme}-1`}
          {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
        />

        {/* 조작 버튼 */}
        <div className="grid grid-cols-4 justify-center gap-2">
          <Button
            size="sm"
            onClick={() => rotate(-90)}
            title={uiText("왼쪽 회전")}
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
            background={"white-10"}
            color={"white-1"}
          >
            <MdRotateLeft size={20} />
          </Button>
          <Button
            size="sm"
            onClick={() => rotate(90)}
            title={uiText("오른쪽 회전")}
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
            background={"white-10"}
            color={"white-1"}
          >
            <MdRotateRight size={20} />
          </Button>
          <Button
            size="sm"
            onClick={flipX}
            title={uiText("좌우 반전")}
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
            background={"white-10"}
            color={"white-1"}
          >
            <CgArrowsH size={20} />
          </Button>
          <Button
            size="sm"
            onClick={flipY}
            title={uiText("상하 반전")}
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
            background={"white-10"}
            color={"white-1"}
          >
            <CgArrowsV size={20} />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleCrop}
            className="w-full"
            color={`${setting.theme}-1`}
            background={`${setting.theme}-7`}
            size="sm"
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
          >
            {uiText("편집 완료")}</Button>
          <Button
            onClick={reset}
            title={uiText("초기화")}
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
            background={"white-10"}
            color={"white-1"}
          >
            <MdRefresh size={20} />
          </Button>
        </div>
      </div>
    </div>
  );
}
