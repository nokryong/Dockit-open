/* @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSchema } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import BlockIdentity from "../../app/LIB/extensions/BlockIdentity.js";
import SemanticAttributes from "../../app/LIB/extensions/SemanticAttributes.js";
import { getTextSemanticEditorTarget } from "../../app/LIB/utils/semanticEditorUtils.js";

vi.mock("../../app/LIB/context/SettingContext", () => ({
  useSetting: () => ({ setting: { theme: "mint" } })
}));

import SemanticAttributesEditor from "../../app/LIB/components/common/semantic/SemanticAttributesEditor.js";

const schema = getSchema([
  Document,
  Paragraph,
  Text,
  BlockIdentity,
  SemanticAttributes
]);
const semanticCommand =
  SemanticAttributes.config.addCommands().setSemanticAttributes;

const createEditor = ({
  semanticKey = null,
  semanticRole = null,
  secondSemanticKey = null
} = {}) => {
  const doc = schema.nodeFromJSON({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: {
          blockId: "target-block",
          semanticKey,
          semanticRole
        },
        content: [{ type: "text", text: "대상 문단" }]
      },
      {
        type: "paragraph",
        attrs: {
          blockId: "other-block",
          semanticKey: secondSemanticKey
        },
        content: [{ type: "text", text: "다른 문단" }]
      }
    ]
  });
  const listeners = new Set();
  const editor = {
    state: EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 2)
    }),
    on: vi.fn((eventName, listener) => {
      if (eventName === "transaction") listeners.add(listener);
    }),
    off: vi.fn((eventName, listener) => {
      if (eventName === "transaction") listeners.delete(listener);
    }),
    commands: {}
  };
  editor.commands.setSemanticAttributes = vi.fn((position, attributes) =>
    semanticCommand(position, attributes)({
      state: editor.state,
      dispatch: (transaction) => {
        editor.state = editor.state.apply(transaction);
        listeners.forEach((listener) => listener({ transaction }));
      }
    })
  );
  return editor;
};

const renderEditor = (editor, props = {}) => {
  const target = getTextSemanticEditorTarget(editor.state);
  return render(
    React.createElement(SemanticAttributesEditor, {
      editor,
      target,
      ...props
    })
  );
};

afterEach(() => cleanup());

describe("SemanticAttributesEditor", () => {
  it("shows duplicate errors before mutation and keeps the document unchanged", async () => {
    const editor = createEditor({ secondSemanticKey: "already-used" });
    renderEditor(editor);
    expect(screen.getByTestId("semantic-attributes-editor").style.padding).toBe(
      "12px"
    );
    const keyInput = screen.getByRole("textbox", { name: "고유 이름" });
    expect(
      keyInput
        .getAttribute("aria-describedby")
        .split(" ")
        .every((id) => document.getElementById(id))
    ).toBe(true);

    fireEvent.change(keyInput, {
      target: { value: "already-used" }
    });

    expect(
      await screen.findByText("이 고유 이름은 문서 안에서 이미 사용 중입니다.")
    ).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "고유 이름" }).getAttribute(
        "aria-invalid"
      )
    ).toBe("true");
    expect(
      screen.getByRole("textbox", { name: "역할" }).getAttribute(
        "aria-invalid"
      )
    ).toBe("false");
    expect(screen.getByRole("button", { name: "적용" }).disabled).toBe(true);
    expect(editor.commands.setSemanticAttributes).not.toHaveBeenCalled();
    expect(editor.state.doc.child(0).attrs.semanticKey).toBeNull();
  });

  it("ignores Enter during IME composition and applies once after composition", async () => {
    const editor = createEditor();
    renderEditor(editor, { compact: true });
    expect(screen.getByTestId("semantic-attributes-editor").style.padding).toBe(
      "10px"
    );
    const keyInput = screen.getByRole("textbox", { name: "고유 이름" });

    fireEvent.compositionStart(keyInput);
    fireEvent.change(keyInput, { target: { value: "요약" } });
    fireEvent.keyDown(keyInput, { key: "Enter" });
    expect(editor.commands.setSemanticAttributes).not.toHaveBeenCalled();

    fireEvent.compositionEnd(keyInput);
    fireEvent.keyDown(keyInput, { key: "Enter" });

    await waitFor(() =>
      expect(editor.commands.setSemanticAttributes).toHaveBeenCalledTimes(1)
    );
    expect(editor.state.doc.child(0).attrs.semanticKey).toBe("요약");
    expect(await screen.findByText("문서 구조 정보를 저장했습니다.")).toBeTruthy();
  });

  it("cancels a draft with Escape without dispatching a mutation", () => {
    const editor = createEditor({ semanticKey: "original" });
    const onRequestClose = vi.fn();
    renderEditor(editor, { onRequestClose });
    const keyInput = screen.getByRole("textbox", { name: "고유 이름" });

    fireEvent.change(keyInput, { target: { value: "changed" } });
    fireEvent.keyDown(keyInput, { key: "Escape" });

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(editor.commands.setSemanticAttributes).not.toHaveBeenCalled();
    expect(editor.state.doc.child(0).attrs.semanticKey).toBe("original");
  });

  it("clears name and role in one explicit command", async () => {
    const editor = createEditor({
      semanticKey: "summary",
      semanticRole: "executive"
    });
    renderEditor(editor);

    fireEvent.click(
      screen.getByRole("button", { name: "이름·역할 지우기" })
    );

    await waitFor(() =>
      expect(editor.commands.setSemanticAttributes).toHaveBeenCalledTimes(1)
    );
    expect(editor.commands.setSemanticAttributes).toHaveBeenCalledWith(0, {
      semanticKey: null,
      semanticRole: null
    });
    expect(editor.state.doc.child(0).attrs).toMatchObject({
      semanticKey: null,
      semanticRole: null
    });
  });
});
