import { useState } from "react";
import { usePathname } from "@/desktop/navigation";
import { Div, Input, Typography } from "sud-ui";
import WidgetCard from "../WidgetCard";
import { Search } from "sud-icons";
import { inputProps } from "@/app/LIB/constant/uiProps";
import { useContent } from "@/app/LIB/context/ContentContext";
import { IoClose } from "react-icons/io5";
import { useSetting } from "@/app/LIB/context/SettingContext";
import { PiGridFourBold, PiListBulletsBold } from "react-icons/pi";
import { useDarkMode } from "@/app/LIB/context/DarkModeContext";

export default function SearchDoc({ dragHandleProps }) {
  const { setting, saveSetting } = useSetting();
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearch, setIsSearch] = useState(false);
  const pathname = usePathname();
  const isDocsWorkspaceRoute = pathname === "/docs";
  const orderType = setting?.workspaceOrderType || "created_at";
  const isAscending = setting?.workspaceIsAscending ?? true;
  const viewMode = setting?.workspaceViewMode || "list";
  const { currentColors } = useDarkMode();
  const themeScale = currentColors?.[setting.theme] || currentColors?.mint;
  const activeBorderColor = themeScale?.[4] || "rgba(0,0,0,0.16)";
  const activeSurfaceColor = themeScale?.[1] || "rgba(0,0,0,0.04)";

  const { fetchWorkspaceContent, currentFolderId } =
    useContent();

  const handleSearch = () => {
    setIsSearch(true);
    fetchWorkspaceContent(currentFolderId, searchTerm.trim() || null);
  };

  const handleClearSearch = () => {
    setIsSearch(false);
    setSearchTerm("");
    fetchWorkspaceContent(currentFolderId, null);
  };

  const handleSortChange = (value) => {
    const nextIsAscending = value === orderType ? !isAscending : true;

    saveSetting({
      ...setting,
      workspaceOrderType: value,
      workspaceIsAscending: nextIsAscending
    });
  };

  const handleViewModeChange = (nextViewMode) => {
    if (nextViewMode === viewMode) return;

    saveSetting({
      ...setting,
      workspaceViewMode: nextViewMode
    });
  };

  const sortOptions = [
    { value: "updated_at", label: "최근 수정순" },
    { value: "created_at", label: "생성일순" },
    { value: "title", label: "제목순" }
  ];

  const renderSortButton = (option) => {
    const active = orderType === option.value;

    return (
      <button
        key={option.value}
        type="button"
        onClick={() => handleSortChange(option.value)}
        className="flex h-10 w-full items-center justify-between rounded-lg border px-3 text-left transition-all duration-200 hover:translate-y-[-1px]"
        style={{
          borderColor: active ? activeBorderColor : "rgba(0,0,0,0.08)",
          background: active ? activeSurfaceColor : "transparent"
        }}
      >
        <Typography
          pretendard={active ? "SB" : "R"}
          size="sm"
          color={active ? `${setting.theme}-8` : "cool-gray-7"}
        >
          {option.label}
        </Typography>
        {active && (
          <Typography size="xs" color={`${setting.theme}-7`}>
            {isAscending ? "오름차순" : "내림차순"}
          </Typography>
        )}
      </button>
    );
  };

  if (isDocsWorkspaceRoute) {
    return (
      <div className="flex w-full flex-col gap-6">
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Div color={`${setting.theme}-7`}>
              <Search size={18} />
            </Div>
            <Typography pretendard="SB" size="sm" color="white-1">
              제목으로 검색
            </Typography>
          </div>
          <Input
            {...inputProps}
            value={searchTerm}
            suffix={
              isSearch && (
                <Div className="cursor-pointer" onClick={handleClearSearch}>
                  <IoClose />
                </Div>
              )
            }
            background={`${setting.theme}-1`}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="제목 검색"
            onEnter={handleSearch}
          />
        </section>

        <section className="flex flex-col gap-3">
          <Typography pretendard="SB" size="sm" color="white-1">
            정렬 옵션
          </Typography>
          <div className="flex flex-col gap-2">
            {sortOptions.map(renderSortButton)}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <Typography pretendard="SB" size="sm" color="white-1">
            보기 방식
          </Typography>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "grid", label: "그리드", icon: PiGridFourBold },
              { value: "list", label: "목록", icon: PiListBulletsBold }
            ].map((option) => {
              const Icon = option.icon;
              const active = viewMode === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleViewModeChange(option.value)}
                  className="flex h-10 items-center justify-center gap-2 rounded-lg border transition-all duration-200 hover:translate-y-[-1px]"
                  style={{
                    borderColor: active
                      ? activeBorderColor
                      : "rgba(0,0,0,0.08)",
                    background: active ? activeSurfaceColor : "transparent"
                  }}
                >
                  <Div color={active ? `${setting.theme}-8` : "cool-gray-7"}>
                    <Icon size={17} />
                  </Div>
                  <Typography
                    pretendard={active ? "SB" : "R"}
                    size="sm"
                    color={active ? `${setting.theme}-8` : "cool-gray-7"}
                  >
                    {option.label}
                  </Typography>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  return (
    <WidgetCard
      icon={Search}
      title="제목으로 검색"
      dragHandleProps={dragHandleProps}
      widgetType="searchDoc"
    >
      <div className="w-full flex flex-col gap-2">
        <Input
          {...inputProps}
          value={searchTerm}
          suffix={
            isSearch && (
              <Div className="cursor-pointer" onClick={handleClearSearch}>
                <IoClose />
              </Div>
            )
          }
          background={`${setting.theme}-1`}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="제목 검색"
          onEnter={handleSearch}
        />
      </div>
    </WidgetCard>
  );
}
