import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  WARNING_CATALOG,
  WARNING_CATALOG_DEFAULT_ENTRY,
  getWarningCatalogEntry
} from "../../app/LIB/ir/warningCatalog";
import { createDOCXV0WarningDetails } from "../../app/LIB/utils/docxExportButtonUtils";
import { createHWPXV0WarningDetails } from "../../app/LIB/utils/hwpxExportButtonUtils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const WARNING_SOURCE_FILES = [
  "app/LIB/ir/docxImport.ts",
  "app/LIB/ir/hwpxImport.ts",
  "app/LIB/ir/docxMinimalExport.ts",
  "app/LIB/ir/hwpxMinimalExport.ts"
];

const EMITTED_CODE_PATTERNS = [
  /warning\(\s*["'`]([^"'`]+)["'`]/g,
  /code:\s*["'`]([^"'`]+)["'`]/g
];

const extractWarningCodes = (text) => {
  const codes = new Set();

  for (const pattern of EMITTED_CODE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) {
        codes.add(match[1]);
      }
    }
  }

  return [...codes].sort();
};

const readWarningCodeSet = async () => {
  const codes = new Set(["ir-extraction-warning"]);

  for (const relativeFile of WARNING_SOURCE_FILES) {
    const text = await fs.readFile(path.join(repoRoot, relativeFile), "utf8");
    for (const code of extractWarningCodes(text)) {
      codes.add(code);
    }
  }

  return [...codes].sort();
};

describe("warningCatalog", () => {
  it("covers every warning code emitted by the DOCX/HWPX import and export paths", async () => {
    const emittedCodes = await readWarningCodeSet();
    expect(emittedCodes.length).toBeGreaterThan(0);
    expect(emittedCodes.filter((code) => !WARNING_CATALOG[code])).toEqual([]);
  });

  it("falls back to the default entry for unknown codes", () => {
    expect(getWarningCatalogEntry("totally-unknown-code")).toEqual(
      WARNING_CATALOG_DEFAULT_ENTRY
    );
  });

  it("keeps DOCX warning detail copy unchanged for existing codes", () => {
    const details = createDOCXV0WarningDetails({
      docxWarnings: [
        {
          code: "docx-image-relationship-fallback",
          severity: "blocked",
          blockType: "object",
          message: "x"
        },
        {
          code: "docx-run-style-fallback",
          severity: "warning",
          blockType: "paragraph",
          message: "y"
        }
      ],
      irWarnings: [{ code: "ir-any", blockType: "paragraph", message: "z" }]
    });

    expect(
      details.groups.find(
        (group) => group.code === "docx-image-relationship-fallback"
      )
    ).toMatchObject({
      title: "이미지 포함 실패",
      description:
        "DOCX에 직접 포함할 수 없는 이미지 형식이나 주소는 실제 이미지 대신 자리표시자로 바뀝니다. 이미지 본문이 꼭 필요하면 원본 위치를 다시 확인해야 하며, 장식용 이미지라면 무시하셔도 됩니다.",
      fallback:
        "이미지는 자리표시자로 내보냈습니다. 이미지 원본이 꼭 필요하지 않다면 무시하셔도 됩니다."
    });
    expect(
      details.groups.find((group) => group.code === "docx-run-style-fallback")
    ).toMatchObject({
      title: "글자 서식 일부 단순화",
      description:
        "DOCX foundation이 아직 일부 글자 서식을 Word 문서 구조로 그대로 옮기지 못했습니다.",
      fallback: "텍스트는 유지하고 일부 글자 서식만 단순화했습니다."
    });
    expect(
      details.groups.find((group) => group.code === "ir-extraction-warning")
    ).toMatchObject({
      title: "문서 구조 변환 경고",
      description:
        "DOCX로 내보내기 전 Dockit 문서를 공통 IR 구조로 바꾸는 중 일부 구조가 단순화됩니다. 문서 핵심 내용이 맞으면 무시하셔도 되지만, 특정 블록 모양이 중요하면 결과를 확인해야 합니다.",
      fallback:
        "가능한 문서 내용은 유지한 뒤 DOCX foundation이 지원하는 범위로 내보냈습니다. 결과 문서가 읽히면 무시하셔도 됩니다."
    });
  });

  it("keeps HWPX warning detail copy unchanged for existing codes", () => {
    const details = createHWPXV0WarningDetails({
      hwpxWarnings: [
        {
          code: "paragraph-tabs-fallback",
          severity: "warning",
          sectionIndex: 0,
          blockIndex: 0,
          blockType: "paragraph",
          message: "x"
        },
        {
          code: "object-placeholder",
          severity: "warning",
          sectionIndex: 0,
          blockIndex: 1,
          blockType: "object",
          message: "y"
        }
      ],
      irWarnings: ["지원하지 않는 block node: codeBlock"]
    });

    expect(
      details.groups.find((group) => group.code === "paragraph-tabs-fallback")
    ).toMatchObject({
      title: "문단 탭 위치 단순화",
      description:
        "DOCX 문단 탭 위치 정보는 보존하지만 HWPX v0 기본 탭 정지점으로는 내보내지 않습니다. 문단 내용만 중요하면 무시하셔도 되지만, 같은 정렬 위치가 필요하면 확인이 필요합니다.",
      fallback:
        "문단 텍스트는 유지하고 탭 위치 의미만 경고로 표시했습니다. 탭 정렬이 중요하지 않으면 무시하셔도 됩니다."
    });
    expect(
      details.groups.find((group) => group.code === "object-placeholder")
    ).toMatchObject({
      title: "이미지/객체 자리표시자",
      description:
        "이미지나 객체를 실제 HWPX 미디어로 넣지 못해 자리표시자 문구로 바뀝니다. 해당 미디어가 중요하면 원본을 확인해야 하며, 위치 표시만 필요하면 무시하셔도 됩니다.",
      fallback:
        "문서 안에 자리표시자 문구를 넣어 빠진 위치를 알 수 있게 했습니다. 실제 미디어가 꼭 필요하지 않으면 무시하셔도 됩니다."
    });
    expect(
      details.groups.find((group) => group.code === "ir-extraction-warning")
    ).toMatchObject({
      title: "편집기 구조 변환 경고",
      description:
        "편집기 문서를 HWPX용 중간 구조로 바꾸는 중 일부 구조는 단순화됩니다. 문서 핵심 내용은 유지되므로 출력 결과가 읽히면 무시하셔도 됩니다.",
      fallback:
        "가능한 내용은 유지하고 HWPX v0에서 다룰 수 있는 구조로 바꿨습니다. 결과 문서가 읽히면 무시하셔도 됩니다."
    });
  });
});
