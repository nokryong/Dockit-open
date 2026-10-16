import Template from "./DrawerTemplate";
import { Div, Input, Typography } from "sud-ui";

import { MdKeyboardCommandKey, MdStyle } from "react-icons/md";
import { HiDocumentSearch } from "react-icons/hi";
import { usePanels } from "@/app/LIB/context/PanelContext";
import { useSetting } from "@/app/LIB/context/SettingContext";
import { TbApps, TbChartDotsFilled, TbCalculator, TbDice, TbFileSpreadsheet, TbEdit, TbMath, TbMathSymbols, TbNote, TbSearch, TbTool, TbChevronDown } from "react-icons/tb";
import { PiListNumbersFill } from "react-icons/pi";
import { CalendarOutline, TimerOutline } from "sud-icons";
import { BsMusicPlayerFill } from "react-icons/bs";
import { RiAiGenerate2, RiFilePaper2Line } from "react-icons/ri";
import { VscOpenai } from "react-icons/vsc";
import { useEffect, useMemo, useState } from "react";
import { Hanja } from "@/app/LIB/constant/icons";
import { inputProps, newShadowDarkSm, newShadowLightSm } from "@/app/LIB/constant/uiProps";
import { useDarkMode } from "@/app/LIB/context/DarkModeContext";
import { WIDGET_DRAWER_GROUPS } from "@/app/LIB/constant/widgetGroups";

const WIDGET_ICON_COMPONENTS = {
  aiGenerate: RiAiGenerate2,
  aiChat: VscOpenai,
  apps: TbApps,
  calculator: TbCalculator,
  calendar: CalendarOutline,
  chartDots: TbChartDotsFilled,
  command: MdKeyboardCommandKey,
  dice: TbDice,
  documentSearch: HiDocumentSearch,
  edit: TbEdit,
  filePaper: RiFilePaper2Line,
  hanja: Hanja,
  listNumbers: PiListNumbersFill,
  math: TbMath,
  mathSymbols: TbMathSymbols,
  music: BsMusicPlayerFill,
  note: TbNote,
  search: TbSearch,
  spreadsheet: TbFileSpreadsheet,
  style: MdStyle,
  timer: TimerOutline,
  tool: TbTool,
};

const attachWidgetIcons = (group) => ({
  ...group,
  icon: WIDGET_ICON_COMPONENTS[group.iconKey] || TbApps,
  items: group.items.map((item) => ({
    ...item,
    icon: WIDGET_ICON_COMPONENTS[item.iconKey] || TbApps,
  })),
});

