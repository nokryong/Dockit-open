import { TbArrowBackUp, TbArrowForwardUp, TbBlockquote, TbColumns, TbNumbers, TbPackageExport, TbPageBreak, TbSitemap, TbTag, TbTextCaption, TbTextWrap } from "react-icons/tb";
import { Code, PhotoOutline, Print } from "sud-icons";
import { AiFillSave } from "react-icons/ai";
import { useEditor } from "@/app/LIB/context/EditorContext";
import { Button, ColorPicker, Divider, Input, Div, Popover, Select, Tooltip, Typography, Upload, toast } from "sud-ui";
import { useEffect, useState, useRef } from "react";
import { HiMinus, HiPlus } from "react-icons/hi";
import { GrDocumentConfig } from "react-icons/gr";
import { useParams } from "@/desktop/navigation";

import { PiListBulletsBold, PiListChecksBold, PiListNumbersBold, PiTableFill, PiTextAlignCenterBold, PiTextAlignJustifyBold, PiTextAlignLeftBold, PiTextAlignRightBold, PiTextBBold, PiTextIndentFill, PiTextItalicBold, PiTextOutdentFill, PiTextStrikethroughBold, PiTextUnderlineBold } from "react-icons/pi";
import { MdFormatColorFill, MdFormatColorText } from "react-icons/md";
import DocSettingModal from "./DocSettingModal";
import { useDocumentFontOptions } from "@/app/LIB/hook/useDocumentFontOptions";
import { unquoteFontFamily } from "@/app/LIB/utils/localFonts";
import { LuSubscript, LuSuperscript } from "react-icons/lu";
import { findParentNode } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { inputProps, withOverlayShadow } from "@/app/LIB/constant/uiProps";
import { useDocument } from "@/app/LIB/context/DocumentContext";
import { renderToolbarButton } from "./renderToolbarButton";
import { useSetting } from "@/app/LIB/context/SettingContext";
import { useDarkMode } from "@/app/LIB/context/DarkModeContext";
import { generateStyleSet } from "@/app/LIB/utils/pdfUtils";
import { htmlToMarkdown } from "@/app/LIB/utils/markdownUtils";
import { RiRectangleLine } from "react-icons/ri";
import { getEditorViewSafely, hasEditorView } from "@/app/LIB/utils/editorViewUtils";
import { getToolbarPopoverStyle, ToolbarIconButton } from "@/app/LIB/components/common/toolbar/ToolbarPrimitives";
import { collectHeadingEntries, createTocNodes } from "@/app/LIB/utils/tocUtils";
import { createDockitDocumentSnapshot } from "@/app/LIB/utils/dktDocumentUtils";
import { buildHeadingIdSyncTransaction } from "@/app/LIB/extensions/HeadingWithId";
import { CAPTION_TOC_ITEM_TYPE, collectCaptionEntries, createCaptionTocNodes, getCaptionTargetConfig, isCaptionInsertionEnabled, normalizeCaptionTargetGroup, toggleCaptionForSelection } from "@/app/LIB/utils/captionUtils";

const withToolbarTestId = (testId, child) =>
  testId ? (
    <span data-testid={testId} style={{ display: "inline-flex" }}>
      {child}
    </span>
  ) : (
    child
  );

