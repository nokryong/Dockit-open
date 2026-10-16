import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ShapeBlockView from "./ShapeBlockView";
import { mm2px, pt2px } from "../utils/unitUtils";

export const ShapeBlock = Node.create({
  name: "shapeBlock",

  group: "block",
  content: "block+",
  draggable: true,
  allowGapCursor: true,

  addAttributes() {
    return {
      // 크기 단위: mm
      width: {
        default: 52.9,
        parseHTML: (element) => element.getAttribute("data-width"),
        renderHTML: (attributes) => ({ "data-width": attributes.width })
      },
      height: {
        default: 52.9,
        parseHTML: (element) => element.getAttribute("data-height"),
        renderHTML: (attributes) => ({ "data-height": attributes.height })
      },
      objectId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-object-id") || null,
        renderHTML: (attributes) =>
          attributes.objectId ? { "data-object-id": attributes.objectId } : {}
      },
      textAlign: {
        default: "left",
        parseHTML: (element) =>
          element.getAttribute("data-text-align") || "left",
        renderHTML: (attributes) => ({
          "data-text-align": attributes.textAlign
        })
      },
      justifyContent: {
        default: "flex-start"
      },
      flexDirection: {
        default: "column",
        parseHTML: (element) => element.style.flexDirection || "column",
        renderHTML: (attributes) => ({
          style: `flex-direction: ${attributes.flexDirection}`
        })
      },
      backgroundColor: {
        default: "#ffffff"
      },
      borderColor: { default: "#000000" },
      // 선 두께 단위: pt
      borderWidth: { default: 0.75 },
      borderStyle: { default: "solid" },
      // 모서리 단위: mm
      borderRadius: { default: 0 },
      shadowEnabled: { default: false },
      // 그림자 단위: pt
      shadowOffsetX: { default: 0 },
      shadowOffsetY: { default: 0 },
      shadowBlur: { default: 7.5 },
      shadowSpread: { default: 0 },
      shadowColor: { default: "#000000" },
      shadowInset: { default: false },

      // 패딩 단위: mm
      paddingTop: { default: 2.6 },
      paddingBottom: { default: 2.6 },
      paddingLeft: { default: 2.6 },
      paddingRight: { default: 2.6 },

      // 배경 이미지
      backgroundImage: { default: "" },
      backgroundSize: { default: "cover" },
      backgroundPosition: { default: "center" },
      backgroundRepeat: { default: "no-repeat" }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="shape-block"]'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const {
      width,
      height,
      backgroundColor,
      borderWidth,
      borderStyle,
      borderColor,
      borderRadius,
      paddingTop,
      paddingBottom,
      paddingLeft,
      paddingRight,
      flexDirection,
      justifyContent,
      shadowEnabled,
      shadowOffsetX,
      shadowOffsetY,
      shadowBlur,
      shadowSpread,
      shadowColor,
      shadowInset,
      backgroundImage,
      backgroundSize,
      backgroundPosition,
      backgroundRepeat
    } = HTMLAttributes;

    // mm → px 변환
    const widthPx = mm2px(width ?? 52.9);
    const heightPx = mm2px(height ?? 52.9);
    const ptPx = mm2px(paddingTop ?? 2.6);
    const pbPx = mm2px(paddingBottom ?? 2.6);
    const plPx = mm2px(paddingLeft ?? 2.6);
    const prPx = mm2px(paddingRight ?? 2.6);
    const brPx = typeof borderRadius === "string" && borderRadius.includes("%")
      ? borderRadius
      : `${mm2px(borderRadius ?? 0)}px`;

    // pt → px 변환
    const bwPx = pt2px(borderWidth ?? 0.75);

    // 그림자 스타일
    let boxShadow = "none";
    if (shadowEnabled) {
      const inset = shadowInset ? "inset " : "";
      const ox = pt2px(shadowOffsetX ?? 0);
      const oy = pt2px(shadowOffsetY ?? 0);
      const blur = pt2px(shadowBlur ?? 7.5);
      const spread = pt2px(shadowSpread ?? 0);
      const color = shadowColor || "#000000";
      boxShadow = `${inset}${ox}px ${oy}px ${blur}px ${spread}px ${color}`;
    }

    const borderVal = `${bwPx}px ${borderStyle} ${borderColor}`;
    const paddingVal = `${ptPx}px ${prPx}px ${pbPx}px ${plPx}px`;

    const style = [
      `width: ${widthPx}px`,
      `min-height: ${heightPx}px`,
      `max-width: 100%`,
      `background-color: ${backgroundColor}`,
      ...(backgroundImage
        ? [
            `background-image: url("${backgroundImage}")`,
            `background-size: ${backgroundSize || "cover"}`,
            `background-position: ${backgroundPosition || "center"}`,
            `background-repeat: ${backgroundRepeat || "no-repeat"}`
          ]
        : []),
      `border: ${borderVal}`,
      `border-radius: ${brPx}`,
      `padding: ${paddingVal}`,
      "display: flex",
      `flex-direction: ${flexDirection}`,
      `justify-content: ${justifyContent || "flex-start"}`,
      `box-shadow: ${boxShadow}`,
      "box-sizing: border-box",
      "overflow-wrap: break-word",
      "word-break: break-word",
      // 인쇄용 CSS 변수
      `--shape-bg: ${backgroundColor}`,
      `--shape-border: ${borderVal}`,
      `--shape-border-radius: ${brPx}`,
      `--shape-shadow: ${boxShadow}`,
      `--shape-padding: ${paddingVal}`,
      `--shape-min-height: ${heightPx}px`
    ].join(";");

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "shape-block",
        class: "shape-block-container",
        style
      }),
      0
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ShapeBlockView);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleKeyDown(view, event) {
            if (event.key !== "Enter") return false;

            // event.target이 input/textarea/select이면 패널 입력이므로 무시
            const target = event.target;
            if (
              target instanceof HTMLElement &&
              ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
            )
              return false;

            const { selection } = view.state;
            if (
              !(selection instanceof NodeSelection) ||
              selection.node.type.name !== "shapeBlock"
            )
              return false;

            const afterPos =
              selection.$from.pos + selection.node.nodeSize;
            const paragraph =
              view.state.schema.nodes.paragraph.create();
            const tr = view.state.tr.insert(afterPos, paragraph);
            tr.setSelection(
              TextSelection.create(tr.doc, afterPos + 1)
            );
            view.dispatch(tr);
            return true;
          }
        }
      })
    ];
  },

  addCommands() {
    return {
      insertShapeBlock:
        (attributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
            content: [
              {
                type: "paragraph"
              }
            ]
          });
        }
    };
  }
});

export default ShapeBlock;
