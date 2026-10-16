const normalizeLineEndings = (text) => `${text ?? ""}`.replace(/\r\n?/g, "\n");

export const escapeHtml = (value = "") =>
  `${value}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export const escapeHtmlAttribute = (value = "") =>
  escapeHtml(value).replace(/"/g, "&quot;");

const getIndentWidth = (line = "") =>
  (line.match(/^\s*/) || [""])[0].replace(/\t/g, "  ").length;

const createHtmlTokenStore = () => {
  const tokens = [];

  return {
    stash(value) {
      const token = `%%MDHTMLTOKEN${tokens.length}%%`;
      tokens.push([token, value]);
      return token;
    },
    restore(value) {
      return tokens.reduce(
        (html, [token, tokenValue]) => html.replaceAll(token, tokenValue),
        value
      );
    }
  };
};

export const convertPlainTextToHtml = (text) => {
  const normalizedText = normalizeLineEndings(text).trim();

  if (!normalizedText) {
    return "";
  }

  return normalizedText
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
};

export const convertMarkdownInlineToHtml = (text = "") => {
  const tokenStore = createHtmlTokenStore();
  let html = escapeHtml(text);

  html = html.replace(/`([^`]+)`/g, (_, code) =>
    tokenStore.stash(`<code>${code}</code>`)
  );
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) =>
    tokenStore.stash(
      `<img src="${escapeHtmlAttribute(src.trim())}" alt="${escapeHtmlAttribute(
        alt
      )}" />`
    )
  );
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) =>
    tokenStore.stash(
      `<a href="${escapeHtmlAttribute(href.trim())}">${escapeHtml(label)}</a>`
    )
  );
  html = html.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  html = html.replace(/(?<!_)_([^_]+)_(?!_)/g, "<em>$1</em>");

  return tokenStore.restore(html);
};

const renderMarkdownParagraphs = (lines) => {
  const paragraphs = [];
  let currentParagraph = [];

  lines.forEach((line) => {
    if (!line.trim()) {
      if (currentParagraph.length) {
        paragraphs.push(currentParagraph.join("\n"));
        currentParagraph = [];
      }
      return;
    }

    currentParagraph.push(line.trim());
  });

  if (currentParagraph.length) {
    paragraphs.push(currentParagraph.join("\n"));
  }

  return paragraphs
    .map(
      (paragraph) =>
        `<p>${convertMarkdownInlineToHtml(paragraph).replace(/\n/g, "<br>")}</p>`
    )
    .join("");
};

const splitTableRow = (line = "") =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

const isTableSeparatorLine = (line = "") => {
  const cells = splitTableRow(line);

  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell))
  );
};

const parseMarkdownTable = (lines, startIndex) => {
  if (startIndex + 1 >= lines.length) {
    return null;
  }

  const headerLine = lines[startIndex];
  const separatorLine = lines[startIndex + 1];

  if (!headerLine.includes("|") || !isTableSeparatorLine(separatorLine)) {
    return null;
  }

  const headers = splitTableRow(headerLine);
  const separators = splitTableRow(separatorLine);

  if (!headers.length || headers.length !== separators.length) {
    return null;
  }

  let index = startIndex + 2;
  const rows = [];

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim() || !line.includes("|")) {
      break;
    }

    const cells = splitTableRow(line);

    if (cells.length !== headers.length) {
      break;
    }

    rows.push(cells);
    index += 1;
  }

  const headerHtml = headers
    .map((cell) => `<th><p>${convertMarkdownInlineToHtml(cell)}</p></th>`)
    .join("");
  const bodyHtml = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td><p>${convertMarkdownInlineToHtml(cell)}</p></td>`)
          .join("")}</tr>`
    )
    .join("");

  return {
    html: `<table><thead><tr>${headerHtml}</tr></thead>${
      bodyHtml ? `<tbody>${bodyHtml}</tbody>` : ""
    }</table>`,
    nextIndex: index
  };
};

const getListToken = (line = "") => {
  const match = line.match(/^(\s*)([-+*]|\d+\.)\s+(?:\[( |x|X)\]\s+)?(.*)$/);

  if (!match) {
    return null;
  }

  const indent = getIndentWidth(match[1]);
  const marker = match[2];
  const checkbox = match[3];
  const isOrdered = /\d+\./.test(marker);

  return {
    indent,
    marker,
    type: checkbox !== undefined ? "task" : isOrdered ? "ordered" : "bullet",
    checked: checkbox?.toLowerCase() === "x",
    startNumber: isOrdered ? Number.parseInt(marker, 10) : null,
    content: match[4] || ""
  };
};

