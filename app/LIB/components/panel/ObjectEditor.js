import WidgetCard from "./WidgetCard";
import { TbEdit } from "react-icons/tb";
import { useEditor } from "../../context/EditorContext";
import { Typography } from "sud-ui";

import React from "react";
import TableEditor from "./EditorComponent/TableEditor";
import ShapeEditor from "./EditorComponent/ShapeEditor";
import { NodeSelection } from "@tiptap/pm/state";
import { useDarkMode } from "../../context/DarkModeContext";
import { useSetting } from "../../context/SettingContext";
import SemanticAttributesEditor from "../common/semantic/SemanticAttributesEditor";
import { getObjectSemanticEditorTarget } from "../../utils/semanticEditorUtils";

export default function ObjectEditor({ dragHandleProps }) {
  const { selectedObject, editor } = useEditor();
  const { isDarkMode } = useDarkMode();
  const { setting } = useSetting();
  const semanticTarget = React.useMemo(
    () => getObjectSemanticEditorTarget(editor?.state, selectedObject),
    [editor, selectedObject]
  );

  // 이미지 속성값을 실시간으로 추적하는 상태
  const [imageAttrs, setImageAttrs] = React.useState(null);
  // 도형 속성값을 실시간으로 추적하는 상태
  const [shapeAttrs, setShapeAttrs] = React.useState(null);
  // 비동기 업데이트(파일 업로드 등)를 위해 마지막으로 선택된 도형 위치 기억
  const lastShapeFromRef = React.useRef(null);
  // 이미지 속성값을 읽어오는 함수updateNodeAttrs
  const getImageAttrs = React.useCallback(() => {
    if (
      !selectedObject ||
      !editor ||
      selectedObject.node.type.name !== "image"
    ) {
      return null;
    }

    const { from } = selectedObject;
    const node = editor.state.doc.nodeAt(from);
    if (!node || node.type.name !== "image") return null;

    return node.attrs;
  }, [selectedObject, editor]);

  // 도형 속성값을 읽어오는 함수
  const getShapeAttrs = React.useCallback(() => {
    if (
      !selectedObject ||
      !editor ||
      selectedObject.node.type.name !== "shapeBlock"
    ) {
      return null;
    }

    const { from } = selectedObject;
    const node = editor.state.doc.nodeAt(from);
    if (!node || node.type.name !== "shapeBlock") return null;

    return node.attrs;
  }, [selectedObject, editor]);

  // 초기값 설정 및 selectedObject 변경 시 업데이트
  React.useEffect(() => {
    if (selectedObject && selectedObject.node.type.name === "image") {
      setImageAttrs(getImageAttrs());
      setShapeAttrs(null);
    } else if (
      selectedObject &&
      selectedObject.node.type.name === "shapeBlock"
    ) {
      setShapeAttrs(getShapeAttrs());
      setImageAttrs(null);
      lastShapeFromRef.current = selectedObject.from;
    } else {
      setImageAttrs(null);
      setShapeAttrs(null);
    }
  }, [selectedObject, getImageAttrs, getShapeAttrs]);

  // 에디터 변경사항을 실시간으로 감지
  React.useEffect(() => {
    if (
      !editor ||
      !selectedObject ||
      selectedObject.node.type.name !== "image"
    ) {
      return;
    }

    const updateAttrs = () => {
      const attrs = getImageAttrs();
      if (attrs) {
        setImageAttrs(attrs);
      }
    };

    editor.on("transaction", updateAttrs);

    return () => {
      editor.off("transaction", updateAttrs);
    };
  }, [editor, selectedObject, getImageAttrs]);
  // 에디터 변경사항을 실시간으로 감지 (도형)
  React.useEffect(() => {
    if (
      !editor ||
      !selectedObject ||
      selectedObject.node.type.name !== "shapeBlock"
    ) {
      return;
    }

    const updateAttrs = () => {
      const attrs = getShapeAttrs();
      if (attrs) {
        setShapeAttrs(attrs);
      }
    };

    editor.on("transaction", updateAttrs);

    return () => {
      editor.off("transaction", updateAttrs);
    };
  }, [editor, selectedObject, getShapeAttrs]);

  // 포커스/선택 변경 없이 노드 속성을 직접 업데이트하는 헬퍼
  const updateNodeAttrs = React.useCallback(
    (from, updates) => {
      if (!editor) return;

      const { tr } = editor.state;
      const node = tr.doc.nodeAt(from);
      if (!node) return;

      // 1. 노드 속성 업데이트
      tr.setNodeMarkup(from, undefined, { ...node.attrs, ...updates });

      // ✨ 핵심: 업데이트 직후 선택 영역이 안쪽 이미지로 튀지 않도록
      // 현재 도형 위치(from)에 선택 영역을 강제로 다시 설정합니다.
      if (editor.state.selection instanceof NodeSelection) {
        tr.setSelection(NodeSelection.create(tr.doc, from));
      }

      // 화면이 덜컥거리는 현상을 막기 위해 자동 스크롤 방지
      tr.setMeta("scrollIntoView", false);

      editor.view.dispatch(tr);
    },
    [editor]
  );

  // borderWidth, borderRadius 문자열을 숫자로 변환
  const processStyleUpdates = (styleUpdates) => {
    const processed = { ...styleUpdates };
    if (
      processed.borderWidth !== undefined &&
      typeof processed.borderWidth === "string"
    ) {
      const num = parseFloat(processed.borderWidth);
      processed.borderWidth = isNaN(num) ? 0 : num;
    }
    if (
      processed.borderRadius !== undefined &&
      typeof processed.borderRadius === "string"
    ) {
      const num = parseFloat(processed.borderRadius);
      processed.borderRadius = isNaN(num) ? 0 : num;
    }
    return processed;
  };

  // ■■■■■■■■■■■ 이미지 스타일 업데이트 ■■■■■■■■■■■
  const handleUpdateImageStyle = (styleUpdates, isSizeUpdate = false) => {
    if (!editor || !selectedObject || selectedObject.node.type.name !== "image")
      return;

    const { from } = selectedObject;

    if (isSizeUpdate) {
      const updates = {};
      if (styleUpdates.width !== undefined) updates.width = styleUpdates.width;
      if (styleUpdates.height !== undefined)
        updates.height = styleUpdates.height;
      updateNodeAttrs(from, updates);
    } else {
      updateNodeAttrs(from, processStyleUpdates(styleUpdates));
    }
  };
  // ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
  const handleUpdateImageSrc = (newSrc, newWidth, newHeight) => {
    if (!editor || !selectedObject) return;

    const { from } = selectedObject;
    const updatePayload = { src: newSrc };
    if (newWidth && newHeight) {
      updatePayload.width = newWidth;
      updatePayload.height = newHeight;
    }
    updateNodeAttrs(from, updatePayload);
  };

  // ■■■■■■■■■■■ 도형 스타일 업데이트 ■■■■■■■■■■■
  const handleUpdateShapeStyle = (styleUpdates, isSizeUpdate = false) => {
    if (!editor) return;

    // FileReader 같은 비동기 콜백에서 호출 시 selectedObject가 null일 수 있으므로 ref를 fallback으로 사용
    const from = selectedObject?.from ?? lastShapeFromRef.current;
    if (from === null || from === undefined) return;

    const targetNode = editor.state.doc.nodeAt(from);
    if (!targetNode || targetNode.type.name !== "shapeBlock") return;

    if (isSizeUpdate) {
      const updates = {};
      if (styleUpdates.width !== undefined) updates.width = styleUpdates.width;
      if (styleUpdates.height !== undefined)
        updates.height = styleUpdates.height;
      updateNodeAttrs(from, updates);
    } else {
      updateNodeAttrs(from, processStyleUpdates(styleUpdates));
    }
  };

  return (
    <WidgetCard
      icon={TbEdit}
      title="편집기"
      dragHandleProps={dragHandleProps}
      widgetType="objectEditor"
    >
      <div className="w-full flex flex-col gap-2">
        <div className="flex justify-center">
          {selectedObject ? (
            <div className="flex flex-col gap-2 items-center w-full">
              {selectedObject.node.type.name === "image" && imageAttrs && (
                <ShapeEditor
                  element={{
                    attrs: imageAttrs,
                    style: {
                      backgroundColor: "#ffffffff", // 이미지는 배경색 없음
                      borderColor: imageAttrs.borderColor || "#000000ff",
                      borderWidth:
                        typeof imageAttrs.borderWidth === "number"
                          ? imageAttrs.borderWidth
                          : typeof imageAttrs.borderWidth === "string"
                            ? parseFloat(imageAttrs.borderWidth) || 0
                            : 0,
                      borderStyle: imageAttrs.borderStyle || "solid",
                      borderRadius:
                        typeof imageAttrs.borderRadius === "number"
                          ? imageAttrs.borderRadius
                          : typeof imageAttrs.borderRadius === "string"
                            ? parseFloat(imageAttrs.borderRadius) || 0
                            : 0,
                      shadowEnabled: imageAttrs.shadowEnabled ?? false,
                      shadowOffsetX: imageAttrs.shadowOffsetX ?? 0,
                      shadowOffsetY: imageAttrs.shadowOffsetY ?? 0,
                      shadowBlur: imageAttrs.shadowBlur ?? 10,
                      shadowSpread: imageAttrs.shadowSpread ?? 1,
                      shadowColor: imageAttrs.shadowColor || "#000000ff",
                      shadowInset: imageAttrs.shadowInset ?? false,
                      opacity:
                        (imageAttrs.opacity !== undefined
                          ? imageAttrs.opacity
                          : 1) * 100,
                      filterBrightness: imageAttrs.filterBrightness ?? 100, // 없으면 기본값 100
                      filterContrast: imageAttrs.filterContrast ?? 100, // 없으면 기본값 100
                      filterGrayscale: imageAttrs.filterGrayscale ?? 0
                    },
                    size: {
                      width:
                        typeof imageAttrs.width === "number"
                          ? imageAttrs.width
                          : typeof imageAttrs.width === "string"
                            ? parseFloat(imageAttrs.width) || 52.9
                            : 52.9,
                      height:
                        typeof imageAttrs.height === "number"
                          ? imageAttrs.height
                          : typeof imageAttrs.height === "string"
                            ? parseFloat(imageAttrs.height) || 52.9
                            : 52.9
                    }
                  }}
                  onUpdateStyle={handleUpdateImageStyle}
                  onUpdateSrc={handleUpdateImageSrc}
                  isImage={true}
                  isDarkMode={isDarkMode}
                  setting={setting}
                />
              )}
              {selectedObject.node.type.name === "shapeBlock" && shapeAttrs && (
                <ShapeEditor
                  element={{
                    shapeType: "rectangle",
                    attrs: shapeAttrs,
                    style: {
                      backgroundColor:
                        shapeAttrs.backgroundColor || "#ffffffff",
                      borderColor: shapeAttrs.borderColor || "#000000ff",
                      borderWidth:
                        typeof shapeAttrs.borderWidth === "number"
                          ? shapeAttrs.borderWidth
                          : typeof shapeAttrs.borderWidth === "string"
                            ? parseFloat(shapeAttrs.borderWidth) || 0
                            : 0,
                      borderStyle: shapeAttrs.borderStyle || "solid",
                      borderRadius:
                        typeof shapeAttrs.borderRadius === "number"
                          ? shapeAttrs.borderRadius
                          : typeof shapeAttrs.borderRadius === "string"
                            ? parseFloat(shapeAttrs.borderRadius) || 0
                            : 0,
                      shadowEnabled: shapeAttrs.shadowEnabled ?? false,
                      shadowOffsetX: shapeAttrs.shadowOffsetX ?? 0,
                      shadowOffsetY: shapeAttrs.shadowOffsetY ?? 0,
                      shadowBlur: shapeAttrs.shadowBlur ?? 10,
                      shadowSpread: shapeAttrs.shadowSpread ?? 1,
                      shadowColor: shapeAttrs.shadowColor || "#00000040",
                      shadowInset: shapeAttrs.shadowInset ?? false,
                      rotation: shapeAttrs.rotation ?? 0,
                      justifyContent: shapeAttrs.justifyContent || "start",
                      paddingTop: shapeAttrs.paddingTop ?? 10,
                      paddingBottom: shapeAttrs.paddingBottom ?? 10,
                      paddingLeft: shapeAttrs.paddingLeft ?? 10,
                      paddingRight: shapeAttrs.paddingRight ?? 10,
                      backgroundImage: shapeAttrs.backgroundImage || "",
                      backgroundSize: shapeAttrs.backgroundSize || "cover",
                      backgroundPosition:
                        shapeAttrs.backgroundPosition || "center",
                      backgroundRepeat:
                        shapeAttrs.backgroundRepeat || "no-repeat"
                    },
                    size: {
                      width: shapeAttrs.width || 52.9,
                      height: shapeAttrs.height || 39.7
                    }
                  }}
                  onUpdateStyle={handleUpdateShapeStyle}
                  isImage={false}
                  isDarkMode={isDarkMode}
                  setting={setting}
                />
              )}

              {(selectedObject.node.type.name === "table" ||
                selectedObject.node.type.name === "tableCell" ||
                selectedObject.node.type.name === "tableHeader" ||
                selectedObject.node.type.name === "tableRow" ||
                selectedObject.node.type.name === "table_cell" ||
                selectedObject.node.type.name === "table_header" ||
                selectedObject.node.type.name === "table_row") && (
                <TableEditor
                  editor={editor}
                  selectedObject={selectedObject}
                  isDarkMode={isDarkMode}
                  setting={setting}
                />
              )}

              {semanticTarget && (
                <div className="w-full pt-2">
                  <SemanticAttributesEditor
                    editor={editor}
                    target={semanticTarget}
                  />
                </div>
              )}
            </div>
          ) : (
            <Typography color={"cool-gray-7"} size="sm">
              편집할 객체를 선택하세요.
            </Typography>
          )}
        </div>
      </div>
    </WidgetCard>
  );
}
