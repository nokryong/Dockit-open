import { DOMParser } from "@tiptap/pm/model";
import { validateNoteSemantics } from "./noteSemanticUtils";

export const NOTE_PERSISTENCE_ERROR_CODES = Object.freeze({
  INVALID_EDITOR: "NOTE_PERSISTENCE_INVALID_EDITOR",
  INVALID_HTML: "NOTE_PERSISTENCE_INVALID_HTML",
  PARSE_FAILED: "NOTE_PERSISTENCE_PARSE_FAILED",
  SEMANTIC_INVALID: "NOTE_PERSISTENCE_SEMANTIC_INVALID",
  STALE_SNAPSHOT: "NOTE_PERSISTENCE_STALE_SNAPSHOT",
  SET_CONTENT_FAILED: "NOTE_PERSISTENCE_SET_CONTENT_FAILED"
});

const rejected = (code, details = {}) => ({
  ok: false,
  result: "rejected",
  error: { code, ...details }
});

const accepted = (document, html, validation) => ({
  ok: true,
  result: "accepted",
  document,
  json: document.toJSON(),
  html,
  numbering: validation.numbering
});

const validateDocument = (document) => {
  const validation = validateNoteSemantics(document);
  return validation.valid
    ? { ok: true, validation }
    : rejected(NOTE_PERSISTENCE_ERROR_CODES.SEMANTIC_INVALID, {
        // 저장 진단 정보에 문서에서 나온 값 노출 금지
        semanticCodes: [...new Set(validation.errors.map(({ code }) => code))]
      });
};

const isEditorReady = (editor) =>
  Boolean(editor?.state?.doc && editor?.schema && !editor.isDestroyed);

const hasCanonicalNoteMarkup = (html) =>
  typeof html === "string" &&
  /data-dockit-note-(?:reference|body)\b/i.test(html);

const acceptLegacyHtmlWithoutEditor = (html) =>
  typeof html === "string" && !hasCanonicalNoteMarkup(html)
    ? {
        ok: true,
        result: "accepted",
        html,
        json: null,
        numbering: [],
        legacyWithoutEditor: true
      }
    : null;

/**
 * 한 번의 동기 에디터 상태에서 JSON과 HTML을 함께 가져와 그 ProseMirror 문서를 검증
 * (호출 쪽은 반환한 HTML만 저장)
 */
export const captureNotePersistenceSnapshot = (editor, fallbackHtml) => {
  if (!isEditorReady(editor)) {
    return (
      acceptLegacyHtmlWithoutEditor(fallbackHtml) ||
      rejected(NOTE_PERSISTENCE_ERROR_CODES.INVALID_EDITOR)
    );
  }

  const document = editor.state.doc;
  const validationResult = validateDocument(document);
  if (!validationResult.ok) return validationResult;

  let html;
  try {
    html = editor.getHTML();
  } catch {
    return rejected(NOTE_PERSISTENCE_ERROR_CODES.INVALID_EDITOR);
  }

  if (editor.state.doc !== document) {
    return rejected(NOTE_PERSISTENCE_ERROR_CODES.STALE_SNAPSHOT);
  }

  return accepted(document, html, validationResult.validation);
};

/**
 * 저장된 HTML을 현재 활성 에디터 스키마로 파싱
 * (잘못된 주석 노드는 주석 확장이 보존하고 의미 검증에서 거부)
 */
export const parseNotePersistenceHtml = (
  editor,
  html,
  { allowLegacyWithoutEditor = false } = {}
) => {
  if (!isEditorReady(editor)) {
    return (
      (allowLegacyWithoutEditor && acceptLegacyHtmlWithoutEditor(html)) ||
      rejected(NOTE_PERSISTENCE_ERROR_CODES.INVALID_EDITOR)
    );
  }
  if (typeof html !== "string") {
    return rejected(NOTE_PERSISTENCE_ERROR_CODES.INVALID_HTML);
  }

  try {
    const host = document.createElement("div");
    host.innerHTML = html;
    const candidate = DOMParser.fromSchema(editor.schema).parse(host);
    const validationResult = validateDocument(candidate);
    if (!validationResult.ok) return validationResult;
    return accepted(candidate, html, validationResult.validation);
  } catch {
    return rejected(NOTE_PERSISTENCE_ERROR_CODES.PARSE_FAILED);
  }
};

/**
 * 활성 스키마가 후보를 파싱·검증한 뒤에만 에디터 내용 교체
 * (거부된 후보는 현재 에디터 문서를 그대로 둠)
 */
export const restoreValidatedNotePersistenceHtml = (editor, html) => {
  const candidate = parseNotePersistenceHtml(editor, html);
  if (!candidate.ok) return candidate;

  const previousDocument = editor.state.doc;
  const previousJson = previousDocument.toJSON();
  const rollback = () => {
    try {
      const applied = editor.commands?.setContent(previousJson, false);
      return Boolean(applied && editor.state.doc.eq(previousDocument));
    } catch {
      return false;
    }
  };

  const rejectAppliedCandidate = (result) => {
    if (editor.state.doc.eq(previousDocument)) return result;
    const rolledBack = rollback();
    return rejected(result.error.code, {
      ...(result.error.semanticCodes
        ? { semanticCodes: result.error.semanticCodes }
        : {}),
      recoveryRequired: !rolledBack,
      rolledBack
    });
  };

  try {
    const applied = editor.commands?.setContent(candidate.json, false);
    if (!applied) {
      return rejectAppliedCandidate(
        rejected(NOTE_PERSISTENCE_ERROR_CODES.SET_CONTENT_FAILED)
      );
    }
  } catch {
    return rejectAppliedCandidate(
      rejected(NOTE_PERSISTENCE_ERROR_CODES.SET_CONTENT_FAILED)
    );
  }

  const restored = captureNotePersistenceSnapshot(editor);
  return restored.ok ? restored : rejectAppliedCandidate(restored);
};