export default function WidgetDrawer({
  openWidgetDrawer,
  setOpenWidgetDrawer,
}) {
  const { left, right, toggle, setLeft, remove } = usePanels();
  const { setting } = useSetting();
  const { isDarkMode, currentColors } = useDarkMode();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedGroups, setExpandedGroups] = useState({});
  const activeWidgetIds = useMemo(
    () => new Set([...left, ...right]),
    [left, right],
  );
  const themeScale = currentColors?.[setting.theme] || currentColors?.mint;

  const widgetGroups = useMemo(
    () => WIDGET_DRAWER_GROUPS.map(attachWidgetIcons),
    [],
  );

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!normalizedSearch) return widgetGroups;

    return widgetGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          item.title.toLowerCase().includes(normalizedSearch),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [normalizedSearch, widgetGroups]);

  const activeWidgets = useMemo(
    () =>
      widgetGroups
        .flatMap((group) => group.items)
        .filter((item) => activeWidgetIds.has(item.id))
        .slice(0, 4),
    [activeWidgetIds, widgetGroups],
  );

  const registerWidget = (type) => {
    toggle(type);
  };

  const renderWidgetItem = (item) => {
    const Icon = item.icon;
    const isRegistered = activeWidgetIds.has(item.id);
    const activeTextColor = themeScale?.[1] || "#ffffff";
    const inactiveSurface = isDarkMode ? "rgba(39, 39, 42, 0.56)" : "#ffffff";

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => registerWidget(item.id)}
        className="flex h-11 min-w-0 items-center gap-2.5 rounded-lg border-0 px-3 text-left transition-all duration-200 hover:translate-y-[-1px]"
        style={{
          background: isRegistered ? themeScale?.[7] : inactiveSurface,
          ...(isDarkMode ? newShadowDarkSm : newShadowLightSm).style,
        }}
      >
        <span
          className="flex size-7 shrink-0 items-center justify-center"
          style={{ color: isRegistered ? activeTextColor : themeScale?.[7] }}
        >
          <Icon size={18} />
        </span>
        <Typography
          pretendard="SB"
          size="sm"
          className="truncate"
          style={{
            color: isRegistered ? activeTextColor : undefined,
            fontSize: "14px",
            lineHeight: 1.35,
          }}
        >
          {item.title}
        </Typography>
      </button>
    );
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const isCtrlOrCmd = event.metaKey || event.ctrlKey;

      if (isCtrlOrCmd && event.key.toLowerCase() === "f") {
        event.preventDefault();

        const widgetType = "findAndReplace";
        const isExist = left.includes(widgetType) || right.includes(widgetType);

        if (isExist) {
          remove(widgetType);
        } else {
          setLeft((prev) => [widgetType, ...prev]);
        }
      }

      if (event.key === "HanjaMode") {
        event.preventDefault();
        const widgetType = "hanjaPanel";
        const isExist = left.includes(widgetType) || right.includes(widgetType);
        if (!isExist) {
          setLeft((prev) => [widgetType, ...prev]);
        }
      }


    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [left, right, setLeft, remove]);

  return (
    <Template
      open={openWidgetDrawer}
      onClose={() => setOpenWidgetDrawer(false)}
      title="툴킷"
      content={
        <div className="flex flex-col gap-5">
          <Input
            {...inputProps}
            size="md"
            value={searchTerm}
            background={`${setting.theme}-1`}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="도구 검색"
          />

          {activeWidgets.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Typography pretendard="SB" size="md">
                  현재 사용
                </Typography>
                <Typography size="sm" color="cool-gray-7">
                  {activeWidgets.length}
                </Typography>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {activeWidgets.map(renderWidgetItem)}
              </div>
            </section>
          )}

          {filteredGroups.length === 0 ? (
            <div
              role="status"
              className="rounded-lg border border-zinc-200/80 px-4 py-6 text-center dark:border-zinc-800"
            >
              <Typography className="text-pretty" size="sm" color="cool-gray-7">
                일치하는 도구가 없습니다. 다른 이름으로 검색해 보세요.
              </Typography>
            </div>
          ) : (
            filteredGroups.map((group) => {
              const Icon = group.icon;
              const expanded =
                Boolean(normalizedSearch) ||
                (expandedGroups[group.id] ?? Boolean(group.defaultExpanded));

              return (
                <section key={group.id} className="flex flex-col gap-3">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`widget-tier-${group.id}`}
                    onClick={() =>
                      setExpandedGroups((prev) => ({
                        ...prev,
                        [group.id]: !(
                          prev[group.id] ?? Boolean(group.defaultExpanded)
                        ),
                      }))
                    }
                    className="flex items-center justify-between border-none bg-transparent p-0 text-left"
                  >
                    <span className="flex items-center gap-2">
                      <Div color={`${setting.theme}-7`}>
                        <Icon size={20} />
                      </Div>
                      <Typography
                        pretendard="SB"
                        size="md"
                        style={{ fontSize: "15px", lineHeight: 1.4 }}
                      >
                        {group.title}
                      </Typography>
                      <Typography size="sm" color="cool-gray-7">
                        {group.items.length}
                      </Typography>
                    </span>
                    <TbChevronDown
                      size={16}
                      style={{
                        transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
                        transition: "transform 0.2s ease",
                      }}
                    />
                  </button>

                  {expanded && (
                    <div
                      id={`widget-tier-${group.id}`}
                      className="grid grid-cols-2 gap-2.5"
                    >
                      {group.items.map(renderWidgetItem)}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      }
    />
  );
}
