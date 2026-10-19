import { t as uiText, useI18n } from "../../i18n";
import { Button, Input, Switch, toast, Typography } from "sud-ui";
import WidgetCard from "./WidgetCard";
import { TbChevronLeft, TbChevronRight, TbReplace } from "react-icons/tb";
import {
  inputProps,
  newShadowDarkSm,
  newShadowLightSm
} from "../../constant/uiProps";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "../../context/EditorContext";
import { useSetting } from "../../context/SettingContext";
import { useDarkMode } from "../../context/DarkModeContext";

const emptySearchState = {
  results: [],
  flatText: "",
  error: null
};

const isWordChar = (value) => !!value && /[\p{L}\p{N}_]/u.test(value);

const buildSearchSignature = (findText, options) =>
  JSON.stringify({
    findText,
    ...options
  });

const buildDocumentIndex = (doc) => {
  const flatText = [];
  const positions = [];
  let hasTextBlock = false;

  doc.descendants((node, pos) => {
    if (node.isTextblock && node.childCount > 0) {
      if (hasTextBlock) {
        flatText.push("\n");
        positions.push(null);
      }
      hasTextBlock = true;
      return true;
    }

    if (!node.isText) {
      return true;
    }

    for (let index = 0; index < node.text.length; index++) {
      flatText.push(node.text[index]);
      positions.push(pos + index);
    }

    return true;
  });

  return {
    text: flatText.join(""),
    positions
  };
};

const isWholeWordMatch = (text, start, length) => {
  const before = start > 0 ? text[start - 1] : "";
  const after = text[start + length] || "";

  return !isWordChar(before) && !isWordChar(after);
};

const buildSearchResults = (doc, searchText, options) => {
  if (!searchText) {
    return emptySearchState;
  }

  const { text, positions } = buildDocumentIndex(doc);
  const results = [];

  if (options.useRegex) {
    let regex;

    try {
      regex = new RegExp(searchText, `${options.caseSensitive ? "" : "i"}gu`);
    } catch (error) {
      return {
        results: [],
        flatText: text,
        error
      };
    }

    let match = regex.exec(text);

    while (match) {
      const matchText = match[0] || "";
      const startIndex = match.index;

      if (matchText.length === 0) {
        regex.lastIndex += 1;
        match = regex.exec(text);
        continue;
      }

      const endIndex = startIndex + matchText.length - 1;
      const spanPositions = positions.slice(startIndex, endIndex + 1);

      if (
        spanPositions.every((position) => Number.isInteger(position)) &&
        (!options.wholeWord ||
          isWholeWordMatch(text, startIndex, matchText.length))
      ) {
        results.push({
          from: spanPositions[0],
          to: spanPositions[spanPositions.length - 1] + 1,
          startIndex,
          matchText,
          captures: match.slice(1),
          groups: match.groups || {}
        });
      }

      match = regex.exec(text);
    }

    return {
      results,
      flatText: text,
      error: null
    };
  }

  const sourceText = options.caseSensitive ? text : text.toLocaleLowerCase();
  const targetText = options.caseSensitive
    ? searchText
    : searchText.toLocaleLowerCase();
  let searchIndex = 0;

  while (true) {
    const startIndex = sourceText.indexOf(targetText, searchIndex);

    if (startIndex === -1) {
      break;
    }

    const endIndex = startIndex + targetText.length - 1;
    const spanPositions = positions.slice(startIndex, endIndex + 1);

    if (
      spanPositions.every((position) => Number.isInteger(position)) &&
      (!options.wholeWord ||
        isWholeWordMatch(text, startIndex, targetText.length))
    ) {
      results.push({
        from: spanPositions[0],
        to: spanPositions[spanPositions.length - 1] + 1,
        startIndex,
        matchText: text.slice(startIndex, startIndex + targetText.length),
        captures: [],
        groups: {}
      });
    }

    searchIndex = startIndex + Math.max(targetText.length, 1);
  }

  return {
    results,
    flatText: text,
    error: null
  };
};

const applyRegexReplacement = (result, template, fullText) =>
  template.replace(/\$(\$|&|`|'|<[^>]+>|\d{1,2})/g, (token, groupToken) => {
    if (groupToken === "$") return "$";
    if (groupToken === "&") return result.matchText;
    if (groupToken === "`") return fullText.slice(0, result.startIndex);
    if (groupToken === "'") {
      return fullText.slice(result.startIndex + result.matchText.length);
    }

    if (groupToken.startsWith("<") && groupToken.endsWith(">")) {
      const groupName = groupToken.slice(1, -1);
      return result.groups?.[groupName] ?? "";
    }

    const groupIndex = Number(groupToken);
    return result.captures?.[groupIndex - 1] ?? token;
  });

