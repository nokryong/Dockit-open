import WidgetCard from "./WidgetCard";
import { PiImageFill, PiListNumbersFill, PiTableFill } from "react-icons/pi";
import { RiBarChartFill } from "react-icons/ri";
import { Div, Tabs, Typography } from "sud-ui";
import { useDocument } from "../../context/DocumentContext";
import { useSetting } from "../../context/SettingContext";
import { useEffect, useMemo, useState } from "react";
import { GoTriangleDown, GoTriangleUp } from "react-icons/go";
import {
  CAPTION_PLACEHOLDER_TEXT,
  normalizeCaptionTargetGroup,
  normalizeCaptionTargetType
} from "../../utils/captionUtils";

const counterStyleMap = {
  decimal: "decimal",
  "upper-roman": "upper-roman",
  "lower-roman": "lower-roman",
  "upper-alpha": "upper-alpha",
  "lower-alpha": "lower-alpha",
  korean: "hangul-consonant",
  "korean-2": "hangul"
};

const TOC_TAB_CONFIGS = [
  {
    key: "heading",
    label: "문서",
    icon: PiListNumbersFill,
    emptyText: "문서 목차가 없습니다"
  },
  {
    key: "image",
    label: "그림",
    icon: PiImageFill,
    emptyText: "그림 목차가 없습니다"
  },
  {
    key: "table",
    label: "표",
    icon: PiTableFill,
    emptyText: "표 목차가 없습니다"
  },
  {
    key: "chartBlock",
    label: "차트",
    icon: RiBarChartFill,
    emptyText: "차트 목차가 없습니다"
  },
];

const toRoman = (num) => {
  const values = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const symbols = [
    "M",
    "CM",
    "D",
    "CD",
    "C",
    "XC",
    "L",
    "XL",
    "X",
    "IX",
    "V",
    "IV",
    "I"
  ];
  let result = "";
  let remaining = num;

  for (let index = 0; index < values.length; index += 1) {
    while (remaining >= values[index]) {
      result += symbols[index];
      remaining -= values[index];
    }
  }

  return result;
};

const formatNumber = (num, style) => {
  switch (style) {
    case "decimal":
      return num.toString();
    case "upper-roman":
      return toRoman(num).toUpperCase();
    case "lower-roman":
      return toRoman(num).toLowerCase();
    case "upper-alpha":
      return String.fromCharCode(64 + num);
    case "lower-alpha":
      return String.fromCharCode(96 + num);
    case "hangul-consonant": {
      const consonants = [
        "ㄱ",
        "ㄴ",
        "ㄷ",
        "ㄹ",
        "ㅁ",
        "ㅂ",
        "ㅅ",
        "ㅇ",
        "ㅈ",
        "ㅊ",
        "ㅋ",
        "ㅌ",
        "ㅍ",
        "ㅎ"
      ];

      return consonants[(num - 1) % consonants.length];
    }
    case "hangul": {
      const syllables = [
        "가",
        "나",
        "다",
        "라",
        "마",
        "바",
        "사",
        "아",
        "자",
        "차",
        "카",
        "타",
        "파",
        "하"
      ];

      return syllables[(num - 1) % syllables.length];
    }
    default:
      return num.toString();
  }
};

const escapeSelectorValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, "\\$&");
};

