/* @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { sanitizeRichHtml } from "../../app/LIB/utils/sanitizeRichHtml";
describe("rich HTML sanitization", () => {
  it("keeps only allowlisted rich HTML and makes scripts, event attributes, and javascript URLs inert", () => {
    const sanitized = sanitizeRichHtml(
      '<p onclick="window.__xss = true">안전한 <strong>서식</strong><sup>2</sup></p><script>window.__xss = true</script><style>body{display:none}</style><iframe srcdoc="<script>window.__xss = true</script>"></iframe><a href="javascript:window.__xss = true" onmouseover="window.__xss = true">위험 링크</a><a href="data:text/html,<script>window.__xss = true</script>">데이터 링크</a><a href="https://example.com" onclick="window.__xss = true">정상 링크</a>'
    );
    const container = document.createElement("div");
    container.innerHTML = sanitized;

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("style, iframe")).toBeNull();
    expect(container.querySelector("[onclick], [onmouseover]")).toBeNull();
    expect(container.querySelector("a[href^='javascript:']")).toBeNull();
    expect(container.querySelector("a[href^='data:']")).toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("서식");
    expect(container.querySelector("sup")?.textContent).toBe("2");
    expect(container.querySelector("a[href='https://example.com']")).not.toBeNull();
    expect(
      container
        .querySelector("a[href='https://example.com']")
        ?.getAttribute("rel")
    ).toBe("noopener noreferrer nofollow");
    expect(globalThis.__xss).toBeUndefined();
  });

});
