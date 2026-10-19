/**
 * HTML 문자열을 Markdown으로 변환합니다.
 * 브라우저 환경(DOMParser)에서만 동작합니다.
 */
export const htmlToMarkdown = (html) => {
  if (typeof window === "undefined") return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const normalizeText = (text = "") => text.replace(/\u00a0/g, " ");
  const getElementTag = (node) => node.tagName.toLowerCase();
  const getDirectChildren = (node) =>
    Array.from(node.childNodes).filter(
      (child) => child.nodeType === Node.ELEMENT_NODE
    );

  const serializeChildren = (node) =>
    Array.from(node.childNodes)
      .map((child) => processNode(child))
      .join("");

  const wrapBlock = (content) => {
    const trimmed = content.trim();
    return trimmed ? `\n${trimmed}\n` : "\n";
  };

  const escapeTableCell = (text = "") =>
    normalizeText(text)
      .trim()
      .replace(/\|/g, "\\|")
      .replace(/\n+/g, "<br>");

  const buildMarkdownTable = (rows) => {
    if (!rows?.length) return "";

    const normalizedRows = rows.map((row) =>
      row.map((cell) => escapeTableCell(String(cell ?? "")))
    );
    const colCount = Math.max(...normalizedRows.map((row) => row.length), 0);

    if (!colCount) return "";

    const padRow = (row) => {
      const padded = [...row];
      while (padded.length < colCount) {
        padded.push("");
      }
      return padded;
    };

    const lines = [];
    lines.push(`| ${padRow(normalizedRows[0]).join(" | ")} |`);
    lines.push(`| ${Array(colCount).fill("---").join(" | ")} |`);

    for (let index = 1; index < normalizedRows.length; index++) {
      lines.push(`| ${padRow(normalizedRows[index]).join(" | ")} |`);
    }

    return `\n${lines.join("\n")}\n`;
  };

  const processTable = (table) => {
    const rows = Array.from(table.querySelectorAll("tr"));

    if (!rows.length) return "";

    const tableData = rows.map((row) =>
      Array.from(row.querySelectorAll("th, td")).map((cell) =>
        cell.textContent.trim()
      )
    );

    return buildMarkdownTable(tableData);
  };

  const processChartBlock = (node) => {
    const chartType = node.getAttribute("data-chart-type") || "bar";
    const tableDataAttr = node.getAttribute("data-table") || "[]";
    let tableMarkdown = "";

    try {
      const parsedTableData = JSON.parse(tableDataAttr);
      if (Array.isArray(parsedTableData) && parsedTableData.length > 0) {
        tableMarkdown = buildMarkdownTable(parsedTableData);
      }
    } catch (error) {
      console.warn("chart markdown parse error:", error);
    }

    return tableMarkdown
      ? `\n[차트: ${chartType}]${tableMarkdown}\n`
      : `\n[차트: ${chartType}]\n`;
  };

  const processColumnBlock = (node) => {
    const columns = Array.from(node.children).filter(
      (child) =>
        child instanceof HTMLElement &&
        child.getAttribute("data-type") === "column"
    );

    if (!columns.length) {
      return wrapBlock(serializeChildren(node));
    }

    return (
      "\n" +
      columns
        .map((column, index) => {
          const content = serializeChildren(column).trim();
          return content
            ? `[컬럼 ${index + 1}]\n${content}`
            : `[컬럼 ${index + 1}]`;
        })
        .join("\n\n") +
      "\n"
    );
  };

  const processShapeBlock = (node) => {
    const content = serializeChildren(node).trim();
    return content ? `\n[도형 블록]\n${content}\n` : "\n[도형 블록]\n";
  };

  const processListItem = (li, ordered, num, depth) => {
    const indent = "  ".repeat(depth);
    const directCheckbox = li.querySelector(
      ":scope > input[type='checkbox'], :scope > label > input[type='checkbox']"
    );

    let prefix;
    if (directCheckbox) {
      prefix = directCheckbox.checked ? "- [x] " : "- [ ] ";
    } else if (ordered) {
      prefix = `${num}. `;
    } else {
      prefix = "- ";
    }

    let text = "";
    let nested = "";

    for (const child of li.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childTag = getElementTag(child);

        if (childTag === "ul" || childTag === "ol") {
          const isOrdered = childTag === "ol";
          const subItems = getDirectChildren(child).filter(
            (element) => getElementTag(element) === "li"
          );

          if (subItems.length) {
            nested +=
              "\n" +
              subItems
                .map((subLi, index) =>
                  processListItem(subLi, isOrdered, index + 1, depth + 1)
                )
                .join("\n");
          }
          continue;
        }

        if (childTag === "input" || childTag === "label") {
          continue;
        }

        if (childTag === "div" && directCheckbox) {
          text += serializeChildren(child);
          continue;
        }

        text += processNode(child);
        continue;
      }

      if (child.nodeType === Node.TEXT_NODE) {
        text += normalizeText(child.textContent || "");
      }
    }

    return `${indent}${prefix}${text.trim()}${nested}`;
  };

  const processNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return normalizeText(node.textContent || "");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = getElementTag(node);
    const dataType = node.getAttribute("data-type");

    if (dataType === "inline-math") {
      return `$${node.getAttribute("data-latex") || ""}$`;
    }

    if (dataType === "block-math") {
      const latex = node.getAttribute("data-latex") || "";
      return `\n$$\n${latex}\n$$\n`;
    }

    if (dataType === "columnBlock") {
      return processColumnBlock(node);
    }

    if (dataType === "shape-block") {
      return processShapeBlock(node);
    }

    if (node.hasAttribute("data-chart-block")) {
      return processChartBlock(node);
    }

    switch (tag) {
      case "h1":
        return `\n# ${serializeChildren(node).trim()}\n`;
      case "h2":
        return `\n## ${serializeChildren(node).trim()}\n`;
      case "h3":
        return `\n### ${serializeChildren(node).trim()}\n`;
      case "h4":
        return `\n#### ${serializeChildren(node).trim()}\n`;
      case "h5":
        return `\n##### ${serializeChildren(node).trim()}\n`;
      case "h6":
        return `\n###### ${serializeChildren(node).trim()}\n`;
      case "p":
        return wrapBlock(serializeChildren(node));
      case "div":
        return serializeChildren(node);
      case "span":
        return serializeChildren(node);
      case "br":
        return "\n";
      case "hr":
        return "\n---\n";
      case "strong":
      case "b":
        return `**${serializeChildren(node)}**`;
      case "em":
      case "i":
        return `*${serializeChildren(node)}*`;
      case "s":
      case "del":
      case "strike":
        return `~~${serializeChildren(node)}~~`;
      case "u":
        return `<u>${serializeChildren(node)}</u>`;
      case "sub":
        return `<sub>${serializeChildren(node)}</sub>`;
      case "sup":
        return `<sup>${serializeChildren(node)}</sup>`;
      case "a": {
        const href = node.getAttribute("href") || "";
        return `[${serializeChildren(node)}](${href})`;
      }
      case "img": {
        const src = node.getAttribute("src") || "";
        const alt = node.getAttribute("alt") || "";
        const displaySrc = src.startsWith("data:") ? "(embedded image)" : src;
        return `![${alt}](${displaySrc})`;
      }
      case "code": {
        const parentTag = node.parentElement?.tagName?.toLowerCase();
        if (parentTag === "pre") return node.textContent || "";
        return `\`${node.textContent || ""}\``;
      }
      case "pre": {
        const codeEl = node.querySelector("code");
        const lang = codeEl?.className?.match(/language-(\w+)/)?.[1] || "";
        const code = codeEl ? codeEl.textContent || "" : node.textContent || "";
        return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
      }
      case "blockquote": {
        const content = serializeChildren(node).trim();
        return (
          "\n" +
          content
            .split("\n")
            .map((line) => (line ? `> ${line}` : ">"))
            .join("\n") +
          "\n"
        );
      }
      case "ul":
      case "ol": {
        const isOrdered = tag === "ol";
        const items = getDirectChildren(node).filter(
          (element) => getElementTag(element) === "li"
        );
        return (
          "\n" +
          items
            .map((li, index) => processListItem(li, isOrdered, index + 1, 0))
            .join("\n") +
          "\n"
        );
      }
      case "table":
        return processTable(node);
      default:
        return serializeChildren(node);
    }
  };

  return Array.from(doc.body.childNodes)
    .map((node) => processNode(node))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};
