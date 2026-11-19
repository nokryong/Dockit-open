import { describe, expect, it } from "vitest";
import { generateHTML, generateJSON } from "@tiptap/html/server";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";

const extensions = [StarterKit, Table, TableRow, TableHeader, TableCell];

describe("Tiptap server HTML conversion", () => {
  it("preserves representative document structure through HTML to JSON to HTML", () => {
    const html = '<h2>문서 제목</h2><p>한글 <strong>굵게</strong> <em>기울임</em> &amp; &lt;본문&gt; <a href="https://example.com">링크</a></p><ul><li><p>첫 항목</p></li><li><p>둘째 항목</p></li></ul><blockquote><p>인용문</p></blockquote><table><tbody><tr><th><p>머리글</p></th></tr><tr><td><p>표 내용</p></td></tr></tbody></table>';
    const json = generateJSON(html, extensions);
    expect(json.content.map(({ type }) => type)).toEqual(["heading", "paragraph", "bulletList", "blockquote", "table"]);
    const output = generateHTML(json, extensions);
    expect(output).toContain("문서 제목");
    expect(output).toContain("<strong>굵게</strong>");
    expect(output).toContain("<em>기울임</em>");
    expect(output).toContain("&amp; &lt;본문&gt;");
    expect(output).toContain('href="https://example.com"');
    expect(output).toContain("표 내용");
    expect(generateJSON(output, extensions)).toEqual(json);
  });
});
