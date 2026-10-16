import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Divider, Input, Skeleton, Typography, toast, Div } from "sud-ui";
import WidgetCard from "./WidgetCard";
import { useStylePreset } from "../../context/StylePresetContext";
import { useEditor } from "../../context/EditorContext";
import { useDocument } from "../../context/DocumentContext";
import { useSetting } from "../../context/SettingContext";
import {
  inputProps,
  newShadowDarkSm,
  newShadowLightSm
} from "../../constant/uiProps";
import {
  applyStylePresetToEditor,
  getCurrentBlockStylePreset
} from "../../utils/stylePresetUtils";
import { MdAdd, MdDragIndicator, MdEdit, MdStyle } from "react-icons/md";
import { useDarkMode } from "../../context/DarkModeContext";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ModalActionButton, ModalFrame } from "../common/modal/ModalPrimitives";

const getPreviewStyle = (preset) => ({
  fontSize: preset.fontSize ? `${preset.fontSize}pt` : undefined,
  fontWeight: preset.bold ? 700 : 400,
  fontStyle: preset.italic ? "italic" : "normal",
  textDecoration: [
    preset.underline ? "underline" : null,
    preset.strike ? "line-through" : null
  ]
    .filter(Boolean)
    .join(" "),
  color: preset.color || undefined,
  backgroundColor: preset.backgroundColor || undefined,
  letterSpacing:
    preset.letterSpacing != null ? `${preset.letterSpacing}pt` : undefined,
  textAlign: preset.textAlign || undefined,
  lineHeight: preset.lineHeight || undefined
});

const buildDefaultStylePresets = ({ defaultLineHeight }) => [
  {
    key: "style-default-heading1",
    title: "제목1",
    blockType: "heading",
    level: 1,
    fontSize: 24,
    bold: true,
    italic: false,
    underline: false,
    strike: false,
    color: null,
    backgroundColor: null,
    highlight: null,
    textAlign: "left",
    lineHeight: defaultLineHeight,
    indent: 0,
    indentLevel: 0,
    wordBreak: null,
    letterSpacing: 0,
    createdAt: 1,
    updatedAt: 1
  },
  {
    key: "style-default-heading2",
    title: "제목2",
    blockType: "heading",
    level: 2,
    fontSize: 20,
    bold: true,
    italic: false,
    underline: false,
    strike: false,
    color: null,
    backgroundColor: null,
    highlight: null,
    textAlign: "left",
    lineHeight: defaultLineHeight,
    indent: 0,
    indentLevel: 0,
    wordBreak: null,
    letterSpacing: 0,
    createdAt: 2,
    updatedAt: 2
  },
  {
    key: "style-default-heading3",
    title: "제목3",
    blockType: "heading",
    level: 3,
    fontSize: 16,
    bold: true,
    italic: false,
    underline: false,
    strike: false,
    color: null,
    backgroundColor: null,
    highlight: null,
    textAlign: "left",
    lineHeight: defaultLineHeight,
    indent: 0,
    indentLevel: 0,
    wordBreak: null,
    letterSpacing: 0,
    createdAt: 3,
    updatedAt: 3
  },
  {
    key: "style-default-body",
    title: "본문",
    blockType: "paragraph",
    level: null,
    fontSize: 12,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: null,
    backgroundColor: null,
    highlight: null,
    textAlign: "left",
    lineHeight: defaultLineHeight,
    indent: 0,
    indentLevel: 0,
    wordBreak: null,
    letterSpacing: 0,
    createdAt: 4,
    updatedAt: 4
  }
];

function StylePresetEditModal({
  open,
  onClose,
  onConfirm,
  editTitle,
  setEditTitle,
  isDarkMode,
  setting
}) {
  return (
    <ModalFrame open={open} onClose={onClose} isDarkMode={isDarkMode}>
      <div className="flex flex-col gap-2">
        <Typography pretendard="SB" size="lg">
          스타일 이름 변경
        </Typography>
        <Typography size="sm" color="cool-gray-6">
          스타일 이름만 수정합니다.
        </Typography>
        <Input
          {...inputProps}
          autoFocus
          value={editTitle}
          onChange={(event) => setEditTitle(event.target.value)}
          onEnter={onConfirm}
          placeholder="예: 제목1"
          background={`${setting.theme}-1`}
        />
        <div className="flex justify-end gap-2 mt-2.5">
          <ModalActionButton
            isDarkMode={isDarkMode}
            background={setting.theme}
            color={`${setting.theme}-1`}
            onClick={onConfirm}
            disabled={!editTitle.trim()}
          >
            저장
          </ModalActionButton>
          <ModalActionButton
            isDarkMode={isDarkMode}
            onClick={onClose}
            color="white-1"
            background="white-10"
          >
            취소
          </ModalActionButton>
        </div>
      </div>
    </ModalFrame>
  );
}

