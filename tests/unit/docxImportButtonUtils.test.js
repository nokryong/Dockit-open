import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { importDOCXToIR } from "../../app/LIB/ir/docxImport";
import { validateProseMirrorProjection } from "../../app/LIB/ir/proseMirrorProjectionValidation";
import { irToProseMirror } from "../../app/LIB/ir/toProseMirror";
import {
  DOCX_IMPORT_ERROR_MESSAGE,
  DOCX_IMPORT_MAX_BYTES,
  applyDOCXImportPreviewToEditor,
  createDOCXImportDryRunSummary,
  finishDOCXImportDryRun,
  isDOCXImportFileName,
  runDOCXImportDryRun,
  startDOCXImportDryRun,
  validateDOCXImportFile
} from "../../app/LIB/utils/docxImportButtonUtils";

const fixturePath = (...parts) =>
  path.join(process.cwd(), "tests", "fixtures", "docx", ...parts);

const fixtureFile = (name, ...parts) => {
  const bytes = readFileSync(fixturePath(...parts));

  return {
    name,
    size: bytes.length,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
};

describe("DOCX import button utilities", () => {
  it("DOCX file extension과 50MB size 제한을 검증한다", () => {
    expect(isDOCXImportFileName("sample.docx")).toBe(true);
    expect(isDOCXImportFileName("sample.DOCX")).toBe(true);
    expect(isDOCXImportFileName("sample.hwpx")).toBe(false);

    expect(validateDOCXImportFile({ name: "sample.docx", size: 10 })).toMatchObject({
      valid: true
    });
    expect(validateDOCXImportFile({ name: "sample.txt", size: 10 })).toMatchObject({
      valid: false,
      code: "docx-import-file-extension"
    });
    expect(validateDOCXImportFile({ name: "sample.docx", size: 0 })).toMatchObject({
      valid: false,
      code: "docx-import-file-empty"
    });
    expect(
      validateDOCXImportFile({ name: "sample.docx", size: DOCX_IMPORT_MAX_BYTES + 1 })
    ).toMatchObject({
      valid: false,
      code: "docx-import-file-too-large"
    });
    expect(DOCX_IMPORT_ERROR_MESSAGE).toContain("다시 시도");
  });

  it("dry-run summary는 validation/import error가 없을 때만 apply 가능하다", () => {
    const summary = createDOCXImportDryRunSummary({
      fileName: "fixture.docx",
      importResult: {
        irDocument: {
          sections: [
            {
              blocks: [
                {
                  type: "paragraph",
                  runs: [{ type: "text", text: "Hello DOCX" }]
                }
              ]
            }
          ]
        },
        warnings: [],
        packageSummary: { entryCount: 4 }
      },
      projection: { warnings: [] },
      validation: { valid: true, warnings: [], errors: [] }
    });

    expect(summary).toMatchObject({
      fileName: "fixture.docx",
      canApply: true,
      blockCount: 1,
      textPreview: "Hello DOCX",
      packageEntryCount: 4,
      sectionCount: 1,
      featureLabels: []
    });
  });

  it("dry-run summary는 표/이미지/링크/목록 포함 여부를 사용자 summary로 만든다", () => {
    const summary = createDOCXImportDryRunSummary({
      fileName: "features.docx",
      importResult: {
        irDocument: {
          sections: [
            {
              blocks: [
                { type: "list", items: [] },
                { type: "table", rows: [] },
                { type: "object", objectType: "image", attrs: {} },
                {
                  type: "paragraph",
                  runs: [
                    {
                      type: "text",
                      text: "link",
                      marks: [{ type: "link", attrs: { href: "https://example.com" } }]
                    }
                  ]
                }
              ]
            }
          ]
        },
        warnings: [],
        packageSummary: { entryCount: 4 }
      },
      projection: { warnings: [] },
      validation: { valid: true, warnings: [], errors: [] }
    });

    expect(summary).toMatchObject({
      hasTable: true,
      hasImage: true,
      hasLink: true,
      hasList: true
    });
    expect(summary.featureLabels).toEqual(["표", "이미지", "링크", "목록"]);
  });

  it("validation error 또는 import error가 있으면 apply를 막는다", () => {
    expect(
      createDOCXImportDryRunSummary({
        importResult: {
          warnings: [],
          packageSummary: { entryCount: 0 }
        },
        projection: { warnings: [] },
        validation: {
          valid: false,
          warnings: [{ code: "pm-projection-schema-invalid", severity: "error" }],
          errors: [{ code: "pm-projection-schema-invalid", severity: "error" }]
        }
      }).canApply
    ).toBe(false);

    expect(
      createDOCXImportDryRunSummary({
        importResult: {
          warnings: [{ code: "docx-import-package-error", severity: "error" }],
          packageSummary: { entryCount: 0 }
        },
        projection: { warnings: [] },
        validation: { valid: true, warnings: [], errors: [] }
      }).canApply
    ).toBe(false);
  });

  it("duplicate import guard는 동시 dry-run 진입을 막고 finally에서 해제된다", () => {
    const ref = { current: false };

    expect(startDOCXImportDryRun(ref)).toBe(true);
    expect(ref.current).toBe(true);
    expect(startDOCXImportDryRun(ref)).toBe(false);

    finishDOCXImportDryRun(ref);

    expect(ref.current).toBe(false);
    expect(startDOCXImportDryRun(ref)).toBe(true);
  });

  it("apply helper는 승인 가능한 preview에서만 editor.setContent를 호출한다", () => {
    const editor = {
      isDestroyed: false,
      commands: {
        setContent: vi.fn(() => true)
      }
    };
    const invalidPreview = {
      summary: { canApply: false },
      projection: { doc: { type: "doc", content: [] } }
    };
    const validPreview = {
      summary: { canApply: true },
      projection: { doc: { type: "doc", content: [] } }
    };

    expect(applyDOCXImportPreviewToEditor(invalidPreview, editor)).toEqual({
      applied: false,
      reason: "not-applicable"
    });
    expect(editor.commands.setContent).not.toHaveBeenCalled();

    expect(applyDOCXImportPreviewToEditor(validPreview, editor)).toEqual({
      applied: true,
      reason: "applied"
    });
    expect(editor.commands.setContent).toHaveBeenCalledWith(validPreview.projection.doc);
  });

  it("apply helper는 projection/editor 누락 또는 destroyed editor에서 적용하지 않는다", () => {
    const previewWithoutProjection = { summary: { canApply: true } };
    const editor = {
      isDestroyed: false,
      commands: { setContent: vi.fn(() => true) }
    };

    expect(applyDOCXImportPreviewToEditor(previewWithoutProjection, editor)).toEqual({
      applied: false,
      reason: "missing-projection"
    });
    expect(
      applyDOCXImportPreviewToEditor(
        { summary: { canApply: true }, projection: { doc: { type: "doc" } } },
        { isDestroyed: true, commands: editor.commands }
      )
    ).toEqual({
      applied: false,
      reason: "editor-unavailable"
    });
    expect(editor.commands.setContent).not.toHaveBeenCalled();
  });

  it("apply helper는 setContent 실패를 결과로 반환하고 예외를 밖으로 던지지 않는다", () => {
    const projectionDoc = { type: "doc", content: [] };
    const validPreview = {
      summary: { canApply: true },
      projection: { doc: projectionDoc }
    };
    const returnedFalseEditor = {
      isDestroyed: false,
      commands: {
        setContent: vi.fn(() => false)
      }
    };
    const throwingEditor = {
      isDestroyed: false,
      commands: {
        setContent: vi.fn(() => {
          throw new Error("setContent failed");
        })
      }
    };

    expect(
      applyDOCXImportPreviewToEditor(validPreview, returnedFalseEditor)
    ).toEqual({
      applied: false,
      reason: "set-content-failed"
    });
    expect(returnedFalseEditor.commands.setContent).toHaveBeenCalledWith(projectionDoc);

    const result = applyDOCXImportPreviewToEditor(validPreview, throwingEditor);

    expect(result).toMatchObject({
      applied: false,
      reason: "set-content-threw"
    });
    expect(result.error).toBeInstanceOf(Error);
    expect(throwingEditor.commands.setContent).toHaveBeenCalledWith(projectionDoc);
  });

  it("runDOCXImportDryRun은 fixture File-like 객체를 preview까지 처리한다", async () => {
    const result = await runDOCXImportDryRun({
      file: fixtureFile("real-supported-s2-mixed.docx", "real-supported-s2-mixed.docx"),
      importDOCXToIR,
      irToProseMirror,
      validateProseMirrorProjection,
      extractedAt: "2026-07-04T00:00:00.000Z"
    });

    expect(result).toMatchObject({
      ok: true,
      stage: "preview"
    });
    expect(result.preview.summary).toMatchObject({
      canApply: true,
      hasTable: true,
      hasList: true,
      hasImage: true,
      hasLink: true
    });
    expect(result.validation.editorStateDryRun).toMatchObject({
      attempted: true,
      valid: true
    });
  });

  it("runDOCXImportDryRun은 invalid file과 arrayBuffer 실패에서 preview를 만들지 않는다", async () => {
    await expect(
      runDOCXImportDryRun({
        file: { name: "invalid.txt", size: 10, arrayBuffer: vi.fn() },
        importDOCXToIR,
        irToProseMirror,
        validateProseMirrorProjection
      })
    ).resolves.toMatchObject({
      ok: false,
      stage: "file-validation",
      reason: "docx-import-file-extension"
    });

    const result = await runDOCXImportDryRun({
      file: {
        name: "broken.docx",
        size: 10,
        arrayBuffer: vi.fn(async () => {
          throw new Error("read failed");
        })
      },
      importDOCXToIR,
      irToProseMirror,
      validateProseMirrorProjection
    });

    expect(result).toMatchObject({
      ok: false,
      stage: "dry-run",
      reason: "dry-run-error"
    });
    expect(result.error).toBeInstanceOf(Error);
  });
});
