"use client";

import { Input, Typography } from "sud-ui";
import { TbChevronDown, TbChevronRight } from "react-icons/tb";
import LoadingComponent from "../commonComponent/LoadingComponent";
import { inputProps } from "../../../constant/uiProps";
import { formatReferenceDocumentLabel } from "./referenceDocUtils";

export default function ReferenceDocList({
  documents,
  filteredDocuments,
  isListCollapsed,
  onToggleCollapsed,
  searchTerm,
  onSearchTermChange,
  selectedDocId,
  onSelectDocument,
  setting,
  themeColors,
  treeLoading
}) {
  return (
    <div className="w-full flex flex-col gap-2">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="w-full border-none cursor-pointer rounded-xl px-2.5 py-2.5 flex items-center justify-between"
        style={{
          background: themeColors[6]
        }}
      >
        <div className="flex items-center gap-2">
          {isListCollapsed ? (
            <TbChevronRight size={16} color={themeColors[1]} />
          ) : (
            <TbChevronDown size={16} color={themeColors[1]} />
          )}
          <Typography pretendard="SB" size="sm" color="white-10">
            문서 목록
          </Typography>
        </div>
        <Typography size="xs" color="cool-gray-2">
          총 {documents.length}개
        </Typography>
      </button>

      {!isListCollapsed && (
        <>
          <Input
            {...inputProps}
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="다른 문서 검색"
            background={`${setting.theme}-1`}
          />

          <div
            className="flex flex-col gap-2 overflow-y-auto"
            style={{ maxHeight: "168px", paddingRight: "4px" }}
          >
            {treeLoading && documents.length === 0 ? (
              <div
                className="flex justify-center items-center"
                style={{ minHeight: "120px" }}
              >
                <LoadingComponent />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="flex flex-col gap-2 py-5 items-center justify-center">
                <Typography size="sm" color="cool-gray-7">
                  {documents.length === 0
                    ? "참고할 다른 문서가 없습니다."
                    : "검색 결과가 없습니다."}
                </Typography>
              </div>
            ) : (
              filteredDocuments.map((item) => {
                const isActive = item._id === selectedDocId;
                const label = formatReferenceDocumentLabel(item);

                return (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => onSelectDocument(item._id)}
                    className="w-full border-none cursor-pointer text-left rounded-xl px-2.5 py-3"
                    style={{
                      background: isActive ? themeColors[9] : themeColors[2]
                    }}
                    title={label}
                  >
                    <Typography
                      pretendard="SB"
                      size="sm"
                      color={isActive ? `${setting.theme}-1` : "white-1"}
                      style={{
                        lineHeight: 1.35,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {label}
                    </Typography>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