function SortablePresetItem({
  preset,
  hoveredPresetKey,
  setHoveredPresetKey,
  setting,
  handleApplyPreset,
  handleDeletePreset,
  handleOpenEditPreset
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: preset.key });

  const isHovered = hoveredPresetKey === preset.key;

  return (
    <Div
      ref={setNodeRef}
      className="relative w-full"
      onMouseEnter={() => setHoveredPresetKey(preset.key)}
      onMouseLeave={() =>
        setHoveredPresetKey((prev) => (prev === preset.key ? null : prev))
      }
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 5 : "auto"
      }}
    >
      <Div
        className="flex w-full gap-2 px-2.5 py-2 cursor-pointer rounded-2xl"
        background={isHovered ? `${setting.theme}-1` : "transparent"}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => handleApplyPreset(preset)}
        style={{
          transition: "background-color 160ms ease",
          opacity: isDragging ? 0.6 : 1
        }}
      >
        <Typography style={getPreviewStyle(preset)}>{preset.title}</Typography>
      </Div>
      <div
        className="absolute flex items-center gap-1"
        style={{
          top: "50%",
          right: "8px",
          transform: "translateY(-50%)",
          zIndex: 2,
          opacity: isHovered ? 1 : 0,
          pointerEvents: isHovered ? "auto" : "none",
          transition: "opacity 160ms ease"
        }}
      >
        <div
          {...attributes}
          {...listeners}
          onClick={(event) => event.stopPropagation()}
          style={{ cursor: isDragging ? "grabbing" : "grab" }}
        >
          <Button
            size="sm"
            border={false}
            shadow="none"
            background="white-10"
            color="white-1"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <MdDragIndicator size={16} />
          </Button>
        </div>
        <Button
          size="sm"
          border={false}
          shadow="none"
          background={`${setting.theme}-7`}
          color={`${setting.theme}-1`}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            handleOpenEditPreset(preset);
          }}
        >
          <MdEdit size={14} />
        </Button>
        <Button
          size="sm"
          border={false}
          shadow="none"
          background="volcano-7"
          color="volcano-1"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            handleDeletePreset(preset.key);
          }}
        >
          <Typography size="xs">삭제</Typography>
        </Button>
      </div>
    </Div>
  );
}

