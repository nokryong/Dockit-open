import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PRODUCT_HELP_COPY } from "../../app/LIB/constant/productHelpCopy";

const readRepoFile = (relativePath) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

describe("Stage 9 product help copy contract", () => {
  it("keeps conversion and save claims bounded to runtime behavior", () => {
    expect(PRODUCT_HELP_COPY.conversion).toContain("문서 변환 형식");
    expect(PRODUCT_HELP_COPY.conversion).toContain("HWPX와 DOCX");
    expect(PRODUCT_HELP_COPY.conversion).toContain("보장하지 않습니다");
    expect(PRODUCT_HELP_COPY.save).toContain("마지막 저장 요청");
    expect(PRODUCT_HELP_COPY.save).toContain("보장하지 않습니다");
  });

  it("documents separate ChatGPT and CLI connections", () => {
    const readme = readRepoFile("README.md");
    expect(readme).toContain("AI 연결은 선택 사항입니다.");
    expect(readRepoFile("README.en.md")).toContain("Image generation is not supported through this connection.");
    expect(readme).toContain("Continue with ChatGPT");
    expect(readme).toContain("이미지 생성은 지원되지 않습니다.");
    expect(readRepoFile("app/LIB/components/panel/ChatGPTWidget.js")).toContain("설정에서 ChatGPT를 연결해주세요.");
    expect(readme).toContain("CLI로 로그인하기");
  });
});