export const buildHeadingEntriesFromHtml = (html, bulletStyle) => {
  if (!html) {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const nodes = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6"));
  const counters = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  const headingNumbers = {
    h1: "",
    h2: "",
    h3: "",
    h4: "",
    h5: ""
  };
  let currentH1Id = null;
  let currentH2Id = null;

  return nodes.map((node) => {
    const level = parseInt(node.tagName.replace("H", ""), 10);
    const levelKey = `h${level}`;

    counters[levelKey] += 1;

    if (level === 1) {
      counters.h2 = 0;
      counters.h3 = 0;
      counters.h4 = 0;
      counters.h5 = 0;
      counters.h6 = 0;
    } else if (level === 2) {
      counters.h3 = 0;
      counters.h4 = 0;
      counters.h5 = 0;
      counters.h6 = 0;
    } else if (level === 3) {
      counters.h4 = 0;
      counters.h5 = 0;
      counters.h6 = 0;
    } else if (level === 4) {
      counters.h5 = 0;
      counters.h6 = 0;
    } else if (level === 5) {
      counters.h6 = 0;
    }

    const styleKey = bulletStyle?.[levelKey];
    const cssStyle = counterStyleMap[styleKey] || "decimal";
    let number = "";

    if (level === 1) {
      number = formatNumber(counters.h1, cssStyle);
      headingNumbers.h1 = number;
      currentH1Id = node.id || `heading-${level}-${counters[levelKey]}`;
      currentH2Id = null;
    } else if (level === 2) {
      const h2Formatted = formatNumber(counters.h2, cssStyle);
      number = `${headingNumbers.h1}.${h2Formatted}`;
      headingNumbers.h2 = number;
      currentH2Id = node.id || `heading-${level}-${counters[levelKey]}`;
    } else if (level === 3) {
      const h3Formatted = formatNumber(counters.h3, cssStyle);
      number = `${headingNumbers.h2}.${h3Formatted}`;
      headingNumbers.h3 = number;
    } else if (level === 4) {
      const h4Formatted = formatNumber(counters.h4, cssStyle);
      number = `${headingNumbers.h3}.${h4Formatted}`;
      headingNumbers.h4 = number;
    } else if (level === 5) {
      const h5Formatted = formatNumber(counters.h5, cssStyle);
      number = `${headingNumbers.h4}.${h5Formatted}`;
      headingNumbers.h5 = number;
    } else if (level === 6) {
      const h6Formatted = formatNumber(counters.h6, cssStyle);
      number = `${headingNumbers.h5}.${h6Formatted}`;
    }

    return {
      level,
      number,
      text: node.textContent?.trim() || "",
      id: node.id || `heading-${level}-${counters[levelKey]}`,
      parentH1Id: level === 1 ? null : currentH1Id,
      parentH2Id: level <= 2 ? null : currentH2Id
    };
  });
};

export const buildCaptionEntriesFromHtml = (html) => {
  if (!html) {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const captionNodes = Array.from(
    doc.querySelectorAll('div[data-caption-block="true"]')
  );

  return captionNodes
    .map((node, index) => {
      const targetType = normalizeCaptionTargetType(
        node.getAttribute("data-target-type")
      );
      const targetGroup = normalizeCaptionTargetGroup(targetType);
      const targetId = node.getAttribute("data-target-id") || null;

      if (!targetType || !targetGroup || !targetId) {
        return null;
      }

      const contentElement =
        node.querySelector(".caption-block-content") || node;
      const numberText = node.getAttribute("data-caption-number") || "";
      const rawText =
        contentElement.textContent?.replace(/\u200B/g, "").trim() || "";
      const text = rawText === CAPTION_PLACEHOLDER_TEXT ? "" : rawText;

      return {
        id: `${targetGroup}-${targetId}-${index}`,
        targetType,
        targetGroup,
        targetId,
        numberText,
        text: text || "빈 캡션"
      };
    })
    .filter(Boolean);
};

const renderTabLabel = (setting, tabConfig, count) => {
  const Icon = tabConfig.icon;

  return (
    <div className="flex items-center gap-1">
      <Icon size={14} />
      <Typography size="sm" pretendard="SB">
        {tabConfig.label}
      </Typography>
      <Typography size="xs" color={`${setting.theme}-5`}>
        {count}
      </Typography>
    </div>
  );
};

export default function TableOfContentsPanel({ dragHandleProps }) {
  const { content, bulletStyle } = useDocument();
  const { setting } = useSetting();
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [activeTab, setActiveTab] = useState("heading");
  const [finalContent, setFinalContent] = useState(null);
  const [finalBulletStyle, setFinalBulletStyle] = useState(null);

  const toggleCollapse = (id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  useEffect(() => {
    if (content && bulletStyle) {
      setFinalContent(content);
      setFinalBulletStyle(bulletStyle);
      return;
    }

    setFinalContent(null);
    setFinalBulletStyle(null);
  }, [content, bulletStyle]);

  const headingEntries = useMemo(() => {
    try {
      return buildHeadingEntriesFromHtml(finalContent, finalBulletStyle);
    } catch (error) {
      console.error("문서 목차 파싱 실패:", error);
      return [];
    }
  }, [finalContent, finalBulletStyle]);

  const captionEntries = useMemo(() => {
    try {
      return buildCaptionEntriesFromHtml(finalContent);
    } catch (error) {
      console.error("캡션 목차 파싱 실패:", error);
      return [];
    }
  }, [finalContent]);

  const captionEntriesByType = useMemo(
    () =>
      captionEntries.reduce((accumulator, entry) => {
        if (!accumulator[entry.targetGroup]) {
          accumulator[entry.targetGroup] = [];
        }

        accumulator[entry.targetGroup].push(entry);
        return accumulator;
      }, {}),
    [captionEntries]
  );

  const headingContent = (
    <>
      {headingEntries.length === 0 ? (
        <div className="flex justify-center py-5">
          <Typography color={"cool-gray-7"}>문서 목차가 없습니다</Typography>
        </div>
      ) : (
        <Div
          className="w-full rounded-xl p-5"
          background={`${setting.theme}-1`}
        >
          <Typography as="div">
            <ul style={{ listStyle: "none", paddingLeft: 0, margin: 0 }}>
              {headingEntries.map((heading, index) => {
                const isHiddenByH1 =
                  heading.level > 1 &&
                  heading.parentH1Id &&
                  collapsedIds.has(heading.parentH1Id);
                const isHiddenByH2 =
                  heading.level > 2 &&
                  heading.parentH2Id &&
                  collapsedIds.has(heading.parentH2Id);
                const isHidden = isHiddenByH1 || isHiddenByH2;

                let hasChild = false;
                for (
                  let nextIndex = index + 1;
                  nextIndex < headingEntries.length;
                  nextIndex += 1
                ) {
                  if (headingEntries[nextIndex].level <= heading.level) {
                    break;
                  }

                  hasChild = true;
                  break;
                }

                const isCollapsible = heading.level <= 2 && hasChild;
                const isCollapsed = collapsedIds.has(heading.id);

                return (
                  <li
                    key={heading.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginLeft: (heading.level - 1) * 10,
                      marginBottom: isHidden ? 0 : "4px",
                      cursor: "pointer",
                      maxHeight: isHidden ? 0 : 200,
                      opacity: isHidden ? 0 : 1,
                      overflow: "hidden",
                      pointerEvents: isHidden ? "none" : "auto",
                      transition:
                        "max-height 0.2s ease, opacity 0.2s ease, margin 0.2s ease"
                    }}
                    aria-hidden={isHidden}
                    onClick={() => {
                      let element = window.document.getElementById(heading.id);

                      if (!element) {
                        const headingNodes = window.document.querySelectorAll(
                          "h1, h2, h3, h4, h5, h6"
                        );
                        element = Array.from(headingNodes).find(
                          (headingNode) =>
                            headingNode.textContent?.trim() ===
                            heading.text.trim()
                        );
                      }

                      if (!element) {
                        console.warn("요소를 찾을 수 없습니다:", heading.id);
                        return;
                      }

                      setTimeout(() => {
                        element.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                          inline: "nearest"
                        });
                      }, 20);
                    }}
                  >
                    {isCollapsible ? (
                      <Typography
                        as="span"
                        size="sm"
                        style={{ marginRight: "4px", cursor: "pointer" }}
                        color={`${setting.theme}-7`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleCollapse(heading.id);
                        }}
                      >
                        {isCollapsed ? <GoTriangleDown /> : <GoTriangleUp />}
                      </Typography>
                    ) : (
                      <Typography
                        as="span"
                        size="xs"
                        style={{ marginRight: "8px" }}
                      />
                    )}
                    <Typography
                      as="span"
                      pretendard="SB"
                      style={{ marginRight: "4px" }}
                    >
                      {heading.number}.
                    </Typography>
                    <Typography as="span">{heading.text}</Typography>
                  </li>
                );
              })}
            </ul>
          </Typography>
        </Div>
      )}
    </>
  );

  const renderCaptionContent = (targetType) => {
    const entries = captionEntriesByType[targetType] || [];
    const tabConfig = TOC_TAB_CONFIGS.find((tab) => tab.key === targetType);

    if (entries.length === 0) {
      return (
        <div className="flex justify-center py-5">
          <Typography color={"cool-gray-7"}>
            {tabConfig?.emptyText || "캡션 목차가 없습니다"}
          </Typography>
        </div>
      );
    }

    return (
      <Div className="w-full rounded-xl p-5" background={`${setting.theme}-1`}>
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer text-left"
              onClick={() => {
                const selector = `[data-caption-block="true"][data-target-id="${escapeSelectorValue(
                  entry.targetId
                )}"]`;
                const element = window.document.querySelector(selector);

                if (!(element instanceof Element)) {
                  console.warn("캡션 요소를 찾을 수 없습니다:", entry.targetId);
                  return;
                }

                setTimeout(() => {
                  element.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                    inline: "nearest"
                  });
                }, 20);
              }}
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <Typography
                  as="span"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "220px"
                  }}
                >
                  {entry.numberText ? (
                    <>
                      <Typography as="span" pretendard="SB">
                        {entry.numberText}
                      </Typography>{" "}
                      <span>{entry.text}</span>
                    </>
                  ) : (
                    entry.text
                  )}
                </Typography>
              </div>
            </button>
          ))}
        </div>
      </Div>
    );
  };

  const tabOptions = TOC_TAB_CONFIGS.map((tabConfig) => {
    const count =
      tabConfig.key === "heading"
        ? headingEntries.length
        : (captionEntriesByType[tabConfig.key] || []).length;

    return {
      key: tabConfig.key,
      label: renderTabLabel(setting, tabConfig, count),
      children:
        tabConfig.key === "heading"
          ? headingContent
          : renderCaptionContent(tabConfig.key)
    };
  });

  return (
    <WidgetCard
      icon={PiListNumbersFill}
      title="목차"
      dragHandleProps={dragHandleProps}
      widgetType="index"
    >
      <div className="w-full flex flex-col gap-2 max-h-[350px] overflow-y-auto">
        <Tabs
          options={tabOptions}
          value={activeTab}
          onChange={(value) => setActiveTab(value)}
          size="sm"
          className="w-full"
          border={false}
          colorType={{ active: "text", inactive: "text" }}
          color={{
            active: `${setting.theme}-7`,
            inactive: "cool-gray-5"
          }}
          background={{
            active: "transparent",
            inactive: "transparent"
          }}
        />
      </div>
    </WidgetCard>
  );
}
