import { readFileSync } from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { importHWPXToIR } from "../../app/LIB/ir/hwpxImport";
import { validateProseMirrorProjection } from "../../app/LIB/ir/proseMirrorProjectionValidation";
import { irToProseMirror } from "../../app/LIB/ir/toProseMirror";
import {
  HWPX_IMPORT_ERROR_MESSAGE,
  createHWPXBrowserInflateRaw,
  applyHWPXImportPreviewToEditor,
  classifyHWPXImportPreviewDisposition,
  classifyHWPXImportIssue,
  createHWPXImportDryRunSummary,
  createHWPXImportPreviewWarningGroups,
  finishHWPXImportDryRun,
  getHWPXImportPreviewStatus,
  isHWPXImportFileName,
  runHWPXImportDryRun,
  startHWPXImportDryRun,
  validateHWPXImportFile
} from "../../app/LIB/utils/hwpxImportButtonUtils";

const fixturePath = (...parts) =>
  path.join(process.cwd(), "tests", "fixtures", "hwpx", ...parts);

const fixtureFile = (name, ...parts) => {
  const bytes = readFileSync(fixturePath(...parts));

  return {
    name,
    size: bytes.length,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
};

describe("HWPX import button v0 utilities", () => {
  it("browser inflateRaw callback은 raw deflate bytes를 해제한다", () => {
    const inflateRaw = createHWPXBrowserInflateRaw();
    const compressed = new Uint8Array(deflateRawSync(Buffer.from("hello hwpx")));

    expect(Buffer.from(inflateRaw(compressed, "Contents/section0.xml")).toString()).toBe(
      "hello hwpx"
    );
  });

  it("browser inflateRaw callback으로 deflate-compressed roundtrip HWPX를 dry-run import할 수 있다", () => {
    const result = importHWPXToIR(
      readFileSync(fixturePath("roundtrip", "minimal-paragraph-heading.roundtrip.hwpx")),
      {
        sourceName: "minimal-paragraph-heading.roundtrip.hwpx",
        inflateRaw: createHWPXBrowserInflateRaw(),
        extractedAt: "2026-06-03T00:00:00.000Z"
      }
    );

    expect(result.packageSummary.unsupportedCompressionMethods).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      "hwpx-import-unsupported-compression"
    );
    expect(
      result.irDocument.sections[0].blocks
        .flatMap((block) => (block.runs || []).map((run) => run.text || ""))
        .join(" ")
    ).toContain("Export readiness");
  });

  it("HWPX file extension과 size를 검증한다", () => {
    expect(isHWPXImportFileName("sample.hwpx")).toBe(true);
    expect(isHWPXImportFileName("sample.HWPX")).toBe(true);
    expect(isHWPXImportFileName("sample.hwp")).toBe(false);

    expect(validateHWPXImportFile({ name: "sample.hwpx", size: 10 })).toMatchObject({
      valid: true
    });
    expect(validateHWPXImportFile({ name: "sample.txt", size: 10 })).toMatchObject({
      valid: false,
      code: "hwpx-import-file-extension"
    });
    expect(validateHWPXImportFile({ name: "sample.hwpx", size: 0 })).toMatchObject({
      valid: false,
      code: "hwpx-import-file-empty"
    });
    expect(
      validateHWPXImportFile(
        { name: "sample.hwpx", size: 1025 },
        { maxBytes: 1024 }
      )
    ).toMatchObject({
      valid: false,
      code: "hwpx-import-file-too-large"
    });
    expect(HWPX_IMPORT_ERROR_MESSAGE).toContain("다시 시도");
  });

  it("dry-run summary는 validation/import error가 없을 때만 apply 가능하다", () => {
    const summary = createHWPXImportDryRunSummary({
      fileName: "fixture.hwpx",
      importResult: {
        irDocument: {
          sections: [
            {
              blocks: [
                {
                  type: "paragraph",
                  runs: [{ type: "text", text: "Hello HWPX" }]
                }
              ]
            }
          ]
        },
        warnings: [],
        lossReport: { entries: [], summary: { total: 0, errorCount: 0 } },
        packageSummary: { entryCount: 4, sectionCount: 1 }
      },
      projection: { warnings: [] },
      validation: { valid: true, warnings: [], errors: [] }
    });

    expect(summary).toMatchObject({
      fileName: "fixture.hwpx",
      canApply: true,
      blockCount: 1,
      textPreview: "Hello HWPX",
      packageEntryCount: 4,
      sectionCount: 1,
      featureLabels: []
    });
  });

  it("dry-run summary는 표/이미지/링크/목록 포함 여부를 사용자 summary로 만든다", () => {
    const summary = createHWPXImportDryRunSummary({
      fileName: "features.hwpx",
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
        lossReport: { entries: [], summary: { total: 0, errorCount: 0 } },
        packageSummary: { entryCount: 4, sectionCount: 1 }
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

  it("warning만 있는 dry-run summary는 apply 가능하되 상태 문구를 warning으로 표시한다", () => {
    const summary = createHWPXImportDryRunSummary({
      fileName: "warning-only.hwpx",
      importResult: {
        irDocument: {
          sections: [{ blocks: [{ type: "paragraph", runs: [] }] }]
        },
        warnings: [{ code: "hwpx-import-package-partial", severity: "warning" }],
        lossReport: {
          entries: [{ code: "hwpx-import-control-unsupported", severity: "warning" }],
          summary: { total: 1, errorCount: 0 }
        },
        packageSummary: { entryCount: 4, sectionCount: 1 }
      },
      projection: {
        warnings: [{ code: "ir-projection-unsupported-block", severity: "warning" }]
      },
      validation: {
        valid: true,
        warnings: [{ code: "pm-projection-unknown-attr", severity: "warning" }],
        errors: []
      }
    });

    expect(summary.canApply).toBe(true);
    expect(getHWPXImportPreviewStatus(summary)).toMatchObject({
      tone: "warning",
      title: "불러올 수 있습니다"
    });
  });

  it("preview disposition은 safe/partial/blocked/unsupported/parser-bug를 분리한다", () => {
    const safePreview = {
      summary: createHWPXImportDryRunSummary({
        importResult: {
          irDocument: {
            sections: [{ blocks: [{ type: "paragraph", runs: [] }] }]
          },
          warnings: [],
          lossReport: { entries: [], summary: { total: 0, errorCount: 0 } },
          packageSummary: { entryCount: 4, sectionCount: 1 }
        },
        projection: { warnings: [] },
        validation: { valid: true, warnings: [], errors: [] }
      })
    };
    const partialPreview = {
      summary: {
        canApply: true,
        importWarningCount: 1,
        lossCount: 0,
        projectionWarningCount: 0,
        validationWarningCount: 0
      },
      importResult: {
        warnings: [{ code: "hwpx-import-package-partial", severity: "warning" }]
      }
    };
    const unsupportedPreview = {
      summary: {
        canApply: true,
        importWarningCount: 0,
        lossCount: 1,
        projectionWarningCount: 0,
        validationWarningCount: 0
      },
      importResult: {
        lossReport: {
          entries: [
            { code: "hwpx-import-control-unsupported", severity: "warning" }
          ]
        }
      }
    };
    const blockedPreview = {
      summary: {
        canApply: false,
        importWarningCount: 0,
        lossCount: 0,
        projectionWarningCount: 0,
        validationWarningCount: 0,
        validationErrorCount: 1
      },
      validation: {
        errors: [{ code: "pm-projection-schema-invalid", severity: "error" }]
      }
    };
    const parserBugPreview = {
      summary: {
        canApply: false,
        importWarningCount: 1,
        lossCount: 0,
        projectionWarningCount: 0,
        validationWarningCount: 0
      },
      importResult: {
        warnings: [{ code: "hwpx-import-parser-bug", severity: "error" }]
      }
    };

    expect(classifyHWPXImportPreviewDisposition(safePreview)).toMatchObject({
      status: "safe",
      canApply: true
    });
    expect(classifyHWPXImportPreviewDisposition(partialPreview)).toMatchObject({
      status: "partial",
      canApply: true
    });
    expect(classifyHWPXImportPreviewDisposition(unsupportedPreview)).toMatchObject({
      status: "unsupported-feature",
      canApply: true
    });
    expect(classifyHWPXImportPreviewDisposition(blockedPreview)).toMatchObject({
      status: "blocked",
      canApply: false
    });
    expect(classifyHWPXImportPreviewDisposition(parserBugPreview)).toMatchObject({
      status: "parser-bug",
      canApply: false
    });
  });

  it("validation error 또는 import error가 있으면 apply를 막는다", () => {
    expect(
      createHWPXImportDryRunSummary({
        importResult: {
          warnings: [],
          lossReport: { entries: [], summary: { total: 0, errorCount: 0 } }
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
      createHWPXImportDryRunSummary({
        importResult: {
          warnings: [{ code: "hwpx-import-xml-error", severity: "error" }],
          lossReport: { entries: [], summary: { total: 1, errorCount: 1 } }
        },
        projection: { warnings: [] },
        validation: { valid: true, warnings: [], errors: [] }
      }).canApply
    ).toBe(false);
  });

  it("preview warning groups는 오류와 단순화 항목을 사용자-facing 그룹으로 나눈다", () => {
    const groups = createHWPXImportPreviewWarningGroups({
      importResult: {
        warnings: [{ code: "hwpx-import-package-partial", severity: "warning" }],
        lossReport: {
          entries: [{ code: "hwpx-import-control-unsupported", severity: "warning" }]
        }
      },
      projection: {
        warnings: [{ code: "ir-projection-unsupported-block", severity: "warning" }]
      },
      validation: {
        warnings: [
          { code: "pm-projection-unknown-attr", severity: "warning" },
          { code: "pm-projection-schema-invalid", severity: "error" }
        ],
        errors: [{ code: "pm-projection-schema-invalid", severity: "error" }]
      }
    });

    expect(groups.map((group) => group.title)).toEqual([
      "적용을 막는 오류",
      "한글 문서 분석 결과",
      "지원하지 않는 한글 기능",
      "편집기 구조 변환 결과",
      "편집기 검증 참고 항목"
    ]);
    expect(groups[0].items[0].classification).toMatchObject({
      category: "blocking-error",
      blocking: true
    });
    expect(groups[2].items[0].classification).toMatchObject({
      category: "semantic-loss",
      userVisible: true
    });
    expect(groups[4].items[0].classification).toMatchObject({
      category: "developer-diagnostic",
      userVisible: false
    });
  });

  it("issue classification은 blocking/import/loss/projection/diagnostic을 분리한다", () => {
    expect(
      classifyHWPXImportIssue(
        { code: "pm-projection-schema-invalid", severity: "error" },
        "validation-error"
      )
    ).toMatchObject({ category: "blocking-error", blocking: true });
    expect(
      classifyHWPXImportIssue(
        { code: "hwpx-import-control-unsupported", severity: "warning" },
        "import"
      )
    ).toMatchObject({ category: "import-warning", blocking: false });
    expect(
      classifyHWPXImportIssue(
        { code: "ir-projection-unsupported-block", severity: "warning" },
        "projection"
      )
    ).toMatchObject({ category: "projection-warning", userVisible: true });
  });

  it("duplicate import guard는 동시 dry-run 진입을 막고 finally에서 해제된다", () => {
    const ref = { current: false };

    expect(startHWPXImportDryRun(ref)).toBe(true);
    expect(ref.current).toBe(true);
    expect(startHWPXImportDryRun(ref)).toBe(false);

    finishHWPXImportDryRun(ref);

    expect(ref.current).toBe(false);
    expect(startHWPXImportDryRun(ref)).toBe(true);
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

    expect(applyHWPXImportPreviewToEditor(invalidPreview, editor)).toEqual({
      applied: false,
      reason: "not-applicable"
    });
    expect(editor.commands.setContent).not.toHaveBeenCalled();

    expect(applyHWPXImportPreviewToEditor(validPreview, editor)).toEqual({
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

    expect(applyHWPXImportPreviewToEditor(previewWithoutProjection, editor)).toEqual({
      applied: false,
      reason: "missing-projection"
    });
    expect(
      applyHWPXImportPreviewToEditor(
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
      applyHWPXImportPreviewToEditor(validPreview, returnedFalseEditor)
    ).toEqual({
      applied: false,
      reason: "set-content-failed"
    });
    expect(returnedFalseEditor.commands.setContent).toHaveBeenCalledWith(projectionDoc);

    const result = applyHWPXImportPreviewToEditor(validPreview, throwingEditor);

    expect(result).toMatchObject({
      applied: false,
      reason: "set-content-threw"
    });
    expect(result.error).toBeInstanceOf(Error);
    expect(throwingEditor.commands.setContent).toHaveBeenCalledWith(projectionDoc);
  });

  it("runHWPXImportDryRun은 fixture File-like 객체를 preview까지 처리한다", async () => {
    const result = await runHWPXImportDryRun({
      file: fixtureFile("minimal-readiness-smoke.hwpx", "minimal-readiness-smoke.hwpx"),
      importHWPXToIR,
      irToProseMirror,
      validateProseMirrorProjection,
      extractedAt: "2026-06-04T00:00:00.000Z"
    });

    expect(result).toMatchObject({
      ok: true,
      stage: "preview"
    });
    expect(result.preview.summary).toMatchObject({
      canApply: true,
      hasTable: true,
      hasList: true
    });
    expect(result.validation.editorStateDryRun).toMatchObject({
      attempted: true,
      valid: true
    });
    expect(classifyHWPXImportPreviewDisposition(result.preview)).toMatchObject({
      status: "partial",
      canApply: true
    });
  });

  it("runHWPXImportDryRun은 invalid file과 arrayBuffer 실패에서 preview를 만들지 않는다", async () => {
    await expect(
      runHWPXImportDryRun({
        file: { name: "invalid.txt", size: 10, arrayBuffer: vi.fn() },
        importHWPXToIR,
        irToProseMirror,
        validateProseMirrorProjection
      })
    ).resolves.toMatchObject({
      ok: false,
      stage: "file-validation",
      reason: "hwpx-import-file-extension"
    });

    const result = await runHWPXImportDryRun({
      file: {
        name: "broken.hwpx",
        size: 10,
        arrayBuffer: vi.fn(async () => {
          throw new Error("read failed");
        })
      },
      importHWPXToIR,
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