export default function StylePreset({ dragHandleProps }) {
  const { editor } = useEditor();
  const { docSetting } = useDocument();
  const { setting } = useSetting();
  const { isDarkMode } = useDarkMode();
  const { data, setStylePresetData, stylePresetLoading } = useStylePreset();
  const [presetTitle, setPresetTitle] = useState("");
  const [hoveredPresetKey, setHoveredPresetKey] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPresetKey, setEditingPresetKey] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const defaultPresetSeededRef = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    })
  );

  const stylePresetList = useMemo(() => data?.stylePreset || [], [
    data?.stylePreset
  ]);

  const presetIds = useMemo(
    () => stylePresetList.map((preset) => preset.key),
    [stylePresetList]
  );

  useEffect(() => {
    if (stylePresetLoading || defaultPresetSeededRef.current) {
      return;
    }

    if (stylePresetList.length > 0) {
      defaultPresetSeededRef.current = true;
      return;
    }

    defaultPresetSeededRef.current = true;
    setStylePresetData((prev) => {
      const currentList = Array.isArray(prev?.stylePreset)
        ? prev.stylePreset
        : [];

      if (currentList.length > 0) {
        return prev;
      }

      return {
        ...prev,
        stylePreset: buildDefaultStylePresets({
          defaultLineHeight: docSetting?.lineHeight || 1.5
        })
      };
    });
  }, [
    docSetting?.lineHeight,
    setStylePresetData,
    stylePresetList.length,
    stylePresetLoading
  ]);

  const handleSaveCurrentBlockStyle = () => {
    if (!editor) {
      toast.danger("에디터를 먼저 열어 주세요.");
      return;
    }

    const trimmedTitle = presetTitle.trim();

    if (!trimmedTitle) {
      toast.danger("스타일 이름을 입력해 주세요.");
      return;
    }

    const snapshot = getCurrentBlockStylePreset(editor, {
      defaultFontSize: 12,
      defaultLineHeight: docSetting?.lineHeight || 1.5
    });

    if (!snapshot) {
      toast.danger("현재 블록 스타일을 읽을 수 없습니다.");
      return;
    }

    const now = Date.now();
    const existingPreset = stylePresetList.find(
      (item) => item.title?.trim() === trimmedTitle
    );
    const nextPreset = {
      ...snapshot,
      title: trimmedTitle,
      key: existingPreset?.key || snapshot.key,
      createdAt: existingPreset?.createdAt || now,
      updatedAt: now
    };

    setStylePresetData((prev) => {
      const currentList = Array.isArray(prev?.stylePreset)
        ? prev.stylePreset
        : [];

      if (existingPreset) {
        return {
          ...prev,
          stylePreset: currentList.map((item) =>
            item.key === nextPreset.key ? nextPreset : item
          )
        };
      }

      return {
        ...prev,
        stylePreset: [nextPreset, ...currentList]
      };
    });

    toast.success(
      existingPreset ? "스타일을 덮어썼습니다." : "스타일을 저장했습니다."
    );
    setPresetTitle("");
  };

  const handleApplyPreset = (preset) => {
    if (!editor) {
      toast.danger("에디터를 먼저 열어 주세요.");
      return;
    }

    const applied = applyStylePresetToEditor(editor, preset);

    if (!applied) {
      toast.danger("스타일 적용에 실패했습니다.");
    }
  };

  const handleDeletePreset = (presetKey) => {
    setStylePresetData((prev) => ({
      ...prev,
      stylePreset: (prev?.stylePreset || []).filter(
        (item) => item.key !== presetKey
      )
    }));

    if (editingPresetKey === presetKey) {
      setEditModalOpen(false);
      setEditingPresetKey(null);
      setEditTitle("");
    }

    toast.info("스타일을 삭제했습니다.");
  };

  const handleOpenEditPreset = (preset) => {
    setEditingPresetKey(preset.key);
    setEditTitle(preset.title || "");
    setEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setEditModalOpen(false);
    setEditingPresetKey(null);
    setEditTitle("");
  };

  const handleConfirmEditPreset = () => {
    const trimmedTitle = editTitle.trim();

    if (!trimmedTitle || !editingPresetKey) {
      return;
    }

    const duplicatedPreset = stylePresetList.find(
      (item) =>
        item.key !== editingPresetKey && item.title?.trim() === trimmedTitle
    );

    if (duplicatedPreset) {
      toast.danger("같은 이름의 스타일이 이미 있습니다.");
      return;
    }

    setStylePresetData((prev) => ({
      ...prev,
      stylePreset: (prev?.stylePreset || []).map((item) =>
        item.key === editingPresetKey
          ? {
              ...item,
              title: trimmedTitle,
              updatedAt: Date.now()
            }
          : item
      )
    }));

    toast.success("스타일 이름을 변경했습니다.");
    handleCloseEditModal();
  };

  const handleDragEnd = ({ active, over }) => {
    if (!active?.id || !over?.id || active.id === over.id) {
      return;
    }

    setStylePresetData((prev) => {
      const currentList = Array.isArray(prev?.stylePreset)
        ? prev.stylePreset
        : [];
      const oldIndex = currentList.findIndex((item) => item.key === active.id);
      const newIndex = currentList.findIndex((item) => item.key === over.id);

      if (oldIndex < 0 || newIndex < 0) {
        return prev;
      }

      return {
        ...prev,
        stylePreset: arrayMove(currentList, oldIndex, newIndex)
      };
    });
  };
  return (
    <>
      <WidgetCard
        icon={MdStyle}
        title="스타일"
        dragHandleProps={dragHandleProps}
        widgetType="stylePreset"
      >
        <div className="w-full flex flex-col gap-2">
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "1fr 40px" }}
          >
            <Input
              {...inputProps}
              value={presetTitle}
              onChange={(event) => setPresetTitle(event.target.value)}
              placeholder="예: 제목1"
              background={`${setting.theme}-1`}
              onEnter={handleSaveCurrentBlockStyle}
            />
            <Button
              border={false}
              background="white-10"
              color="white-1"
              style={{
                ...(isDarkMode ? newShadowDarkSm : newShadowLightSm).style
              }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleSaveCurrentBlockStyle}
              size="sm"
            >
              <MdAdd />
            </Button>
          </div>

          <Typography size="xs" color="neutral-7">
            현재 블록 스타일을 저장합니다. 저장된 스타일은 행 전체를 눌러 바로
            적용할 수 있습니다.
          </Typography>

          <Divider style={{ margin: 0 }} />

          {stylePresetLoading ? (
            <Skeleton active ariaLabel="스타일 불러오는 중" />
          ) : stylePresetList.length === 0 ? (
            <Typography size="sm" color="neutral-7">
              저장된 스타일이 없습니다.
            </Typography>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={presetIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto">
                  {stylePresetList.map((preset) => (
                    <SortablePresetItem
                      key={preset.key}
                      preset={preset}
                      hoveredPresetKey={hoveredPresetKey}
                      setHoveredPresetKey={setHoveredPresetKey}
                      setting={setting}
                      handleApplyPreset={handleApplyPreset}
                      handleDeletePreset={handleDeletePreset}
                      handleOpenEditPreset={handleOpenEditPreset}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </WidgetCard>
      <StylePresetEditModal
        open={editModalOpen}
        onClose={handleCloseEditModal}
        onConfirm={handleConfirmEditPreset}
        editTitle={editTitle}
        setEditTitle={setEditTitle}
        isDarkMode={isDarkMode}
        setting={setting}
      />
    </>
  );
}