const parseMarkdownList = (lines, startIndex, baseIndent = null) => {
  const firstToken = getListToken(lines[startIndex]);

  if (!firstToken) {
    return null;
  }

  const listIndent = baseIndent ?? firstToken.indent;
  const listType = firstToken.type;
  const startNumber = firstToken.startNumber;
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const token = getListToken(lines[index]);

    if (
      !token ||
      token.indent !== listIndent ||
      token.type !== listType
    ) {
      break;
    }

    const item = {
      checked: token.checked,
      lines: [token.content],
      children: []
    };

    index += 1;

    while (index < lines.length) {
      const rawLine = lines[index];
      const trimmedLine = rawLine.trim();
      const nestedToken = getListToken(rawLine);

      if (!trimmedLine) {
        item.lines.push("");
        index += 1;
        continue;
      }

      if (nestedToken) {
        if (nestedToken.indent > listIndent) {
          const nestedList = parseMarkdownList(lines, index, nestedToken.indent);

          if (!nestedList) {
            break;
          }

          item.children.push(nestedList.html);
          index = nestedList.nextIndex;
          continue;
        }

        break;
      }

      if (getIndentWidth(rawLine) > listIndent) {
        item.lines.push(trimmedLine);
        index += 1;
        continue;
      }

      break;
    }

    items.push(item);
  }

  const itemsHtml = items
    .map((item) => {
      const bodyHtml = renderMarkdownParagraphs(item.lines);
      const childHtml = item.children.join("");

      if (listType === "task") {
        return `<li data-type="taskItem" data-checked="${
          item.checked ? "true" : "false"
        }"><label><input type="checkbox"${
          item.checked ? " checked" : ""
        }><span></span></label><div>${bodyHtml}${childHtml}</div></li>`;
      }

      return `<li>${bodyHtml}${childHtml}</li>`;
    })
    .join("");

  if (listType === "task") {
    return {
      html: `<ul data-type="taskList">${itemsHtml}</ul>`,
      nextIndex: index
    };
  }

  if (listType === "ordered") {
    const startAttr =
      startNumber && startNumber > 1 ? ` start="${startNumber}"` : "";

    return {
      html: `<ol${startAttr}>${itemsHtml}</ol>`,
      nextIndex: index
    };
  }

  return {
    html: `<ul>${itemsHtml}</ul>`,
    nextIndex: index
  };
};

const parseMarkdownCodeBlock = (lines, startIndex) => {
  const openingLine = lines[startIndex].trim();
  const match = openingLine.match(/^```([\w-]+)?\s*$/);

  if (!match) {
    return null;
  }

  const language = match[1] || "";
  const codeLines = [];
  let index = startIndex + 1;

  while (index < lines.length && !/^```/.test(lines[index].trim())) {
    codeLines.push(lines[index]);
    index += 1;
  }

  if (index < lines.length) {
    index += 1;
  }

  const languageClass = language
    ? ` class="language-${escapeHtmlAttribute(language)}"`
    : "";

  return {
    html: `<pre><code${languageClass}>${escapeHtml(
      codeLines.join("\n")
    )}</code></pre>`,
    nextIndex: index
  };
};

const parseMarkdownBlockquote = (lines, startIndex) => {
  if (!/^>\s?/.test(lines[startIndex])) {
    return null;
  }

  const quoteLines = [];
  let index = startIndex;

  while (index < lines.length && /^>\s?/.test(lines[index])) {
    quoteLines.push(lines[index].replace(/^>\s?/, ""));
    index += 1;
  }

  const innerHtml = convertMarkdownToHtml(quoteLines.join("\n"));

  return {
    html: `<blockquote>${innerHtml || "<p></p>"}</blockquote>`,
    nextIndex: index
  };
};

export const convertMarkdownToHtml = (markdownText) => {
  const normalized = normalizeLineEndings(markdownText).trim();

  if (!normalized) {
    return "";
  }

  const lines = normalized.split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    const headingMatch = rawLine.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(
        `<h${level}>${convertMarkdownInlineToHtml(
          headingMatch[2].trim()
        )}</h${level}>`
      );
      index += 1;
      continue;
    }

    if (/^([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    const codeBlock = parseMarkdownCodeBlock(lines, index);

    if (codeBlock) {
      blocks.push(codeBlock.html);
      index = codeBlock.nextIndex;
      continue;
    }

    const blockquote = parseMarkdownBlockquote(lines, index);

    if (blockquote) {
      blocks.push(blockquote.html);
      index = blockquote.nextIndex;
      continue;
    }

    const table = parseMarkdownTable(lines, index);

    if (table) {
      blocks.push(table.html);
      index = table.nextIndex;
      continue;
    }

    const list = parseMarkdownList(lines, index);

    if (list) {
      blocks.push(list.html);
      index = list.nextIndex;
      continue;
    }

    const paragraphLines = [rawLine];
    index += 1;

    while (index < lines.length) {
      const nextLine = lines[index];
      const trimmedNextLine = nextLine.trim();

      if (
        !trimmedNextLine ||
        /^(#{1,6})\s+/.test(nextLine) ||
        /^([-*_])(\s*\1){2,}\s*$/.test(trimmedNextLine) ||
        /^```/.test(trimmedNextLine) ||
        /^>\s?/.test(nextLine) ||
        parseMarkdownTable(lines, index) ||
        parseMarkdownList(lines, index)
      ) {
        break;
      }

      paragraphLines.push(nextLine);
      index += 1;
    }

    blocks.push(renderMarkdownParagraphs(paragraphLines));
  }

  return blocks.join("");
};
