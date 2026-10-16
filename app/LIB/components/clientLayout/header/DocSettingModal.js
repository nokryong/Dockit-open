import { useDocument } from "@/app/LIB/context/DocumentContext";
import { useSetting } from "@/app/LIB/context/SettingContext";
import { useEffect, useState } from "react";
import { SettingOutline } from "sud-icons";
import {
  Button,
  Divider,
  Input,
  Modal,
  Select,
  Slider,
  Typography
} from "sud-ui";
import SettingsSavingIndicator from "../../docs/SettingsSavingIndicator";
import { useDarkMode } from "@/app/LIB/context/DarkModeContext";
import {
  newShadowDarkSm,
  newShadowLightSm,
  panelInputProps,
  panelSelectProps,
  withOverlayShadow
} from "@/app/LIB/constant/uiProps";

export default function DocSettingModal({
  setDocSettingModalOpen,
  docSettingModalOpen
}) {
  const {
    document,
    saveDocument,
    docSetting,
    loadDocument,
    setDocSetting,
    bulletStyle,
    setBulletStyle
  } = useDocument();
  const { setting } = useSetting();
  const { isDarkMode } = useDarkMode();
  const themedInputProps = panelInputProps(setting.theme);
  const themedSelectProps = panelSelectProps(setting.theme, isDarkMode);

  const [isSaving, setIsSaving] = useState(false);

  // 로컬 상태로 관리하여 입력 시 에디터 리렌더링 방지
  const [localDocSetting, setLocalDocSetting] = useState(null);
  const [localBulletStyle, setLocalBulletStyle] = useState(null);

  useEffect(() => {
    if (docSettingModalOpen) {
      setLocalDocSetting(docSetting ? { ...docSetting } : null);
      setLocalBulletStyle(
        bulletStyle
          ? { ...bulletStyle }
          : {
              h1: "decimal",
              h2: "decimal",
              h3: "decimal",
              h4: "decimal",
              h5: "decimal",
              h6: "decimal",
              "list-1": "circle-outline",
              "list-2": "ring",
              "list-3": "bullet-small",
              "list-4": "dash",
              "order-list-1": "decimal-dot",
              "order-list-2": "decimal-dot",
              "order-list-3": "decimal-dot",
              "order-list-4": "decimal-dot"
            }
      );
    }
  }, [docSettingModalOpen, docSetting, bulletStyle]);

  useEffect(() => {
    if (!bulletStyle) {
      setBulletStyle({
        h1: "upper-roman",
        h2: "decimal",
        h3: "lower-roman",
        h4: "upper-alpha",
        h5: "lower-alpha",
        h6: "korean-2",
        "list-1": "circle-outline",
        "list-2": "ring",
        "list-3": "bullet-small",
        "list-4": "dash",
        "order-list-1": "decimal-dot",
        "order-list-2": "decimal-paren",
        "order-list-3": "lower-roman-dot",
        "order-list-4": "lower-roman-paren"
      });
    }
  }, [bulletStyle, setBulletStyle]);

  const handleChange = (name, value) => {
    setLocalDocSetting({ ...localDocSetting, [name]: value });
  };

  const handleBulletStyleChange = (level, value) => {
    setLocalBulletStyle({ ...localBulletStyle, [level]: value });
  };

  const bulletOptions = [
    { label: "I", value: "upper-roman" },
    { label: "1", value: "decimal" },
    { label: "i", value: "lower-roman" },
    { label: "A", value: "upper-alpha" },
    { label: "a", value: "lower-alpha" },
    { label: "가", value: "korean-2" },
    { label: "ㄱ", value: "korean" }
  ];
  const listOptions = [
    { label: "●", value: "circle-filled" },
    { label: "○", value: "circle-outline" },
    { label: "■", value: "square-filled" },
    { label: "□", value: "square-outline" },
    { label: "◆", value: "diamond-filled" },
    { label: "◇", value: "diamond-outline" },
    { label: "▶", value: "triangle-filled" },
    { label: "▷", value: "triangle-outline" },
    { label: "✦", value: "star-sharp" },
    { label: "⬢", value: "hexagon-filled" },
    { label: "⬡", value: "hexagon-outline" },
    { label: "✔", value: "check-mark" },
    { label: "∘", value: "ring" },
    { label: "∙", value: "bullet-small" },
    { label: "-", value: "dash" }
  ];

  const orderOptions = [
    { label: "1.", value: "decimal-dot" },
    { label: "1)", value: "decimal-paren" },
    { label: "I.", value: "upper-roman-dot" },
    { label: "I)", value: "upper-roman-paren" },
    { label: "i.", value: "lower-roman-dot" },
    { label: "i)", value: "lower-roman-paren" },
    { label: "A.", value: "upper-alpha-dot" },
    { label: "A)", value: "upper-alpha-paren" },
    { label: "a.", value: "lower-alpha-dot" },
    { label: "a)", value: "lower-alpha-paren" },
    { label: "ㄱ.", value: "korean-dot" },
    { label: "ㄱ)", value: "korean-paren" },
    { label: "가.", value: "korean-2-dot" },
    { label: "가)", value: "korean-2-paren" }
  ];

  return (
    <Modal
      open={docSettingModalOpen}
      onClose={() => setDocSettingModalOpen(false)}
      className="max-h-[80vh] overflow-y-auto"
      style={withOverlayShadow({ maxWidth: "90vw" }, isDarkMode)}
    >
      {isSaving && <SettingsSavingIndicator />}
      {!isSaving && localDocSetting && localBulletStyle && (
        <div className="flex flex-col gap-5 h-full">
          <div className="flex items-center gap-2">
            <SettingOutline size={25} />
            <Typography as="h1" pretendard="B" size="xl">
              설정
            </Typography>
          </div>
          {/* 문서 설정 */}

          <>
            <div className="flex justify-center">
              <Typography as="h2" pretendard="B" size="lg">
                문서 설정
              </Typography>
            </div>

            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div
                  onMouseDown={(event) => {
                    if (event.target.tagName !== "INPUT") {
                      event.preventDefault();
                    }
                  }}
                >
                  <Input
                    label="문서 가로"
                    {...themedInputProps}
                    value={localDocSetting.pageWidth}
                    suffix="mm"
                    onChange={(e) => handleChange("pageWidth", e.target.value)}
                  />
                </div>
                <div
                  onMouseDown={(event) => {
                    if (event.target.tagName !== "INPUT") {
                      event.preventDefault();
                    }
                  }}
                >
                  <Input
                    label="문서 세로"
                    {...themedInputProps}
                    name="pageHeight"
                    suffix="mm"
                    value={localDocSetting.pageHeight}
                    onChange={(e) => handleChange("pageHeight", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div
                onMouseDown={(event) => {
                  if (event.target.tagName !== "INPUT") {
                    event.preventDefault();
                  }
                }}
              >
                <Input
                  label="상단 여백"
                  {...themedInputProps}
                  name="paddingTop"
                  suffix="mm"
                  value={localDocSetting.paddingTop}
                  onChange={(e) => handleChange("paddingTop", e.target.value)}
                />
              </div>
              <div
                onMouseDown={(event) => {
                  if (event.target.tagName !== "INPUT") {
                    event.preventDefault();
                  }
                }}
              >
                <Input
                  label="하단 여백"
                  {...themedInputProps}
                  name="paddingBottom"
                  suffix="mm"
                  value={localDocSetting.paddingBottom}
                  onChange={(e) =>
                    handleChange("paddingBottom", e.target.value)
                  }
                />
              </div>
              <div
                onMouseDown={(event) => {
                  if (event.target.tagName !== "INPUT") {
                    event.preventDefault();
                  }
                }}
              >
                <Input
                  label="왼쪽 여백"
                  {...themedInputProps}
                  name="paddingLeft"
                  suffix="mm"
                  value={localDocSetting.paddingLeft}
                  onChange={(e) => handleChange("paddingLeft", e.target.value)}
                />
              </div>
              <div
                onMouseDown={(event) => {
                  if (event.target.tagName !== "INPUT") {
                    event.preventDefault();
                  }
                }}
              >
                <Input
                  label="오른쪽 여백"
                  {...themedInputProps}
                  name="paddingRight"
                  suffix="mm"
                  value={localDocSetting.paddingRight}
                  onChange={(e) => handleChange("paddingRight", e.target.value)}
                />
              </div>
            </div>
          </>
          <Divider style={{ margin: 0 }} />
          {/*  줄 간격 */}
          <div className="flex gap-4 w-full items-center justify-between">
            <div className="flex-shrink-0">
              <Typography as="p" size="sm" pretendard="B">
                줄 간격
              </Typography>
            </div>
            <Slider
              label="줄 간격"
              value={localDocSetting.lineHeight * 100}
              onChange={(value) => handleChange("lineHeight", value / 100)}
              min={0}
              max={300}
              step={10}
              width="100%"
              popupProps={{ open: false }}
              background={setting.theme}
            />
            <div className="flex-shrink-0">
              <Typography as="p" size="sm" pretendard="B">
                {localDocSetting.lineHeight}
              </Typography>
            </div>
          </div>
          <Divider style={{ margin: 0 }} />
          {/* 글머리 기호 설정 */}
          <>
            <div className="flex flex-col gap-2">
              <div className="flex justify-center">
                <Typography as="h2" pretendard="B" size="lg">
                  글머리 기호 설정
                </Typography>
              </div>
              {/* 제목 */}
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div className="flex flex-col gap-2" key={n}>
                    <Typography as="p" size="sm" pretendard="B">
                      제목 {n}(H{n})
                    </Typography>
                    <div
                      className="flex flex-wrap gap-2"
                      onMouseDown={(event) => event.preventDefault()}
                    >
                      <Select
                        {...themedSelectProps}
                        options={bulletOptions}
                        placeholder="번호 스타일"
                        onChange={(value) =>
                          handleBulletStyleChange(`h${n}`, value)
                        }
                        value={localBulletStyle[`h${n}`]}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {/* 리스트 */}
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className="flex flex-col gap-2" key={index}>
                    <Typography as="p" size="sm" pretendard="B">
                      리스트 {index + 1}
                    </Typography>
                    <div
                      className="flex flex-wrap gap-2"
                      onMouseDown={(event) => event.preventDefault()}
                    >
                      <Select
                        {...themedSelectProps}
                        options={listOptions}
                        placeholder="스타일"
                        onChange={(value) =>
                          handleBulletStyleChange(`list-${index + 1}`, value)
                        }
                        value={localBulletStyle[`list-${index + 1}`]}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className="flex flex-col gap-2" key={index}>
                    <Typography as="p" size="sm" pretendard="B">
                      번호 {index + 1}
                    </Typography>
                    <div
                      className="flex flex-wrap gap-2"
                      onMouseDown={(event) => event.preventDefault()}
                    >
                      <Select
                        {...themedSelectProps}
                        options={orderOptions}
                        placeholder="스타일"
                        onChange={(value) =>
                          handleBulletStyleChange(
                            `order-list-${index + 1}`,
                            value
                          )
                        }
                        value={localBulletStyle[`order-list-${index + 1}`]}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>

          <div className="flex gap-2 justify-center">
            <Button
              background={setting.theme}
              color={`${setting.theme}-1`}
              border={false}
              size="sm"
              {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
              onClick={async () => {
                setIsSaving(true);
                // 로컬 상태를 컨텍스트에 반영
                setDocSetting(localDocSetting);
                setBulletStyle(localBulletStyle);
                const result = await saveDocument(
                  document._id,
                  {
                    docSetting: localDocSetting,
                    bulletStyle: localBulletStyle
                  },
                  true
                );
                if (result) {
                  setDocSettingModalOpen(false);
                  await loadDocument(document._id);
                  setIsSaving(false);
                }
              }}
            >
              저장
            </Button>
            <Button
              onClick={() => {
                setDocSettingModalOpen(false);
              }}
              size="sm"
              border={false}
              {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
              color="white-1"
              background="white-10"
            >
              취소
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
