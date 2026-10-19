import { t as uiText, useI18n } from "../../i18n";
import { Button, Card, Input, Segmented, Typography } from "sud-ui";
import WidgetCard from "./WidgetCard";
import { useEditor } from "@/app/LIB/context/EditorContext";

import { hanjaList } from "../../constant/hanjaDictionary";
import { Hanja } from "@/app/LIB/constant/icons";
import {
  inputProps,
  newShadowDarkSm,
  newShadowLightSm
} from "../../constant/uiProps";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSetting } from "../../context/SettingContext";
import { useDarkMode } from "../../context/DarkModeContext";

export default function HanjaPanel({ dragHandleProps }) {
  useI18n();
  const { editor } = useEditor();
  const { setting } = useSetting();
  const { isDarkMode } = useDarkMode();
  const [searchTerm, setSearchTerm] = useState("");

  const [selectedHanja, setSelectedHanja] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchType, setSearchType] = useState("kor");
  const columns = 5;

  const updateSearchFromCursor = useCallback(() => {
    if (!editor) return;

    const { state } = editor;
    const { selection } = state;
    const { empty, from, to } = selection;

    let targetText = "";

    // 텍스트 추출
    if (!empty) {
      targetText = state.doc.textBetween(from, to, " ");
    } else {
      if (from > 1) {
        targetText = state.doc.textBetween(from - 1, from, " ");
      }
    }

    const trimmedText = targetText ? targetText.trim() : "";
    const len = trimmedText.length;

    // 텍스트가 없으면 리턴
    if (len === 0) return;

    // #조건별로 나누어 처리하는 부분
    if (len === 1) {
      // 1. 한 글자이고 한글인 경우 -> 음독(kor)
      if (/[가-힣]/.test(trimmedText)) {
        setSearchTerm(trimmedText);
        setSearchType("kor");
      }
      // 2. 한 글자이고 한자인 경우 -> 한자(hanja)
      else if (/[\u4E00-\u9FFF]/.test(trimmedText)) {
        setSearchTerm(trimmedText);
        setSearchType("hanja");
      }
      // 그 외 1글자(영어, 숫자 등)는 무시
    } else {
      // 3. 여러 글자이고 '순수 한글'인 경우 -> 뜻(meaning)
      // ^[가-힣]+$ : 처음부터 끝까지 한글로만 구성되었는지 확인
      if (/^[가-힣]+$/.test(trimmedText)) {
        setSearchTerm(trimmedText);
        setSearchType("meaning");
      }
      // 그 외(영어 포함, 숫자 포함 등)는 무시
    }
  }, [editor]);
  // 2. 초기 실행 및 키 이벤트 리스너 등록 (기존 useEffect 교체)
  useEffect(() => {
    // 패널 열릴 때 바로 실행
    updateSearchFromCursor();

    // 패널이 열린 상태에서 한자키 누르면 재실행
    const handleKeyDown = (event) => {
      if (event.key === "HanjaMode") {
        event.preventDefault();
        event.stopPropagation(); // 부모가 닫지 않게 방지
        updateSearchFromCursor();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [updateSearchFromCursor]);

  const filteredHanjaList = useMemo(() => {
    // 1. 검색어가 비어있으면 빈 배열 반환 (성능 최적화 핵심)
    if (!searchTerm || searchTerm.trim() === "") {
      return [];
    }

    // 2. 필터링 로직
    const filteredList = hanjaList.filter((item) => {
      if (searchType === "hanja") {
        return item.char.includes(searchTerm);
      } else if (searchType === "kor") {
        return item.meaning.some((meaning) => meaning.kor.includes(searchTerm));
      } else {
        return item.meaning.some((meaning) => meaning.def.includes(searchTerm));
      }
    });

    // 3. 청킹(Chunking) 로직
    const chunked = [];
    for (let i = 0; i < filteredList.length; i += columns) {
      chunked.push(filteredList.slice(i, i + columns));
    }
    return chunked;
  }, [searchTerm, searchType]); // 의존성 배열: 검색어, 타입 바뀔 때만 재연산
  const insertSpecialChar = (char) => {
    if (editor) {
      editor.chain().focus().insertContent(char).run();
    }
  };

  // 가상스크롤
  const virtualScroll = true;
  const itemHeight = 40;
  const overscanCount = 5;
  const rowGap = 10;

  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const itemRefs = useRef(new Map());

  // 패널 진입 시 키보드 입력을 받을 수 있도록 자동 포커스
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      containerRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // 컨테이너 높이 측정
  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerHeight(entry.contentRect.height);
        }
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  // 아이템 높이 측정
  const measureItemHeight = useCallback((index, element) => {
    if (element) {
      itemRefs.current.set(index, element.getBoundingClientRect().height);
    }
  }, []);

  const flatHanjaList = useMemo(
    () => filteredHanjaList.flat(),
    [filteredHanjaList]
  );

  useEffect(() => {
    if (flatHanjaList.length === 0) {
      // 리스트가 없으면 선택 해제
      if (selectedIndex !== -1) setSelectedIndex(-1);
      if (selectedHanja !== null) setSelectedHanja(null);
      return;
    }

    // 리스트는 있는데 선택된게 없거나 범위를 벗어난 경우 첫번째 선택
    if (selectedIndex < 0 || selectedIndex >= flatHanjaList.length) {
      setSelectedIndex(0);
      setSelectedHanja(flatHanjaList[0]);
    } else {
      // 인덱스는 그대로인데 내용물이 바뀐 경우 업데이트
      const current = flatHanjaList[selectedIndex];
      if (current && selectedHanja?.char !== current.char) {
        setSelectedHanja(current);
      }
    }
  }, [flatHanjaList, selectedHanja, selectedIndex]); // 의존성 줄임

  const { visibleItems, startIndex, totalHeight } = useMemo(() => {
    if (!virtualScroll || !containerHeight) {
      return {
        visibleItems: filteredHanjaList,
        startIndex: 0,
        endIndex: filteredHanjaList.length,
        totalHeight: 0
      };
    }

    let currentHeight = 0;
    let startIndex = 0;
    let endIndex = 0;
    let foundStart = false;

    // filteredHanjaList 길이가 0이면 바로 리턴
    if (filteredHanjaList.length === 0) {
      return { visibleItems: [], startIndex: 0, endIndex: 0, totalHeight: 0 };
    }

    for (let i = 0; i < filteredHanjaList.length; i++) {
      const rowHeight = itemRefs.current.get(i) || itemHeight;
      if (!foundStart && currentHeight + rowHeight > scrollTop) {
        startIndex = Math.max(0, i - overscanCount);
        foundStart = true;
      }
      if (foundStart && currentHeight > scrollTop + containerHeight) {
        endIndex = Math.min(filteredHanjaList.length, i + overscanCount);
        break;
      }
      currentHeight += rowHeight;
    }

    if (!foundStart) startIndex = 0;
    if (endIndex === 0) endIndex = filteredHanjaList.length;

    return {
      visibleItems: filteredHanjaList.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      totalHeight: currentHeight
    };
  }, [virtualScroll, containerHeight, scrollTop, filteredHanjaList, itemHeight, overscanCount]);

  const renderChunk = useCallback(
    (chunk, rowIndex) => (
      <div className="grid grid-cols-5 gap-2">
        {chunk.map((hanja, colIndex) => (
          <Button
            key={hanja.char}
            onClick={() => {
              const nextIndex = rowIndex * columns + colIndex;
              setSelectedIndex(nextIndex);
              setSelectedHanja(hanja);
            }}
            border={false}
            color={
              selectedHanja?.char === hanja.char
                ? `${setting.theme}-1`
                : "white-1"
            }
            background={
              selectedHanja?.char === hanja.char ? setting.theme : "white-10"
            }
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
          >
            <Typography className="hanja-font">{hanja.char}</Typography>
          </Button>
        ))}
      </div>
    ),
    [selectedHanja, columns, isDarkMode, setting.theme]
  );

  // 아이템 렌더링 메모이제이션
  const renderItems = useCallback(() => {
    const itemsToRender = visibleItems;

    return itemsToRender.map((chunk, index) => {
      const actualIndex = startIndex + index;
      return (
        <div
          key={actualIndex}
          ref={(el) => measureItemHeight(actualIndex, el)}
          style={{
            position: "absolute",
            width: "100%",
            top: (() => {
              let offset = 0;
              for (let i = 0; i < actualIndex; i++) {
                offset += itemRefs.current.get(i) || itemHeight;
              }
              return offset;
            })(),
            paddingBottom: rowGap
          }}
        >
          {renderChunk(chunk, actualIndex)}
        </div>
      );
    });
  }, [
    visibleItems,
    startIndex,
    itemHeight,
    rowGap,
    measureItemHeight,
    renderChunk
  ]);

  return (
    <WidgetCard
      icon={Hanja}
      title={uiText("한자")}
      dragHandleProps={dragHandleProps}
      widgetType="hanjaPanel"
    >
      <div className="w-full flex flex-col gap-2 ">
        <Input
          {...inputProps}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={uiText("검색할 한자 또는 음독을 입력하세요")}
          background={`${setting.theme}-1`}
        />
        <Segmented
          options={[
            { value: "kor", label: uiText("음독") },
            { value: "hanja", label: uiText("한자") },
            { value: "meaning", label: uiText("뜻") }
          ]}
          size="sm"
          value={searchType}
          onChange={(value) => setSearchType(value)}
          block
          background={setting.theme}
          color={`${setting.theme}-1`}
          {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
        />
        {/* 검색 결과가 없을 때 안내 메시지 표시 */}
        {flatHanjaList.length === 0 && !searchTerm && (
          <div className="flex flex-col items-center justify-center p-5 text-gray-400">
            <Typography color={"cool-gray-7"} size="sm">
              {uiText("검색어를 입력하여 한자를 찾으세요.")}</Typography>
          </div>
        )}
        {selectedHanja && (
          <Card
            shadow="none"
            width="100%"
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
          >
            <div className="flex items-end justify-between">
              <div className="flex flex-col items-start">
                <Typography
                  className="hanja-font"
                  style={{ fontSize: 40 }}
                  color="white-1"
                >
                  {selectedHanja.char}
                </Typography>
                <div className="flex flex-wrap gap-2">
                  {selectedHanja.meaning.map((meaning, index) => (
                    <Typography key={index} color="white-1">
                      {meaning.def} {meaning.kor}
                      {index < selectedHanja.meaning.length - 1 ? ", " : ""}
                    </Typography>
                  ))}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => insertSpecialChar(selectedHanja.char)}
                border={false}
                {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
                color="white-1"
                background="white-10"
              >
                <Typography size="xs">{uiText("삽입 ")}</Typography>
              </Button>
            </div>
          </Card>
        )}

        <div
          className="flex flex-col gap-2 w-full p-2 relative overflow-y-auto h-[200px]"
          ref={containerRef}
          tabIndex={0}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          onKeyDown={(e) => {
            if (!flatHanjaList.length) return;
            if (
              e.key !== "ArrowUp" &&
              e.key !== "ArrowDown" &&
              e.key !== "ArrowLeft" &&
              e.key !== "ArrowRight" &&
              e.key !== "Enter"
            ) {
              return;
            }
            e.preventDefault();
            if (e.key === "Enter" && selectedHanja) {
              insertSpecialChar(selectedHanja.char);
              return;
            }

            let nextIndex = selectedIndex;
            if (nextIndex < 0) nextIndex = 0;
            if (e.key === "ArrowLeft") nextIndex -= 1;
            if (e.key === "ArrowRight") nextIndex += 1;
            if (e.key === "ArrowUp") nextIndex -= columns;
            if (e.key === "ArrowDown") nextIndex += columns;
            if (nextIndex < 0) nextIndex = 0;
            if (nextIndex >= flatHanjaList.length) {
              nextIndex = flatHanjaList.length - 1;
            }
            const next = flatHanjaList[nextIndex];
            if (next) {
              setSelectedIndex(nextIndex);
              setSelectedHanja(next);
            }
          }}
        >
          <div style={{ position: "relative", height: totalHeight }}>
            {renderItems()}
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}
