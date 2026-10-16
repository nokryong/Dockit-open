import { describe, expect, it } from "vitest";
import {
  convertMarkdownToHtml,
  convertPlainTextToHtml
} from "../../app/LIB/utils/markdownImportUtils";

describe("markdownImportUtils", () => {
  it("converts plain text paragraphs and line breaks", () => {
    expect(convertPlainTextToHtml("첫 줄\n둘째 줄\n\n다음 문단")).toBe(
      "<p>첫 줄<br>둘째 줄</p><p>다음 문단</p>"
    );
  });

  it("supports headings, inline formatting, and fenced code blocks", () => {
    expect(
      convertMarkdownToHtml(`# 제목

문단에 **굵게**와 *기울임*과 ~~취소선~~, [링크](https://example.com)

\`\`\`js
const a = 1;
\`\`\``)
    ).toContain("<h1>제목</h1>");

    expect(
      convertMarkdownToHtml(`문단에 **굵게**와 *기울임*과 ~~취소선~~, [링크](https://example.com)`)
    ).toContain(
      '<p>문단에 <strong>굵게</strong>와 <em>기울임</em>과 <s>취소선</s>, <a href="https://example.com">링크</a></p>'
    );

    expect(
      convertMarkdownToHtml("```js\nconst a = 1;\n```")
    ).toContain('<pre><code class="language-js">const a = 1;</code></pre>');
  });

  it("supports nested lists and task lists", () => {
    const html = convertMarkdownToHtml(`- 할 일
  - 세부 항목
- [x] 완료한 일
- [ ] 남은 일
1. 첫 번째
2. 두 번째`);

    expect(html).toContain("<ul><li><p>할 일</p><ul><li><p>세부 항목</p></li></ul></li></ul>");
    expect(html).toContain('ul data-type="taskList"');
    expect(html).toContain('li data-type="taskItem" data-checked="true"');
    expect(html).toContain("<ol><li><p>첫 번째</p></li><li><p>두 번째</p></li></ol>");
  });

  it("supports tables and blockquotes", () => {
    const html = convertMarkdownToHtml(`> 인용문
> 두 번째 줄

| 이름 | 역할 |
| --- | --- |
| Dockit | 문서 |
| Codex | 도우미 |`);

    expect(html).toContain("<blockquote><p>인용문<br>두 번째 줄</p></blockquote>");
    expect(html).toContain("<table>");
    expect(html).toContain("<th><p>이름</p></th>");
    expect(html).toContain("<td><p>Dockit</p></td>");
  });
});
