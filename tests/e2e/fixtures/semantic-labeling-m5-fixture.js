import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { Editor, Node } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Heading from "@tiptap/extension-heading";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";

import SemanticAttributesEditor from "../../../app/LIB/components/common/semantic/SemanticAttributesEditor";
import BlockIdentity from "../../../app/LIB/extensions/BlockIdentity";
import SemanticAttributes from "../../../app/LIB/extensions/SemanticAttributes";

const M5Heading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      headingId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-heading-id"),
        renderHTML: (attributes) =>
          attributes.headingId
            ? { "data-heading-id": attributes.headingId }
            : {}
      }
    };
  }
});

const M5Shape = Node.create({
  name: "shapeBlock",
  group: "block",
  content: "block+",
  addAttributes() {
    return {
      objectId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-object-id"),
        renderHTML: (attributes) =>
          attributes.objectId ? { "data-object-id": attributes.objectId } : {}
      }
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="shape-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        "data-type": "shape-block",
        class: "shape-preview"
      },
      0
    ];
  }
});

const editor = new Editor({
  element: document.createElement("div"),
  extensions: [
    Document,
    Paragraph,
    M5Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    Text,
    M5Shape,
    BlockIdentity,
    SemanticAttributes
  ],
  content: {
    type: "doc",
    content: [
      {
        type: "shapeBlock",
        attrs: {
          objectId: "object-cover",
          semanticKey: "cover.hero",
          semanticRole: "visualBlock",
          semanticTags: ["accent", "cover"]
        },
        content: [
          {
            type: "heading",
            attrs: {
              level: 1,
              blockId: "block-cover-title",
              headingId: "heading-cover-title",
              semanticKey: "cover.title",
              semanticRole: "documentTitle",
              semanticTags: ["cover"]
            },
            content: [{ type: "text", text: "사람과 AI가 함께 쓰는 문서" }]
          },
          {
            type: "paragraph",
            attrs: {
              blockId: "block-existing",
              semanticKey: "body.existing",
              semanticRole: "body"
            },
            content: [
              {
                type: "text",
                text: "의미 정보는 화면 모양을 바꾸지 않고 문서와 함께 저장됩니다."
              }
            ]
          }
        ]
      }
    ]
  }
});

const targets = Object.freeze({
  shape: {
    type: "shapeBlock",
    label: "표지 도형",
    position: 0,
    identityAttribute: "objectId",
    stableId: "object-cover"
  },
  heading: {
    type: "heading",
    label: "내부 제목",
    position: 1,
    identityAttribute: "blockId",
    stableId: "block-cover-title"
  }
});

const stripSemanticAttributes = (html) => {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("*").forEach((element) => {
    element.removeAttribute("data-dockit-semantic-key");
    element.removeAttribute("data-dockit-semantic-role");
    element.removeAttribute("data-dockit-semantic-tags");
  });
  return template.innerHTML;
};

const App = () => {
  const [targetName, setTargetName] = useState("shape");
  const [, setRevision] = useState(0);

  useEffect(() => {
    const handleTransaction = () => setRevision((value) => value + 1);
    editor.on("transaction", handleTransaction);
    return () => editor.off("transaction", handleTransaction);
  }, []);

  const semanticHtml = editor.getHTML();
  const plainHtml = stripSemanticAttributes(semanticHtml);

  return (
    <div className="m5-shell">
      <h1 className="m5-title">의미 저장 M5 통합 확인</h1>
      <p className="m5-subtitle">
        실제 의미 편집기와 읽기 전용 렌더를 같은 문서 상태에서 확인합니다.
      </p>
      <div className="m5-grid">
        <section className="m5-card" aria-label="의미 편집">
          <div className="m5-targets">
            <button
              type="button"
              data-testid="m5-target-shape"
              aria-pressed={targetName === "shape"}
              onClick={() => setTargetName("shape")}
            >
              도형 편집
            </button>
            <button
              type="button"
              data-testid="m5-target-heading"
              aria-pressed={targetName === "heading"}
              onClick={() => setTargetName("heading")}
            >
              내부 제목 편집
            </button>
          </div>
          <SemanticAttributesEditor
            editor={editor}
            target={targets[targetName]}
            compact
          />
        </section>
        <section className="m5-card" aria-label="읽기 전용 비교">
          <div className="m5-previews">
            <div>
              <p className="m5-preview-title">의미 속성 제외</p>
              <div
                className="m5-preview-canvas"
                data-testid="m5-preview-plain"
                aria-readonly="true"
                dangerouslySetInnerHTML={{ __html: plainHtml }}
              />
            </div>
            <div>
              <p className="m5-preview-title">의미 속성 포함</p>
              <div
                className="m5-preview-canvas"
                data-testid="m5-preview-semantic"
                aria-readonly="true"
                dangerouslySetInnerHTML={{ __html: semanticHtml }}
              />
            </div>
          </div>
          <p className="m5-contract">
            두 미리보기는 저장 속성만 다르고 계산 스타일과 레이아웃은 같습니다.
          </p>
        </section>
      </div>
    </div>
  );
};

const snapshot = () => {
  const currentDocument = editor.getJSON();
  return {
    currentDocument,
    html: editor.getHTML()
  };
};

const root = createRoot(document.querySelector("#root"));
root.render(<App />);

window.__dockitSemanticM5 = Object.freeze({ snapshot });
window.addEventListener("beforeunload", () => editor.destroy(), { once: true });
document.body.dataset.fixtureStatus = "ready";
