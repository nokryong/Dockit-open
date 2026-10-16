import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ChatMarkdown from "../../app/LIB/components/panel/ChatMarkdown";

vi.mock("sud-ui", () => ({
  Button: ({ children, onClick }) => React.createElement("button", { onClick }, children),
  Typography: ({ children }) => React.createElement("span", null, children),
}));

const render = (text) => renderToStaticMarkup(React.createElement(ChatMarkdown, { text }));

describe("chat markdown", () => {
  it("renders GFM tables, nested lists, tasks, strikethrough, links and footnotes", () => {
    const html = render([
      "## 제목", "", "| 이름 | 값 |", "| --- | ---: |", "| 항목 | 42 |", "",
      "1. 첫째", "   - 하위 항목", "2. 둘째", "", "- [x] 완료", "- [ ] 미완료", "",
      "~~취소~~ https://example.com 각주[^1]", "", "[^1]: 각주 내용",
    ].join("\n"));
    for (const tag of ["<h2>", "<table>", "<thead>", "<tbody>", "<ol>", "<ul>", "<del>"])
      expect(html).toContain(tag);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("각주 내용");
    expect(html).toContain('text-align:right');
  });

  it("renders formulas and preserves code verbatim, including incomplete streamed fences", () => {
    expect(render("수식 $x^2$\n\n$$\n\\frac{1}{2}\n$$")).toContain('class="katex');
    const html = render('```javascript\nconst value = "<div>";\n');
    expect(html).toContain("코드 복사");
    expect(html).toContain('class="language-javascript"');
    expect(html).toContain("&lt;div&gt;");
  });

  it("does not execute raw HTML, unsafe links, or trusted math commands", () => {
    const html = render('<script>alert(1)</script>\n\n[위험](javascript:alert%281%29)\n\n$\\href{javascript:alert(1)}{x}$');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("onerror=");
  });
});