export default function WriteHeader() {
  const {
    editor,
    editorMounted,
    printAction,
    saveAction,
    hwpxExportAction,
    docxExportAction,
    insertNoteAtRememberedSelection
  } = useEditor();
  const { setting } = useSetting();
  const { currentColors, isDarkMode } = useDarkMode();
  const renderBtn = (
    editor,
    icon,
    action,
    extraClass,
    tooltip,
    active,
    skipEditorCheck,
    buttonProps
  ) =>
    renderToolbarButton(
      editor,
      icon,
      action,
      extraClass,
      tooltip,
      active,
      skipEditorCheck,
      setting.theme,
      buttonProps
    );
  const {
    viewPage,
    setViewPage,
    pageNumber,
    setPageNumber,
    saveDocument,
    document,
    title,
    content,
    docSetting,
    bulletStyle,
    focus,
  } = useDocument();
  const params = useParams();
  const [font, setFont] = useState("Pretendard-Medium");
  const fontOptions = useDocumentFontOptions(font);
  const [currentFontSize, setCurrentFontSize] = useState(12);

  const [fontColorPickerOpen, setFontColorPickerOpen] = useState(false);
  const [fontColor, setFontColor] = useState("#000000");
  const [fontBackgroundColorPickerOpen, setFontBackgroundColorPickerOpen] =
    useState(false);
  const [fontBackgroundColor, setFontBackgroundColor] = useState("");
  const [inlineTagColorPickerOpen, setInlineTagColorPickerOpen] =
    useState(false);
  const [inlineTagColor, setInlineTagColor] = useState("#bfdbfe");
  const [captionButtonEnabled, setCaptionButtonEnabled] = useState(false);

  const [docSettingModalOpen, setDocSettingModalOpen] = useState(false);
  const [tableHover, setTableHover] = useState({ col: 0, row: 0 });
  const captionTocMenuItems = ["image", "table", "chartBlock"];
  const defaultInlineTagColor =
    currentColors?.[setting?.theme]?.[2] || "#bfdbfe";

  const getCurrentExportContent = () =>
    editor?.getHTML() || content || document?.content || "";

  const getCurrentExportTitle = () => {
    const trimmedTitle = `${title || document?.title || ""}`.trim();
    return trimmedTitle || "문서";
  };

  const buildCurrentExportHtml = async () =>
    generateStyleSet(
      bulletStyle || document.bulletStyle,
      document.docSetting,
      getCurrentExportContent(),
      {
        title: getCurrentExportTitle()
      }
    );

  const insertTocContent = () => {
    if (!editorMounted || !hasEditorView(editor)) return;

    let existingTocPos = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "tocItem") {
        existingTocPos = pos;
        return false;
      }

      return true;
    });

    if (existingTocPos !== null) {
      const existingElement = editor.view.nodeDOM(existingTocPos);

      if (existingElement instanceof Element) {
        existingElement.scrollIntoView({
          behavior: "smooth",
          block: "start",
          inline: "nearest"
        });
      }

      toast.info("이미 목차가 있습니다.");
      return;
    }

    const editorView = getEditorViewSafely(editor);

    if (!editorView) {
      return;
    }

    const headingIdSyncTr = buildHeadingIdSyncTransaction(editorView.state);

    if (headingIdSyncTr) {
      editorView.dispatch(headingIdSyncTr);
    }

    const headings = collectHeadingEntries(
      editorView.state.doc,
      bulletStyle
    ).filter((entry) => entry.text && entry.headingId);

    if (headings.length === 0) {
      toast.info("목차로 만들 제목이 없습니다.");
      return;
    }

    const { $from, from } = editor.state.selection;
    const insertPos = $from.depth > 0 ? $from.before(1) : from;
    const tocNodes = createTocNodes(headings, {
      includeTitle: true,
      titleText: "목차"
    });

    editor?.chain()?.focus()?.insertContentAt(insertPos, tocNodes)?.run();
  };

  const insertCaptionTocContent = (targetType) => {
    if (!editorMounted || !hasEditorView(editor)) {
      return;
    }

    const config = getCaptionTargetConfig(targetType);

    if (!config) {
      return;
    }

    let existingCaptionTocPos = null;

    editor.state.doc.descendants((node, pos) => {
      if (
        node.type.name === CAPTION_TOC_ITEM_TYPE &&
        normalizeCaptionTargetGroup(node.attrs.targetType) === targetType
      ) {
        existingCaptionTocPos = pos;
        return false;
      }

      return true;
    });

    if (existingCaptionTocPos !== null) {
      const existingElement = editor.view.nodeDOM(existingCaptionTocPos);

      if (existingElement instanceof Element) {
        existingElement.scrollIntoView({
          behavior: "smooth",
          block: "start",
          inline: "nearest"
        });
      }

      toast.info(`이미 ${config.tocTitle}가 있습니다.`);
      return;
    }

    const entries = collectCaptionEntries(editor.state.doc).filter(
      (entry) => entry.targetGroup === targetType
    );

    if (entries.length === 0) {
      toast.info(`${config.tocTitle}로 만들 캡션이 없습니다.`);
      return;
    }

    const { $from, from } = editor.state.selection;
    const insertPos = $from.depth > 0 ? $from.before(1) : from;
    const tocNodes = createCaptionTocNodes(targetType, entries, {
      includeTitle: true
    });

    editor?.chain()?.focus()?.insertContentAt(insertPos, tocNodes)?.run();
  };

  const applyHeaderTextAlign = (align) => {
    if (!editor) return;

    if (!applyTextAlignToSelection(align)) {
      editor?.chain()?.focus()?.setTextAlign(align)?.run();
    }
  };

  const isAlignJustify = editor?.isActive({ textAlign: "justify" });
  const isAlignCenter = editor?.isActive({ textAlign: "center" });
  const isAlignRight = editor?.isActive({ textAlign: "right" });
  const isAlignLeft = editor?.isActive({ textAlign: "left" });

  const currentAlignIcon = isAlignJustify
    ? PiTextAlignJustifyBold
    : isAlignCenter
      ? PiTextAlignCenterBold
      : isAlignRight
        ? PiTextAlignRightBold
        : PiTextAlignLeftBold;

  const isBulletListActive = editor?.isActive("bulletList");
  const isOrderedListActive = editor?.isActive("orderedList");
  const isTaskListActive = editor?.isActive("taskList");
  const isAnyListActive =
    isBulletListActive || isOrderedListActive || isTaskListActive;
  const isEditorActive = (name, attrs) =>
    editor?.isActive(name, attrs) ?? false;
  const paragraphAttrs = editor?.getAttributes("paragraph") || {};
  const paragraphWordBreak = paragraphAttrs.wordBreak || "keep-all";

  const currentListIcon = isTaskListActive
    ? PiListChecksBold
    : isOrderedListActive
      ? PiListNumbersBold
      : PiListBulletsBold;

  // 에디터 선택 상태를 저장하기 위한 ref
  const savedSelectionRef = useRef(null);
  // CellSelection을 저장하기 위한 ref (셀 드래그 선택 시)
  const savedCellSelectionRef = useRef(null);
  // Input의 실제 DOM 요소를 참조하기 위한 ref
  const fontSizeInputRef = useRef(null);

  useEffect(() => {
    if (!editor) return;
    // ✨ 툴바의 상태(폰트 크기, 글꼴)를 한번에 업데이트하는 함수
    const updateToolbarState = () => {
      // 1. 현재 커서의 textStyle 속성을 한번에 가져옵니다.
      const attrs = editor.getAttributes("textStyle");

      // 2. 폰트 크기 상태를 업데이트합니다.
      const fontSize = attrs?.fontSize;
      if (fontSize) {
        setCurrentFontSize(parseInt(fontSize, 10));
      } else {
        const paraAttrs = editor.getAttributes("paragraph");
        setCurrentFontSize(
          paraAttrs?.fontSize ? parseInt(paraAttrs.fontSize, 10) : 12
        );
      }

      // 3. 폰트 패밀리(글꼴) 상태를 업데이트합니다.
      const diagram = editor.state.selection.node;
      const fontFamily = diagram?.type.name === "diagramBlock"
        ? diagram.attrs.fontFamily || "sans-serif"
        : attrs?.fontFamily;
      if (fontFamily) {
        setFont(fontFamily);
      } else {
        setFont("PretendardMedium"); // 기본값
      }

      const inlineTagAttrs = editor.getAttributes("inlineTag");

      if (inlineTagAttrs?.color) {
        setInlineTagColor(inlineTagAttrs.color);
      }

      setCaptionButtonEnabled(isCaptionInsertionEnabled(editor));
    };

    // 4. 에디터의 내용이나 선택 영역이 변경될 때마다 툴바 상태를 업데이트합니다.
    editor.on("transaction", updateToolbarState);
    editor.on("selectionUpdate", updateToolbarState);

    // 5. 컴포넌트가 처음 로드될 때 초기 상태를 설정합니다.
    updateToolbarState();

    // 6. 컴포넌트가 사라질 때 이벤트 리스너를 정리합니다.
    return () => {
      editor.off("transaction", updateToolbarState);
      editor.off("selectionUpdate", updateToolbarState);
    };
  }, [editor]); // 의존성 배열은 그대로 [editor] 입니다.

  // Input의 실제 input 요소에 포커스 이벤트 리스너 추가
  useEffect(() => {
    if (!fontSizeInputRef.current) return;

    // Input 컴포넌트 내부의 실제 input 요소 찾기
    const findInputElement = (element) => {
      if (!element) return null;
      if (element.tagName === "INPUT") return element;
      return element.querySelector("input");
    };

    const inputElement = findInputElement(fontSizeInputRef.current);
    if (!inputElement) return;

    // 포커스 이벤트 리스너 추가
    const handleFocus = () => {
      // Input에 포커스가 가기 전에 에디터 선택 상태 저장
      if (editor) {
        const { from, to } = editor.state.selection;
        if (from !== to) {
          savedSelectionRef.current = { from, to };
        }
      }
    };

    // mousedown 이벤트로도 처리 (포커스보다 먼저 실행)
    const handleMouseDown = () => {
      if (editor) {
        const { from, to } = editor.state.selection;
        if (from !== to) {
          savedSelectionRef.current = { from, to };
        }
        // CellSelection도 저장
        if (editor.state.selection instanceof CellSelection) {
          savedCellSelectionRef.current = editor.state.selection;
        }
      }
    };

    inputElement.addEventListener("mousedown", handleMouseDown, true);
    inputElement.addEventListener("focus", handleFocus, true);

    return () => {
      inputElement.removeEventListener("mousedown", handleMouseDown, true);
      inputElement.removeEventListener("focus", handleFocus, true);
    };
  }, [editor, fontSizeInputRef]);

  // CellSelection이 활성화된 경우 현재 또는 저장된 선택 영역에 textStyle mark를 적용
  const applyTextStyleToSelection = (attrs) => {
    const editorView = getEditorViewSafely(editor);

    if (!editor || !editorView) return false;

    const { state } = editor;
    const { schema } = state;
    const markType = schema.marks.textStyle;
    if (!markType) return false;

    // 현재 선택이 CellSelection이거나 저장된 CellSelection이 있는 경우 처리
    const cellSel =
      state.selection instanceof CellSelection
        ? state.selection
        : savedCellSelectionRef.current;

    if (!cellSel) return false;

    const tr = state.tr;

    cellSel.forEachCell((cellNode, cellPos) => {
      const from = cellPos + 1;
      const to = cellPos + cellNode.nodeSize - 1;

      state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText) return;

        const nodeFrom = Math.max(pos, from);
        const nodeTo = Math.min(pos + node.nodeSize, to);

        // 기존 textStyle mark의 속성을 보존하면서 새 속성 병합
        const existingMark = node.marks.find((m) => m.type === markType);
        const existingAttrs = existingMark ? { ...existingMark.attrs } : {};
        const newMark = markType.create({ ...existingAttrs, ...attrs });

        tr.addMark(nodeFrom, nodeTo, newMark);
      });
    });

    editorView.dispatch(tr);
    savedCellSelectionRef.current = null;
    return true;
  };

  // CellSelection이 활성화된 경우 현재 또는 저장된 선택 영역에 textAlign을 적용
  const applyTextAlignToSelection = (alignment) => {
    const editorView = getEditorViewSafely(editor);

    if (!editor || !editorView) return false;

    const { state } = editor;

    const cellSel =
      state.selection instanceof CellSelection
        ? state.selection
        : savedCellSelectionRef.current;

    if (!cellSel) return false;

    const tr = state.tr;
    const alignTypes = ["paragraph", "heading"];

    cellSel.forEachCell((cellNode, cellPos) => {
      const from = cellPos + 1;
      const to = cellPos + cellNode.nodeSize - 1;

      state.doc.nodesBetween(from, to, (node, pos) => {
        if (alignTypes.includes(node.type.name)) {
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            textAlign: alignment
          });
        }
      });
    });

    editorView.dispatch(tr);
    savedCellSelectionRef.current = null;
    return true;
  };

  // CellSelection을 저장하는 헬퍼 (툴바 인터랙션 전에 호출)
  const saveCellSelection = () => {
    if (editor && editor.state.selection instanceof CellSelection) {
      savedCellSelectionRef.current = editor.state.selection;
    }
  };

  // [추가] 폰트 크기 변경 로직을 처리하는 함수
  const handleFontSize = (size) => {
    if (!editor) return;

    if (!applyTextStyleToSelection({ fontSize: `${size}pt` })) {
      editor
        .chain()
        .focus()
        .setMark("textStyle", { fontSize: `${size}pt` })
        .run();
    }
  };

  const handleInlineTagClick = () => {
    if (!editorMounted || !hasEditorView(editor)) return;

    if (editor.isActive("inlineTag")) {
      const activeTagColor =
        editor.getAttributes("inlineTag")?.color || defaultInlineTagColor;

      setInlineTagColor(activeTagColor);
      setInlineTagColorPickerOpen(true);
      return;
    }

    setInlineTagColorPickerOpen(false);
    editor?.chain()?.focus()?.setInlineTag()?.run();
  };

  const handleInlineTagColorChange = (color) => {
    if (!inlineTagColorPickerOpen) return;
    if (!editorMounted || !hasEditorView(editor)) return;

    const nextColor = color?.hex;

    if (!nextColor) return;

    setInlineTagColor(nextColor);
    editor?.chain()?.focus()?.setInlineTagColor(nextColor)?.run();
  };

  const handleInlineTagUnset = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setInlineTagColorPickerOpen(false);
    editor?.chain()?.focus()?.unsetInlineTag()?.run();
  };

  const handleColumnToggle = () => {
    if (!editorMounted || !hasEditorView(editor)) return;

    const { selection } = editor.state;

    const isInsideTable =
      selection instanceof CellSelection ||
      Array.from(
        { length: selection.$from.depth + 1 },
        (_, depth) => selection.$from.node(depth)?.type?.name
      ).some((name) =>
        ["table", "tableRow", "tableCell", "tableHeader"].includes(name)
      );

    if (isInsideTable) return;

    const predicate = (node) => node.type.name === "columnBlock";
    const parentNodeInfo = findParentNode(predicate)(selection);

    if (parentNodeInfo) {
      const columnBlockNode = parentNodeInfo.node;
      const currentCols = columnBlockNode.childCount;
      const nodePos = parentNodeInfo.pos;
      const deletionRange = {
        from: nodePos,
        to: nodePos + columnBlockNode.nodeSize
      };

      if (currentCols >= 4) {
        // 내용물 복사 없이, 블록 삭제 후 빈 단락 1개만 삽입
        editor
          .chain()
          .deleteRange(deletionRange)
          .insertContentAt(deletionRange.from, { type: "paragraph" })
          .run();
      } else {
        const nextCols = currentCols + 1;
        const newColumns = Array.from({ length: nextCols }, () => ({
          type: "column",
          content: [{ type: "paragraph" }]
        }));

        const newColumnBlock = {
          type: "columnBlock",
          content: newColumns
        };

        editor
          .chain()
          .deleteRange(deletionRange)
          .insertContentAt(deletionRange.from, newColumnBlock)
          .run();
      }
    } else {
      editor.chain().setColumns(2).run();
    }
  };

  const handleUploadImg = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result;
      // 이미지 원본 크기를 알아내서 비율 계산
      const img = new Image();
      img.onload = () => {
        const targetWidthMm = 52.9; // mm (≈ 200px at 96dpi)
        const aspectRatio = img.width / img.height;
        const targetHeightMm = parseFloat(
          (targetWidthMm / aspectRatio).toFixed(1)
        );
        editor
          ?.chain()
          ?.focus()
          ?.setImage({
            src: base64,
            width: targetWidthMm,
            height: targetHeightMm
          })
          .run();
      };
      img.src = base64;
    };
    reader.readAsDataURL(file);
  };

  const handleInsertCaption = () => {
    if (!editorMounted || !editor) {
      return;
    }

    const result = toggleCaptionForSelection(editor);

    if (!result.ok) {
      toast.info("캡션을 넣을 객체를 먼저 선택해 주세요.");
      return;
    }

    if (result.status === "deleted") {
      toast.info("캡션을 삭제했습니다.");
    }
  };

  const handleInsertNote = (kind) => {
    const result = insertNoteAtRememberedSelection(kind);
    if (result?.ok) return;
    if (result?.error?.code === "NOTE_NESTED_INSERT_BLOCKED") {
      toast.info("각주·미주 본문 안에는 다른 각주나 미주를 넣을 수 없습니다.");
      return;
    }
    toast.info("본문의 글자 위치에 커서를 놓고 다시 시도해 주세요.");
  };

  // 파일 내보내기
  const exportFile = async () => {
    const dockitDocument = createDockitDocumentSnapshot({
      document,
      title,
      content: getCurrentExportContent(),
      docSetting,
      bulletStyle,
      viewPage,
      pageNumber,
      focus
    });

    const blob = new Blob([JSON.stringify(dockitDocument, null, 2)], {
      type: "application/json"
    });

    const url = window.URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${getCurrentExportTitle()}.dkt`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportDocxV0 = async () => {
    if (!docxExportAction) {
      toast.info("DOCX 내보내기를 준비하는 중입니다.");
      return;
    }

    await docxExportAction();
  };

  const exportHwpxV0 = async () => {
    if (!hwpxExportAction) {
      toast.info("HWPX 내보내기를 준비하는 중입니다.");
      return;
    }

    await hwpxExportAction();
  };

  const exportTxt = () => {
    const text = editor?.getText() || "";
    const blob = new Blob([text], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${getCurrentExportTitle()}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportHtml = async () => {
    try {
      const finalHtml = await buildCurrentExportHtml();

      const blob = new Blob([finalHtml], { type: "text/html;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${getCurrentExportTitle()}.html`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("HTML export error:", error);
      toast.danger("HTML 내보내기에 실패했습니다.");
    }
  };

  const exportMd = () => {
    const html = getCurrentExportContent();
    const markdown = htmlToMarkdown(html);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = window.URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${getCurrentExportTitle()}.md`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportOptions = [
    { key: "dkt", label: "DKT", onClick: exportFile },
    { key: "pdf", label: "PDF", onClick: () => printAction?.() },
    {
      key: "docx",
      label: "DOCX",
      onClick: exportDocxV0,
      testId: "docx-export-option"
    },
    { key: "hwpx", label: "HWPX", onClick: exportHwpxV0 },
    { key: "txt", label: "TXT", onClick: exportTxt },
    { key: "html", label: "HTML", onClick: exportHtml },
    { key: "md", label: "MD", onClick: exportMd }
  ];

  return (
    <Div className="flex gap-2 items-center overflow-x-auto">
      {/* 취소 & 재실행 */}
      {renderBtn(
        editor,
        TbArrowBackUp,
        () => editor?.chain()?.focus()?.undo()?.run(),
        "",
        "실행취소"
      )}
      {renderBtn(
        editor,
        TbArrowForwardUp,
        () => editor?.chain()?.focus()?.redo()?.run(),
        "",
        "재실행"
      )}
      {/* 인쇄 & 저장 */}
      {renderBtn(
        editor,
        Print,
        () => printAction?.(),
        "",
        "출력",
        true,
        true,
        { "data-testid": "write-print-button" }
      )}
      {renderBtn(
        editor,
        AiFillSave,
        () => saveAction?.(),
        "",
        "저장",
        true,
        true,
        { "data-testid": "write-save-button" }
      )}
      <Divider
        vertical
        style={{ height: "20px", margin: "0" }}
        borderColor={`${setting.theme}-3`}
      />
      {/* 폰트 패밀리 설정 */}
      <div
        onMouseDown={(event) => {
          event.preventDefault();
          saveCellSelection();
        }}
      >
        <Select
          colorType="text"
          color={`${setting.theme}-10`}
          size="sm"
          background="transparent"
          shadow="none"
          options={fontOptions}
          style={{ width: "170px", overflow: "hidden" }}
          dropdownStyle={withOverlayShadow({
            maxHeight: "70vh",
            width: "220px",
            background: currentColors.white[10]
          })}
          border={false}
          value={font}
          ariaLabel="글꼴"
          searchable
          onChange={(value) => {
            setFont(value);
            if (editor?.state.selection.node?.type.name === "diagramBlock") {
              editor.chain().focus().setDiagramFontFamily(unquoteFontFamily(value)).run();
              return;
            }
            const family = fontOptions.find(option => option.value === value)?.fontFamily || value;
            if (!applyTextStyleToSelection({ fontFamily: family })) {
              editor?.chain()?.focus()?.setFontFamily(family)?.run();
            }
          }}
        />
      </div>
      <Divider
        vertical
        style={{ height: "20px", margin: "0" }}
        borderColor={`${setting.theme}-3`}
      />
      {/* 폰트 크기 설정 */}
      <div
        className="flex items-center gap-px"
        onMouseDown={(event) => {
          // [수정] 클릭된 요소의 태그 이름이 'INPUT'이 아닐 때만 기본 동작을 막습니다.
          if (event.target.tagName !== "INPUT") {
            event.preventDefault();
          }
        }}
      >
        {renderBtn(
          editor,
          HiMinus,
          // 새로운 핸들러 함수를 사용
          () => handleFontSize(currentFontSize - 1),
          !editor,
          "",
          "폰트 작게"
        )}
        <div
          ref={fontSizeInputRef}
          onMouseDown={(e) => {
            // Input 영역 클릭 시 에디터 선택 상태 저장
            // onMouseDown은 onFocus보다 먼저 실행됨
            if (editor) {
              const { from, to } = editor.state.selection;
              if (from !== to) {
                savedSelectionRef.current = { from, to };
              }
              // CellSelection도 저장
              if (editor.state.selection instanceof CellSelection) {
                savedCellSelectionRef.current = editor.state.selection;
              }
            }
          }}
        >
          <Input
            className="text-xs"
            color={`${setting.theme}-9`}
            value={currentFontSize}
            onChange={(e) => {
              const value = e.target.value;
              setCurrentFontSize(value);

              // 숫자로 변환 가능한 경우에만 폰트 크기 적용
              const numValue = parseInt(value, 10);
              if (!isNaN(numValue) && numValue > 0 && editor) {
                // CellSelection이 저장된 경우 우선 처리
                if (applyTextStyleToSelection({ fontSize: `${numValue}pt` })) {
                  return;
                }
                // 저장된 선택 상태가 있으면 즉시 복원하고 폰트 크기 적용
                if (savedSelectionRef.current) {
                  const { from, to } = savedSelectionRef.current;
                  // 동기적으로 선택 복원 및 폰트 크기 적용
                  editor
                    .chain()
                    .setTextSelection({ from, to })
                    .updateAttributes("paragraph", {
                      fontSize: `${numValue}pt`
                    })
                    .setMark("textStyle", { fontSize: `${numValue}pt` })
                    .run();
                } else {
                  // 선택 상태가 없으면 현재 커서 위치에 적용
                  handleFontSize(numValue);
                }
              }
            }}
            onBlur={() => {
              // Input에서 포커스가 벗어날 때 에디터에 다시 포커스
              if (editor && savedSelectionRef.current) {
                const { from, to } = savedSelectionRef.current;
                setTimeout(() => {
                  editor.chain().setTextSelection({ from, to }).focus().run();
                  savedSelectionRef.current = null;
                }, 0);
              }
            }}
            onKeyDown={(e) => {
              // Enter 키를 누르면 포커스를 에디터로 돌려보냄
              if (e.key === "Enter") {
                e.preventDefault();
                if (editor && savedSelectionRef.current) {
                  const { from, to } = savedSelectionRef.current;
                  editor.chain().setTextSelection({ from, to }).focus().run();
                  savedSelectionRef.current = null;
                }
              }
            }}
            {...inputProps}
            suffix={"pt"}
            style={{ width: "50px" }}
            border={false}
            background="transparent"
          />
        </div>
        {renderBtn(
          editor,
          HiPlus,
          () => handleFontSize(currentFontSize + 1),
          !editor,
          ""
        )}
      </div>
      <Divider
        vertical
        style={{ height: "20px", margin: "0" }}
        borderColor={`${setting.theme}-3`}
      />
      {/* 폰트 굵기 등 스타일 */}
      <>
        {renderBtn(
          editor,
          PiTextBBold,
          () => editor?.chain()?.focus()?.toggleBold()?.run(),
          "",
          "굵게",
          !isEditorActive("bold")
        )}
        {renderBtn(
          editor,
          PiTextItalicBold,
          () => editor?.chain()?.focus()?.toggleItalic()?.run(),
          "",
          "기울임",
          !isEditorActive("italic")
        )}
        {renderBtn(
          editor,
          PiTextStrikethroughBold,
          () => editor?.chain()?.focus()?.toggleStrike()?.run(),
          "",
          "취소선",
          !isEditorActive("strike")
        )}
        {renderBtn(
          editor,
          PiTextUnderlineBold,
          () => editor?.chain()?.focus()?.toggleUnderline()?.run(),
          "",
          "밑줄",
          !isEditorActive("underline")
        )}
        <div onDoubleClick={handleInlineTagUnset}>
          {isEditorActive("inlineTag") ? (
            <ColorPicker
              open={inlineTagColorPickerOpen}
              setOpen={setInlineTagColorPickerOpen}
              color={inlineTagColor || defaultInlineTagColor}
              onChange={handleInlineTagColorChange}
              mode="preset"
            >
              <ToolbarIconButton
                editor={editor}
                label={TbTag}
                onClick={handleInlineTagClick}
                tooltip="태그"
                active
                theme={setting.theme}
              />
            </ColorPicker>
          ) : (
            <ToolbarIconButton
              editor={editor}
              label={TbTag}
              onClick={handleInlineTagClick}
              tooltip="태그"
              active={false}
              theme={setting.theme}
            />
          )}
        </div>
      </>
      {/* 색상 */}
      <>
        {/* 글자색 */}
        <div
          onMouseDown={(event) => {
            event.preventDefault();
            saveCellSelection();
          }}
        >
          <ColorPicker
            open={fontColorPickerOpen}
            setOpen={setFontColorPickerOpen}
            color={fontColor}
            onChange={(color) => {
              if (!fontColorPickerOpen) return;
              if (!editorMounted || !hasEditorView(editor)) return;
              setFontColor(color.hex);
              if (!applyTextStyleToSelection({ color: color.hex })) {
                editor?.chain()?.focus()?.setColor(color.hex)?.run();
              }
            }}
            mode="preset"
          >
            {renderBtn(editor, MdFormatColorText, () => {}, "", "글자색상")}
          </ColorPicker>
        </div>
      </>
      <>
        {/* 글자배경  색 */}
        <div
          onMouseDown={(event) => {
            event.preventDefault();
            saveCellSelection();
          }}
          onDoubleClick={() =>
            editor?.chain()?.focus()?.unsetBackgroundColor()?.run()
          }
        >
          <ColorPicker
            open={fontBackgroundColorPickerOpen}
            setOpen={setFontBackgroundColorPickerOpen}
            color={fontBackgroundColor}
            onChange={(color) => {
              if (!fontBackgroundColorPickerOpen) return;
              if (!editorMounted || !hasEditorView(editor)) return;
              setFontBackgroundColor(color.hex);
              if (!applyTextStyleToSelection({ backgroundColor: color.hex })) {
                editor?.chain()?.focus()?.setBackgroundColor(color.hex)?.run();
              }
            }}
            mode="preset"
          >
            {renderBtn(
              editor,
              MdFormatColorFill,
              () => {},
              "",
              "글자배경 색상"
            )}
          </ColorPicker>
        </div>
      </>
      <Divider
        vertical
        style={{ height: "20px", margin: "0" }}
        borderColor={`${setting.theme}-3`}
      />
      {/* 정렬 */}
      <>
        <Popover
          placement="bottom-center"
          trigger="click"
          border={false}
          arrow={false}
          style={getToolbarPopoverStyle()}
          content={
            <div className="flex items-center gap-1">
              {renderBtn(
                editor,
                PiTextAlignLeftBold,
                () => applyHeaderTextAlign("left"),
                "",
                "왼쪽 정렬",
                !isAlignLeft
              )}
              {renderBtn(
                editor,
                PiTextAlignCenterBold,
                () => applyHeaderTextAlign("center"),
                "",
                "가운데 정렬",
                !isAlignCenter
              )}
              {renderBtn(
                editor,
                PiTextAlignRightBold,
                () => applyHeaderTextAlign("right"),
                "",
                "오른쪽 정렬",
                !isAlignRight
              )}
              {renderBtn(
                editor,
                PiTextAlignJustifyBold,
                () => applyHeaderTextAlign("justify"),
                "",
                "양쪽 정렬",
                !isAlignJustify
              )}
            </div>
          }
        >
          {renderBtn(
            editor,
            currentAlignIcon,
            () => {},
            "",
            "정렬",
            true,
            true
          )}
        </Popover>
        {/* [추가] 들여쓰기 & 내어쓰기 버튼 */}
        {renderBtn(
          editor,
          PiTextOutdentFill,
          () => editor?.chain()?.focus()?.outdent()?.run(),
          "",
          "내어쓰기"
        )}
        {renderBtn(
          editor,
          PiTextIndentFill,
          () => editor?.chain()?.focus()?.indent()?.run(),
          "",
          "들여쓰기"
        )}
        {renderBtn(
          editor,
          TbColumns,
          () => handleColumnToggle(),
          "",
          "단 분할"
        )}
        {renderBtn(
          editor,
          TbTextWrap,
          () => {
            if (!editor) return;

            editor.commands.setWordBreak(
              paragraphWordBreak === "break-all" ? "keep-all" : "break-all"
            );
          },
          "",
          `단어 잘림 ${paragraphWordBreak === "break-all" ? "해제" : "설정"}`,
          paragraphWordBreak === "break-all"
        )}
      </>
      <Divider
        vertical
        style={{ height: "20px", margin: "0" }}
        borderColor={`${setting.theme}-3`}
      />

      {/* 위 첨자 & 아래 첨자 */}
      <>
        {renderBtn(
          editor,
          LuSuperscript,
          () => editor?.chain()?.focus()?.toggleSuperscript()?.run(),
          "",
          "위 첨자",
          !isEditorActive("superscript")
        )}
        {renderBtn(
          editor,
          LuSubscript,
          () => editor?.chain()?.focus()?.toggleSubscript()?.run(),
          "",
          "아래 첨자",
          !isEditorActive("subscript")
        )}
      </>

      <Divider
        vertical
        style={{ height: "20px", margin: "0" }}
        borderColor={`${setting.theme}-3`}
      />
      {/* 리스트 */}
      <>
        <Popover
          placement="bottom-center"
          trigger="click"
          border={false}
          arrow={false}
          style={getToolbarPopoverStyle()}
          content={
            <div className="flex items-center gap-1">
              {renderBtn(
                editor,
                PiListBulletsBold,
                () => editor?.chain()?.focus()?.toggleBulletList()?.run(),
                "",
                "기호 리스트",
                !isBulletListActive
              )}
              {renderBtn(
                editor,
                PiListNumbersBold,
                () => editor?.chain()?.focus()?.toggleOrderedList()?.run(),
                "",
                "순서 리스트",
                !isOrderedListActive
              )}
              {renderBtn(
                editor,
                PiListChecksBold,
                () => editor?.chain()?.focus()?.toggleTaskList()?.run(),
                "",
                "체크박스 리스트",
                !isTaskListActive
              )}
            </div>
          }
        >
          {renderBtn(
            editor,
            currentListIcon,
            () => {},
            "",
            "리스트",
            !isAnyListActive,
            true
          )}
        </Popover>
      </>
      <Divider
        vertical
        style={{ height: "20px", margin: "0" }}
        borderColor={`${setting.theme}-3`}
      />
      {/* 인용, 코드, 테이블 */}
      <>
        {renderBtn(
          editor,
          TbBlockquote,
          () => editor?.chain()?.focus()?.toggleBlockquote()?.run(),
          "",
          "인용 블록 삽입",
          !isEditorActive("blockquote")
        )}
        {renderBtn(
          editor,
          Code,
          () => editor?.chain()?.focus()?.toggleCodeBlock()?.run(),
          "",
          "코드 블록 삽입",
          !isEditorActive("codeBlock")
        )}
        <Popover
          placement="bottom-center"
          trigger="click"
          border={false}
          arrow={false}
          style={withOverlayShadow()}
          content={
            <div className="flex flex-col items-center">
              <Typography size="sm" pretendard="SB">
                테이블 삽입
              </Typography>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(10, 18px)",
                  gap: "3px",
                  margin: "8px 0"
                }}
                onMouseLeave={() => setTableHover({ col: 0, row: 0 })}
              >
                {Array.from({ length: 5 }, (_, rowIdx) =>
                  Array.from({ length: 10 }, (_, colIdx) => (
                    <div
                      key={`${rowIdx}-${colIdx}`}
                      style={{
                        width: 18,
                        height: 18,
                        border: `1px solid`,
                        borderColor:
                          rowIdx < tableHover.row && colIdx < tableHover.col
                            ? currentColors[setting.theme][7]
                            : currentColors.white[5],
                        backgroundColor:
                          rowIdx < tableHover.row && colIdx < tableHover.col
                            ? currentColors[setting.theme][2]
                            : "transparent",
                        cursor: "pointer",
                        borderRadius: 2
                      }}
                      onMouseEnter={() =>
                        setTableHover({ col: colIdx + 1, row: rowIdx + 1 })
                      }
                      onClick={() => {
                        if (tableHover.col > 0 && tableHover.row > 0) {
                          editor
                            ?.chain()
                            ?.focus()
                            ?.insertTable({
                              rows: tableHover.row,
                              cols: tableHover.col
                            })
                            ?.run();
                        }
                      }}
                    />
                  ))
                ).flat()}
              </div>
              <Typography
                size="xs"
                style={{ textAlign: "center", marginBottom: 4 }}
              >
                {tableHover.col > 0 && tableHover.row > 0
                  ? `${tableHover.col} × ${tableHover.row}`
                  : "셀을 선택하세요"}
              </Typography>
            </div>
          }
        >
          {renderBtn(editor, PiTableFill, () => {}, "", "테이블 삽입")}
        </Popover>
        {renderBtn(
          editor,
          RiRectangleLine,
          () => editor?.chain()?.focus()?.insertShapeBlock().run(),
          "",
          "도형 삽입"
        )}
        {renderBtn(
          editor,
          TbSitemap,
          () => editor?.chain()?.focus()?.insertDiagramBlock().run(),
          "",
          "다이어그램 삽입"
        )}
        <Upload
          listType="none"
          ext={["png", "jpg", "jpeg"]}
          onChange={(img) => {
            if (!editorMounted || !hasEditorView(editor)) return;
            handleUploadImg(img);
          }}
        >
          {renderBtn(editor, PhotoOutline, () => {}, "", "그림 삽입")}
        </Upload>
        <ToolbarIconButton
          editor={editor}
          label={TbTextCaption}
          onClick={handleInsertCaption}
          theme={setting.theme}
          tooltip="캡션 넣기"
          disabled={!captionButtonEnabled}
          buttonStyle={{ padding: "4px 8px" }}
        />
        {renderBtn(
          editor,
          "각",
          () => handleInsertNote("footnote"),
          "",
          "각주 삽입 (Ctrl+N, N / Ctrl/⌘+Alt+F)",
          true,
          false,
          {
            "data-testid": "insert-footnote-button",
            "aria-label": "각주 삽입",
            disabled: !editor?.isEditable,
            buttonStyle: { padding: "4px 8px" }
          }
        )}
        {renderBtn(
          editor,
          "미",
          () => handleInsertNote("endnote"),
          "",
          "미주 삽입 (Ctrl+N, E / Ctrl/⌘+Alt+D)",
          true,
          false,
          {
            "data-testid": "insert-endnote-button",
            "aria-label": "미주 삽입",
            disabled: !editor?.isEditable,
            buttonStyle: { padding: "4px 8px" }
          }
        )}
      </>
      <Divider
        vertical
        style={{ height: "20px", margin: "0" }}
        borderColor={`${setting.theme}-3`}
      />
      {/* 문서 설정 */}
      <>
        {renderBtn(
          editor,
          TbPageBreak,
          async () => {
            const nextViewPage = !viewPage;
            setViewPage(nextViewPage);
            toast.success(
              nextViewPage
                ? "페이지 뷰 모드로 전환되었습니다."
                : "페이지 뷰 모드가 해제되었습니다."
            );
            await saveDocument(document._id, { viewPage: nextViewPage }, true);
          },
          "",
          "페이지 뷰",
          !viewPage,
          true
        )}
        {viewPage &&
          renderBtn(
            editor,
            TbNumbers,
            async () => {
              const rotation = {
                none: "center",
                center: "left",
                left: "right",
                right: "none"
              };
              const next = rotation[pageNumber] || "center";
              setPageNumber(next);
              const labels = {
                center: "가운데",
                left: "왼쪽",
                right: "오른쪽",
                none: "없음"
              };
              toast.success(`쪽 번호: ${labels[next]}`);
              await saveDocument(document._id, { pageNumber: next }, true);
            },
            "",
            `쪽 번호 (${pageNumber === "none" ? "없음" : pageNumber === "center" ? "가운데" : pageNumber === "left" ? "왼쪽" : "오른쪽"})`,
            pageNumber === "none",
            true
          )}
        {renderBtn(
          editor,
          GrDocumentConfig,
          () => setDocSettingModalOpen(true),
          "",
          "문서 설정",
          true,
          true
        )}
        {/* 내보내기 드롭다운 */}

        <Tooltip
          content={
            <Typography size="xs" pretendard="M">
              내보내기
            </Typography>
          }
          placement="bottom"
          background={`${setting.theme}-7`}
          color={`${setting.theme}-1`}
          border={false}
          style={withOverlayShadow()}
        >
          <Popover
            placement="bottom-center"
            trigger="click"
            border={false}
            arrow={false}
            style={getToolbarPopoverStyle()}
            content={
              <div className="flex items-center gap-1 flex-wrap">
                {exportOptions.map((option) => (
                  <span
                    key={option.key}
                    data-testid={
                      option.testId || `hwpx-export-option-${option.key}`
                    }
                    style={{ display: "inline-flex" }}
                  >
                    <Button
                      colorType="text"
                      color={`${setting.theme}-9`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={option.onClick}
                      className="hover-scale-8"
                      style={{ padding: "4px 8px" }}
                    >
                      <Typography
                        size="xs"
                        className="font-anja-eliane tracking-tighter"
                      >
                        {option.label}
                      </Typography>
                    </Button>
                  </span>
                ))}
              </div>
            }
          >
            {withToolbarTestId(
              "hwpx-export-menu-button",
              <Button
                colorType="text"
                color={`${setting.theme}-9`}
                className="hover-scale-8"
                icon={<TbPackageExport size={16} />}
                style={{ padding: "4px" }}
              />
            )}
          </Popover>
        </Tooltip>
        <Tooltip
          content={
            <Typography size="xs" pretendard="M">
              목차 삽입
            </Typography>
          }
          placement="bottom"
          background={`${setting.theme}-7`}
          color={`${setting.theme}-1`}
          border={false}
          style={withOverlayShadow()}
        >
          <Popover
            placement="bottom-center"
            trigger="click"
            border={false}
            arrow={false}
            style={getToolbarPopoverStyle()}
            content={
              <div className="flex items-center gap-1 flex-wrap">
                <Button
                  colorType="text"
                  color={`${setting.theme}-9`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={insertTocContent}
                  className="hover-scale-8"
                  style={{ padding: "4px 8px" }}
                >
                  <Typography
                    size="xs"
                    className="font-anja-eliane tracking-tighter"
                  >
                    목차
                  </Typography>
                </Button>
                {captionTocMenuItems.map((targetType) => {
                  const config = getCaptionTargetConfig(targetType);

                  if (!config) {
                    return null;
                  }

                  return (
                    <Button
                      key={targetType}
                      colorType="text"
                      color={`${setting.theme}-9`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertCaptionTocContent(targetType)}
                      className="hover-scale-8"
                      style={{ padding: "4px 8px" }}
                    >
                      <Typography
                        size="xs"
                        className="font-anja-eliane tracking-tighter"
                      >
                        {config.tocTitle}
                      </Typography>
                    </Button>
                  );
                })}
              </div>
            }
          >
            <Button
              colorType="text"
              color={`${setting.theme}-9`}
              className="hover-scale-8"
              icon={<PiListNumbersBold size={16} />}
              style={{ padding: "4px" }}
            />
          </Popover>
        </Tooltip>
      </>
      <Divider
        vertical
        style={{ height: "20px", margin: "0" }}
        borderColor={`${setting.theme}-3`}
      />


      <DocSettingModal
        setDocSettingModalOpen={setDocSettingModalOpen}
        docSettingModalOpen={docSettingModalOpen}
      />
    </Div>
  );
}
