import { t as uiText, useI18n } from "../../i18n";
import { BubbleMenu } from "@tiptap/react/menus";
import { Div, Input, toast, Typography } from "sud-ui";
import { createPortal } from "react-dom";

import {
  PiTextBBold,
  PiTextHFiveBold,
  PiTextHFourBold,
  PiTextHOneBold,
  PiTextHSixBold,
  PiTextHThreeBold,
  PiTextHTwoBold,
  PiTextItalicBold,
  PiTextStrikethroughBold,
  PiTextUnderlineBold
} from "react-icons/pi";
import { TbTag } from "react-icons/tb";
import { useSetting } from "../../context/SettingContext";
import { useDarkMode } from "../../context/DarkModeContext";
import { isTocEntryNodeName } from "../../utils/editorContractUtils";
import { useEditor } from "../../context/EditorContext";
import { RiLinkM } from "react-icons/ri";
import { useLayout } from "../../context/LayoutContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "../../context/UserContext";
import { inputProps } from "../../constant/uiProps";
import { getEditorViewSafely } from "../../utils/editorViewUtils";
import {
  ToolbarDivider,
  ToolbarIconButton,
  ToolbarSurface
} from "../common/toolbar/ToolbarPrimitives";
import {
  DOCUMENT_OPERATION_SOURCES,
  DOCUMENT_OPERATION_TYPES,
  attachDocumentOperationTransactionMetadata,
  captureEditorDocumentOperationSnapshot,
  createDocumentBlockRangeOperation,
  createDocumentOperationNonce,
  createDocumentOperationExecutor,
  createDocumentRootOperation,
  getDocumentOperationId,
  getDocumentSemanticFingerprint,
  restoreEditorDocumentOperationSnapshot
} from "../../utils/documentOperationUtils";
import {
  createSemanticSelectionAnchor,
  resolveSemanticSelectionAnchor
} from "../../utils/semanticSelectionUtils";

const defaultPromptPosition = {
  top: 80,
  left: 24
};

const normalizeExternalUrl = (value) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const normalizedValue = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  try {
    const parsedUrl = new URL(normalizedValue);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
};