export default function FindAndReplace({ dragHandleProps }) {
  useI18n();
  const { editor } = useEditor();
  const { setting } = useSetting();
  const { isDarkMode } = useDarkMode();
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [isReplace, setIsReplace] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentCount, setCurrentCount] = useState(0);
  const [searchOptions, setSearchOptions] = useState({
    caseSensitive: false,
    wholeWord: false,
    useRegex: false
  });
  const [regexError, setRegexError] = useState("");
  const searchResultsRef = useRef([]);
  const currentIndexRef = useRef(-1);
  const activeSearchSignatureRef = useRef("");
  const activeFlatTextRef = useRef("");

  const resetSearchState = useCallback(() => {
    searchResultsRef.current = [];
    currentIndexRef.current = -1;
    activeFlatTextRef.current = "";
    activeSearchSignatureRef.current = "";
    setTotalCount(0);
    setCurrentCount(0);
    setRegexError("");
  }, []);

  const moveToResult = useCallback(
    (index) => {
      if (!editor || searchResultsRef.current.length === 0) return;

      const result = searchResultsRef.current[index];
      if (!result) return;

      currentIndexRef.current = index;
      setCurrentCount(index + 1);

      editor
        .chain()
        .focus()
        .setTextSelection({ from: result.from, to: result.to })
        .run();

      requestAnimationFrame(() => {
        try {
          const coords = editor.view.coordsAtPos(result.from);
          const editorElement = editor.view.dom;
          const scrollContainer =
            editorElement.closest(".tiptap-container") ||
            editorElement.parentElement;

          if (!scrollContainer) {
            window.scrollTo({
              top: coords.top - 100,
              left: coords.left,
              behavior: "smooth"
            });
            return;
          }

          const containerRect = scrollContainer.getBoundingClientRect();
          const relativeTop =
            coords.top - containerRect.top + scrollContainer.scrollTop;
          const relativeLeft =
            coords.left - containerRect.left + scrollContainer.scrollLeft;

          scrollContainer.scrollTo({
            top: relativeTop - 100,
            left: relativeLeft,
            behavior: "smooth"
          });
        } catch (error) {
          console.error(uiText("찾기 결과 스크롤 오류:"), error);
        }
      });
    },
    [editor]
  );

  const refreshSearch = useCallback(
    ({
      preferredIndex = 0,
      suppressToast = false,
      preserveCurrentIndex = false
    } = {}) => {
      if (!editor || !findText.trim()) {
        resetSearchState();
        return false;
      }

      const searchState = buildSearchResults(
        editor.state.doc,
        findText,
        searchOptions
      );

      if (searchState.error) {
        searchResultsRef.current = [];
        currentIndexRef.current = -1;
        activeFlatTextRef.current = searchState.flatText;
        activeSearchSignatureRef.current = "";
        setTotalCount(0);
        setCurrentCount(0);
        setRegexError(uiText("정규식이 올바르지 않습니다."));
        if (!suppressToast) {
          toast.danger(uiText("정규식이 올바르지 않습니다."));
        }
        return false;
      }

      setRegexError("");
      searchResultsRef.current = searchState.results;
      activeFlatTextRef.current = searchState.flatText;
      activeSearchSignatureRef.current = buildSearchSignature(
        findText,
        searchOptions
      );

      if (searchState.results.length === 0) {
        currentIndexRef.current = -1;
        setTotalCount(0);
        setCurrentCount(0);
        if (!suppressToast) {
          toast.danger(uiText("찾을 수 없습니다."));
        }
        return false;
      }

      const safeIndex = preserveCurrentIndex
        ? Math.min(currentIndexRef.current, searchState.results.length - 1)
        : Math.min(
            Math.max(preferredIndex, 0),
            Math.max(searchState.results.length - 1, 0)
          );

      setTotalCount(searchState.results.length);
      moveToResult(Math.max(safeIndex, 0));
      return true;
    },
    [editor, findText, moveToResult, resetSearchState, searchOptions]
  );

  const ensureFreshResults = useCallback(
    (options = {}) => {
      const currentSignature = buildSearchSignature(findText, searchOptions);

      if (
        activeSearchSignatureRef.current !== currentSignature ||
        searchResultsRef.current.length === 0
      ) {
        return refreshSearch(options);
      }

      return true;
    },
    [findText, refreshSearch, searchOptions]
  );

  useEffect(() => {
    if (!findText.trim()) {
      resetSearchState();
    }
  }, [findText, resetSearchState]);

  const handleFind = useCallback(() => {
    refreshSearch({ preferredIndex: 0 });
  }, [refreshSearch]);

  const handlePrevious = () => {
    if (!ensureFreshResults()) return;

    const total = searchResultsRef.current.length;
    const nextIndex =
      currentIndexRef.current > 0 ? currentIndexRef.current - 1 : total - 1;

    moveToResult(nextIndex);
  };

  const handleNext = () => {
    if (!ensureFreshResults()) return;

    const total = searchResultsRef.current.length;
    const nextIndex =
      currentIndexRef.current < total - 1 ? currentIndexRef.current + 1 : 0;

    moveToResult(nextIndex);
  };

  const getReplacementText = (result) => {
    if (!searchOptions.useRegex) {
      return replaceText;
    }

    return applyRegexReplacement(
      result,
      replaceText,
      activeFlatTextRef.current
    );
  };

  const handleReplace = () => {
    if (!editor || !findText.trim()) return;
    if (!ensureFreshResults({ preserveCurrentIndex: true })) return;

    const result = searchResultsRef.current[currentIndexRef.current];

    if (!result) return;

    editor
      .chain()
      .focus()
      .setTextSelection({ from: result.from, to: result.to })
      .insertContent(getReplacementText(result))
      .run();

    refreshSearch({
      preferredIndex: currentIndexRef.current,
      suppressToast: true
    });
  };

  const handleReplaceAll = () => {
    if (!editor || !findText.trim()) return;
    if (!ensureFreshResults({ preferredIndex: 0 })) return;

    const results = [...searchResultsRef.current];

    for (let index = results.length - 1; index >= 0; index--) {
      const result = results[index];
      editor
        .chain()
        .focus()
        .setTextSelection({ from: result.from, to: result.to })
        .insertContent(getReplacementText(result))
        .run();
    }

    toast.success(uiText("총 {0}건이 변경되었습니다.", results.length));
    refreshSearch({
      preferredIndex: 0,
      suppressToast: true
    });
  };

  const handleFindInputKeyDown = (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();

    if (totalCount > 0 && !isReplace) {
      handleNext();
      return;
    }

    handleFind();
  };

  const toggleOption = (key) => {
    setRegexError("");
    setSearchOptions((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <WidgetCard
      icon={TbReplace}
      title={uiText("찾기 및 바꾸기")}
      dragHandleProps={dragHandleProps}
      widgetType="findAndReplace"
      titleBtn={
        <Switch
          checked={isReplace}
          onChange={() => setIsReplace(!isReplace)}
          size="sm"
          onColor={`${setting.theme}-7`}
          offColor={`${setting.theme}-3`}
        />
      }
    >
      <div className="w-full flex flex-col gap-2">
        <div className="flex gap-2 items-center flex-col">
          <Input
            placeholder={uiText("찾을 내용을 입력하세요")}
            {...inputProps}
            value={findText}
            onChange={(event) => setFindText(event.target.value)}
            onKeyDown={handleFindInputKeyDown}
            label={uiText("찾을 내용")}
            background={`${setting.theme}-1`}
          />
          {isReplace && (
            <Input
              placeholder={uiText("바꿀 내용을 입력하세요")}
              {...inputProps}
              value={replaceText}
              onChange={(event) => setReplaceText(event.target.value)}
              label={uiText("바꿀 내용")}
              background={`${setting.theme}-1`}
            />
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            colorType="text"
            onClick={() => toggleOption("caseSensitive")}
            border={false}
            background={
              searchOptions.caseSensitive ? `${setting.theme}-2` : "transparent"
            }
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
          >
            <Typography size="xs">{uiText("대소문자 구분")}</Typography>
          </Button>
          <Button
            size="sm"
            colorType="text"
            onClick={() => toggleOption("wholeWord")}
            border={false}
            background={
              searchOptions.wholeWord ? `${setting.theme}-2` : "transparent"
            }
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
          >
            <Typography size="xs">{uiText("단어 단위")}</Typography>
          </Button>
          <Button
            size="sm"
            colorType="text"
            onClick={() => toggleOption("useRegex")}
            border={false}
            background={
              searchOptions.useRegex ? `${setting.theme}-2` : "transparent"
            }
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
          >
            <Typography size="xs">{uiText("정규식")}</Typography>
          </Button>
        </div>

        {regexError && (
          <Typography size="sm" color="red-6">
            {regexError}
          </Typography>
        )}

        {totalCount > 0 && (
          <div className="flex justify-end items-center gap-2">
            <Typography size="sm" color="cool-gray-7">
              {currentCount} / {totalCount}
            </Typography>
            <Button
              size="sm"
              colorType="text"
              icon={<TbChevronLeft />}
              onClick={handlePrevious}
              border={false}
              {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
            />
            <Button
              size="sm"
              colorType="text"
              icon={<TbChevronRight />}
              onClick={handleNext}
              border={false}
              {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            background={`${setting.theme}-7`}
            color={`${setting.theme}-1`}
            onClick={handleFind}
            disabled={!findText.trim()}
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
          >
            <Typography size="sm">{uiText("찾기")}</Typography>
          </Button>
          {isReplace && (
            <>
              <Button
                size="sm"
                background={`${setting.theme}-7`}
                color={`${setting.theme}-1`}
                onClick={handleReplace}
                disabled={!findText.trim()}
                border={false}
                {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
              >
                <Typography size="sm">{uiText("바꾸기")}</Typography>
              </Button>
              <Button
                size="sm"
                background={`${setting.theme}-7`}
                color={`${setting.theme}-1`}
                onClick={handleReplaceAll}
                disabled={!findText.trim()}
                border={false}
                {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
              >
                <Typography size="sm">{uiText("모두 바꾸기")}</Typography>
              </Button>
            </>
          )}
        </div>
      </div>
    </WidgetCard>
  );
}