export default function TypeBubble({
  onDocumentOperationSettled,
  onDocumentOperationWillApply
}) {
  useI18n();
  const { editor } = useEditor();
  const { setting } = useSetting();
  const { isDarkMode, currentColors } = useDarkMode();
  const { layoutMode } = useLayout();
  const { user } = useUser();
  const [hasSelection, setHasSelection] = useState(false);
  const editorRef = useRef(editor);
  const documentOperationEditorRef = useRef(null);
  const documentOperationExecutorRef = useRef(null);
  editorRef.current = editor;
  if (
    !documentOperationExecutorRef.current ||
    documentOperationEditorRef.current !== editor
  ) {
    documentOperationEditorRef.current = editor;
    documentOperationExecutorRef.current = createDocumentOperationExecutor({
      getDocument: () => editorRef.current?.state?.doc,
      getRevision: (document) => getDocumentSemanticFingerprint(document),
      resolveBlockRange: resolveSemanticSelectionAnchor,
      captureDocument: (document) =>
        captureEditorDocumentOperationSnapshot(editorRef.current, document),
      restoreDocument: (snapshot) =>
        restoreEditorDocumentOperationSnapshot(editorRef.current, snapshot)
    });
  }
  const getDocumentOperationContext = useCallback(() => {
    const document = editorRef.current?.state?.doc;
    const fingerprint = getDocumentSemanticFingerprint(document);
    return { baseRevision: fingerprint, targetFingerprint: fingerprint };
  }, []);

  const executeDocumentRootOperation = useCallback(({
    apply, idempotencyKey, payload, source, type, documentOperationContext = null
  }) => {
    const context = documentOperationContext || getDocumentOperationContext();
    const operation = createDocumentRootOperation({
      actor: user?.uid ? `user:${user.uid}` : "local-user",
      baseRevision: context.baseRevision,
      idempotencyKey,
      payload,
      source,
      targetFingerprint: context.targetFingerprint,
      type
    });
    const operationId = getDocumentOperationId(operation);
    if (
      onDocumentOperationWillApply &&
      onDocumentOperationWillApply({ operation, operationId }) !== true
    ) {
      return false;
    }
    const result = documentOperationExecutorRef.current.execute(operation, apply);
    onDocumentOperationSettled?.({ operation, result });
    return result.ok;
  }, [getDocumentOperationContext, onDocumentOperationSettled, onDocumentOperationWillApply, user?.uid]);

  const executeDocumentBlockRangeOperation = useCallback(({
    apply, idempotencyKey, payload, source, target, type
  }) => {
    const operation = createDocumentBlockRangeOperation({
      actor: user?.uid ? `user:${user.uid}` : "local-user",
      baseRevision: target.blockFingerprint,
      idempotencyKey,
      payload,
      source,
      target,
      type
    });
    const operationId = getDocumentOperationId(operation);
    if (
      onDocumentOperationWillApply &&
      onDocumentOperationWillApply({ operation, operationId }) !== true
    ) {
      return false;
    }
    const result = documentOperationExecutorRef.current.execute(operation, apply);
    onDocumentOperationSettled?.({ operation, result });
    return result.ok;
  }, [onDocumentOperationSettled, onDocumentOperationWillApply, user?.uid]);

  const runManualBoldOperation = useCallback(() => {
    const idempotencyKey = `type-bubble-bold-${createDocumentOperationNonce()}`;
    const semanticAnchor = createSemanticSelectionAnchor(editorRef.current?.state);
    if (semanticAnchor) {
      return executeDocumentBlockRangeOperation({
        apply: (operationContext) => {
          const currentEditor = editorRef.current;
          if (!currentEditor || !operationContext.resolvedRange) return false;
          const chain = attachDocumentOperationTransactionMetadata(
            currentEditor.chain().focus().setTextSelection(operationContext.resolvedRange),
            operationContext
          );
          return chain.toggleBold().run();
        },
        idempotencyKey,
        payload: { mark: "bold" },
        source: DOCUMENT_OPERATION_SOURCES.MANUAL,
        target: semanticAnchor,
        type: DOCUMENT_OPERATION_TYPES.FORMAT_TOGGLE
      });
    }
    return executeDocumentRootOperation({
      apply: (operationContext) => {
        const currentEditor = editorRef.current;
        if (!currentEditor) return false;
        const chain = attachDocumentOperationTransactionMetadata(
          currentEditor.chain().focus(),
          operationContext
        );
        return chain.toggleBold().run();
      },
      idempotencyKey,
      payload: { mark: "bold" },
      source: DOCUMENT_OPERATION_SOURCES.MANUAL,
      type: DOCUMENT_OPERATION_TYPES.FORMAT_TOGGLE
    });
  }, [executeDocumentBlockRangeOperation, executeDocumentRootOperation]);
  const [isLinkPromptOpen, setIsLinkPromptOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkSelection, setLinkSelection] = useState(null);
  const [linkHadActiveMark, setLinkHadActiveMark] = useState(false);
  const [linkPromptPosition, setLinkPromptPosition] = useState(
    defaultPromptPosition
  );
  const linkPromptRef = useRef(null);

  const closeLinkPrompt = useCallback(() => {
    setIsLinkPromptOpen(false);
    setLinkUrl("");
    setLinkSelection(null);
    setLinkHadActiveMark(false);
  }, []);

  const getPromptPosition = useCallback(
    (selectionRange, panelRef, fallbackHeight = 180) => {
      try {
        const editorView = getEditorViewSafely(editor);

        if (!editorView || !selectionRange) {
          return defaultPromptPosition;
        }

        const start = editorView.coordsAtPos(selectionRange.from);
        const end = editorView.coordsAtPos(selectionRange.to);
        const promptWidth = 420;
        const viewportPadding = 16;
        const promptHeight = panelRef.current?.offsetHeight || fallbackHeight;
        const bubbleHeight = 52;
        const gapFromBubble = 16;
        const selectionCenter = (start.left + end.right) / 2;
        const nextLeft = Math.min(
          Math.max(selectionCenter - promptWidth / 2, viewportPadding),
          window.innerWidth - promptWidth - viewportPadding
        );

        // 위쪽 공간이 충분한지 체크하여 충분하지 않으면 아래쪽에 배치
        const spaceAbove = start.top - viewportPadding;
        const neededSpace = promptHeight + bubbleHeight + gapFromBubble;
        let nextTop;

        if (spaceAbove >= neededSpace) {
          nextTop = start.top - promptHeight - bubbleHeight - gapFromBubble;
        } else {
          nextTop = end.bottom + gapFromBubble;
        }

        // 최종 뷰포트 상하 한계 보정
        nextTop = Math.min(
          Math.max(nextTop, viewportPadding),
          window.innerHeight - promptHeight - viewportPadding
        );

        return {
          top: nextTop,
          left: nextLeft
        };
      } catch {
        return defaultPromptPosition;
      }
    },
    [editor]
  );

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const { selection } = editor.state;
      setHasSelection(!selection.empty && !selection.node);
    };
    update();
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  useEffect(() => {
    if (!hasSelection && isLinkPromptOpen) closeLinkPrompt();
  }, [closeLinkPrompt, hasSelection, isLinkPromptOpen]);

  useEffect(() => {
    if (
      !isLinkPromptOpen ||
      layoutMode === "mobile" ||
      !editor ||
      !linkSelection
    ) {
      return;
    }

    const updatePromptPosition = () => {
      setLinkPromptPosition(
        getPromptPosition(linkSelection, linkPromptRef, 160)
      );
    };

    updatePromptPosition();

    window.addEventListener("resize", updatePromptPosition);
    window.addEventListener("scroll", updatePromptPosition, true);

    return () => {
      window.removeEventListener("resize", updatePromptPosition);
      window.removeEventListener("scroll", updatePromptPosition, true);
    };
  }, [editor, getPromptPosition, isLinkPromptOpen, layoutMode, linkSelection]);

  const handleLinkButtonClick = () => {
    if (!editor) return;

    if (isLinkPromptOpen) {
      closeLinkPrompt();
      return;
    }

    const { selection } = editor.state;

    if (selection.empty || selection.node) {
      toast.danger(uiText("먼저 링크를 걸 텍스트를 선택해 주세요."));
      return;
    }

    const currentHref = editor.getAttributes("link").href || "";

    setLinkSelection({
      from: selection.from,
      to: selection.to
    });
    setLinkUrl(currentHref);
    setLinkHadActiveMark(Boolean(currentHref));
    setIsLinkPromptOpen(true);
  };

  const handleSetLink = () => {
    if (!editor || !linkSelection) {
      return;
    }

    const normalizedUrl = normalizeExternalUrl(linkUrl);

    if (!normalizedUrl) {
      toast.danger(uiText("http 또는 https 링크를 입력해 주세요."));
      return;
    }

    const didSetLink = editor
      .chain()
      .focus()
      .setTextSelection(linkSelection)
      .extendMarkRange("link")
      .setLink({ href: normalizedUrl })
      .run();

    if (!didSetLink) {
      toast.danger(uiText("링크를 적용할 수 없습니다."));
      return;
    }

    toast.success(uiText("링크를 적용했습니다."));
    closeLinkPrompt();
  };

  const handleRemoveLink = () => {
    if (!editor || !linkSelection || !linkHadActiveMark) {
      return;
    }

    const didUnsetLink = editor
      .chain()
      .focus()
      .setTextSelection(linkSelection)
      .extendMarkRange("link")
      .unsetLink()
      .run();

    if (!didUnsetLink) {
      toast.danger(uiText("링크를 제거할 수 없습니다."));
      return;
    }

    toast.success(uiText("링크를 제거했습니다."));
    closeLinkPrompt();
  };

  const isLinkActive = editor?.isActive("link");

  const renderBtn = (label, action, isActive, extraClass = "") => (
    <ToolbarIconButton
      label={label}
      onClick={action}
      active={isActive}
      theme={setting.theme}
      extraClass={`bubble-font ${extraClass}`.trim()}
      skipEditorCheck
      background={isActive ? `${setting.theme}-2` : undefined}
      color={isActive ? `${setting.theme}-10` : undefined}
    />
  );

  const btnConfigs = [
    {
      label: <PiTextBBold size={16} />,
      action: runManualBoldOperation,
      isActive: editor?.isActive("bold"),
      extraClass: "font-bold",
      name: "bold"
    },
    {
      label: <PiTextItalicBold size={16} />,
      action: () => editor?.chain().focus().toggleItalic().run(),
      isActive: editor?.isActive("italic"),
      extraClass: "italic",
      name: "italic"
    },
    {
      label: <PiTextStrikethroughBold size={16} />,
      action: () => editor?.chain().focus().toggleStrike().run(),
      isActive: editor?.isActive("strike"),
      extraClass: "line-through",
      name: "strike"
    },
    {
      label: <PiTextUnderlineBold size={16} />,
      action: () => editor?.chain().focus().toggleUnderline().run(),
      isActive: editor?.isActive("underline"),
      extraClass: "underline",
      name: "underline"
    },
    {
      label: <TbTag size={16} />,
      action: () => editor?.chain().focus().toggleInlineTag().run(),
      isActive: editor?.isActive("inlineTag"),
      extraClass: "font-bold",
      name: "inline-tag"
    },
    { name: "divider-1" },
    {
      label: <PiTextHOneBold size={16} />,
      action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: editor?.isActive("heading", { level: 1 }),
      extraClass: "font-bold",
      name: "h1"
    },
    {
      label: <PiTextHTwoBold size={16} />,
      action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: editor?.isActive("heading", { level: 2 }),
      extraClass: "font-bold",
      name: "h2"
    },
    {
      label: <PiTextHThreeBold size={16} />,
      action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: editor?.isActive("heading", { level: 3 }),
      extraClass: "font-bold",
      name: "h3"
    },
    {
      label: <PiTextHFourBold size={16} />,
      action: () => editor?.chain().focus().toggleHeading({ level: 4 }).run(),
      isActive: editor?.isActive("heading", { level: 4 }),
      extraClass: "font-bold",
      name: "h4"
    },
    {
      label: <PiTextHFiveBold size={16} />,
      action: () => editor?.chain().focus().toggleHeading({ level: 5 }).run(),
      isActive: editor?.isActive("heading", { level: 5 }),
      extraClass: "font-bold",
      name: "h5"
    },
    {
      label: <PiTextHSixBold size={16} />,
      action: () => editor?.chain().focus().toggleHeading({ level: 6 }).run(),
      isActive: editor?.isActive("heading", { level: 6 }),
      extraClass: "font-bold",
      name: "h6"
    },
    { name: "divider-2" },
    {
      label: (
        <Typography size="xs" pretendard="B">
          「···」
        </Typography>
      ),
      action: () => editor?.chain().focus().wrapWithBracket("「", "」").run(),
      isActive: false,
      extraClass: "font-bold",
      name: "「···」"
    },
    {
      label: (
        <Typography size="xs" pretendard="B">
          『···』
        </Typography>
      ),
      action: () => editor?.chain().focus().wrapWithBracket("『", "』").run(),
      isActive: false,
      extraClass: "font-bold",
      name: "『···』"
    },
    {
      label: (
        <Typography size="xs" pretendard="B">
          《···》
        </Typography>
      ),
      action: () => editor?.chain().focus().wrapWithBracket("《", "》").run(),
      isActive: false,
      extraClass: "font-bold",
      name: "《···》"
    },
    { name: "divider-3" },
    {
      label: <RiLinkM size={16} />,
      action: handleLinkButtonClick,
      isActive: isLinkPromptOpen || isLinkActive,
      extraClass: "font-bold",
      name: "link"
    }
  ];

  const linkPromptPanel = isLinkPromptOpen ? (
    <Div
      className="flex flex-col gap-2"
      style={{
        width: layoutMode === "mobile" ? "100%" : "420px"
      }}
    >
      <Typography size="xs" color="cool-gray-8">
        {linkHadActiveMark
          ? uiText("선택한 링크를 수정하거나 제거합니다.")
          : uiText("선택한 텍스트에 외부 링크를 추가합니다.")}
      </Typography>
      <Input
        {...inputProps}
        value={linkUrl}
        onChange={(event) => setLinkUrl(event.target.value)}
        placeholder="https://example.com"
        onEnter={handleSetLink}
        background={`${setting.theme}-1`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeLinkPrompt();
          }
        }}
      />
      <div className="flex justify-end w-full">
        <Typography size="xs" color="cool-gray-8">
          {uiText("Enter로 적용, Escape로 닫기")}</Typography>
      </div>
    </Div>
  ) : null;

  const toolbarButtons = (
    <>
      {hasSelection &&
        btnConfigs.map((btn) => {
          const isDivider = btn.name.includes("divider");
          if (isDivider)
            return (
              <ToolbarDivider
                key={btn.name}
                height="20px"
                margin="7px"
                borderColor="white-7"
                borderWeight={2}
              />
            );
          return (
            <div key={btn.name}>
              {renderBtn(btn.label, btn.action, btn.isActive, btn.extraClass)}
            </div>
          );
        })}
    </>
  );

  const bubbleContent = (
    <ToolbarSurface isDarkMode={isDarkMode}>{toolbarButtons}</ToolbarSurface>
  );

  const selectionIncludesTocItem = useCallback(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const domSelection = window.getSelection();

    if (!domSelection || domSelection.rangeCount === 0) {
      return false;
    }

    const range = domSelection.getRangeAt(0);
    const editorRoot = editor?.view?.dom;

    if (!editorRoot || !editorRoot.contains(range.commonAncestorContainer)) {
      return false;
    }

    return Array.from(
      editorRoot.querySelectorAll('[data-toc-item="true"]')
    ).some((tocItemElement) => {
      try {
        return range.intersectsNode(tocItemElement);
      } catch {
        return false;
      }
    });
  }, [editor]);

  if (layoutMode === "mobile") {
    if (!hasSelection && !isLinkPromptOpen) {
      return null;
    }
    return createPortal(
      <ToolbarSurface
        className="flex px-2.5 py-1 gap-2 overflow-x-auto"
        style={{
          position: "fixed",
          bottom: 30,
          left: 0,
          right: 0,
          zIndex: 1000,
          borderTop: `1px solid ${currentColors.white[4]}`,
          flexDirection: "column",
          alignItems: "stretch",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto"
        }}
      >
        <Div className="flex items-center gap-2 overflow-x-auto">
          {toolbarButtons}
        </Div>
        {isLinkPromptOpen && (
          <ToolbarSurface className="p-3 rounded-2xl" style={{}}>
            {linkPromptPanel}
          </ToolbarSurface>
        )}
      </ToolbarSurface>,
      document.body
    );
  }

  const linkPromptOverlay =
    isLinkPromptOpen &&
    createPortal(
      <ToolbarSurface
        ref={linkPromptRef}
        className="p-3 rounded-2xl"
        style={{
          position: "fixed",
          top: linkPromptPosition.top,
          left: linkPromptPosition.left,
          zIndex: 1200
        }}
      >
        {linkPromptPanel}
      </ToolbarSurface>,
      document.body
    );

  return (
    <>
      <BubbleMenu
        editor={editor}
        appendTo={typeof window !== "undefined" ? window.document.body : undefined}
        shouldShow={({ state }) => {
          const selection = state?.selection;

          if (!selection || selection.node) {
            return false;
          }

          if (selection.empty) {
            return false;
          }

          if (selectionIncludesTocItem()) {
            return false;
          }

          let includesTocItem = false;

          if (!selection.empty) {
            state.doc.nodesBetween(selection.from, selection.to, (node) => {
              if (isTocEntryNodeName(node.type.name)) {
                includesTocItem = true;
                return false;
              }

              return true;
            });
          }

          return !includesTocItem;
        }}
        options={{
          duration: 100,
          placement: "top",
          offset: [0, 8],
          boundary: "viewport",
          popperOptions: {
            modifiers: [
              {
                name: "preventOverflow",
                options: {
                  boundary: "viewport",
                  padding: 12
                }
              }
            ]
          }
        }}
      >
        {bubbleContent}
      </BubbleMenu>
      {linkPromptOverlay}
    </>
  );
}
