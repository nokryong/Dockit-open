const counterStyleMap = {
  decimal: "decimal",
  "upper-roman": "upper-roman",
  "lower-roman": "lower-roman",
  "upper-alpha": "upper-alpha",
  "lower-alpha": "lower-alpha",
  korean: "hangul-consonant",
  "korean-2": "hangul"
};

const toRoman = (num) => {
  const values = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const symbols = [
    "M",
    "CM",
    "D",
    "CD",
    "C",
    "XC",
    "L",
    "XL",
    "X",
    "IX",
    "V",
    "IV",
    "I"
  ];

  let result = "";
  let remaining = num;

  for (let index = 0; index < values.length; index += 1) {
    while (remaining >= values[index]) {
      result += symbols[index];
      remaining -= values[index];
    }
  }

  return result;
};

const formatNumber = (num, style) => {
  switch (style) {
    case "decimal":
      return num.toString();
    case "upper-roman":
      return toRoman(num).toUpperCase();
    case "lower-roman":
      return toRoman(num).toLowerCase();
    case "upper-alpha":
      return String.fromCharCode(64 + num);
    case "lower-alpha":
      return String.fromCharCode(96 + num);
    case "hangul-consonant": {
      const consonants = [
        "ㄱ",
        "ㄴ",
        "ㄷ",
        "ㄹ",
        "ㅁ",
        "ㅂ",
        "ㅅ",
        "ㅇ",
        "ㅈ",
        "ㅊ",
        "ㅋ",
        "ㅌ",
        "ㅍ",
        "ㅎ"
      ];

      return consonants[(num - 1) % consonants.length];
    }
    case "hangul": {
      const syllables = [
        "가",
        "나",
        "다",
        "라",
        "마",
        "바",
        "사",
        "아",
        "자",
        "차",
        "카",
        "타",
        "파",
        "하"
      ];

      return syllables[(num - 1) % syllables.length];
    }
    default:
      return num.toString();
  }
};

export const collectHeadingEntries = (doc, bulletStyle = {}) => {
  if (!doc) return [];

  const counters = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  const headingNumbers = {
    h1: "",
    h2: "",
    h3: "",
    h4: "",
    h5: ""
  };
  const headings = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") {
      return true;
    }

    const level = node.attrs.level;
    const levelKey = `h${level}`;

    counters[levelKey] += 1;

    if (level === 1) {
      counters.h2 = 0;
      counters.h3 = 0;
      counters.h4 = 0;
      counters.h5 = 0;
      counters.h6 = 0;
    } else if (level === 2) {
      counters.h3 = 0;
      counters.h4 = 0;
      counters.h5 = 0;
      counters.h6 = 0;
    } else if (level === 3) {
      counters.h4 = 0;
      counters.h5 = 0;
      counters.h6 = 0;
    } else if (level === 4) {
      counters.h5 = 0;
      counters.h6 = 0;
    } else if (level === 5) {
      counters.h6 = 0;
    }

    const styleKey = bulletStyle?.[levelKey];
    const cssStyle = counterStyleMap[styleKey] || "decimal";

    let number = "";

    if (level === 1) {
      number = formatNumber(counters.h1, cssStyle);
      headingNumbers.h1 = number;
    } else if (level === 2) {
      number = `${headingNumbers.h1}.${formatNumber(counters.h2, cssStyle)}`;
      headingNumbers.h2 = number;
    } else if (level === 3) {
      number = `${headingNumbers.h2}.${formatNumber(counters.h3, cssStyle)}`;
      headingNumbers.h3 = number;
    } else if (level === 4) {
      number = `${headingNumbers.h3}.${formatNumber(counters.h4, cssStyle)}`;
      headingNumbers.h4 = number;
    } else if (level === 5) {
      number = `${headingNumbers.h4}.${formatNumber(counters.h5, cssStyle)}`;
      headingNumbers.h5 = number;
    } else if (level === 6) {
      number = `${headingNumbers.h5}.${formatNumber(counters.h6, cssStyle)}`;
    }

    headings.push({
      pos,
      headingId: node.attrs.headingId || null,
      level,
      number,
      text: node.textContent?.trim() || ""
    });

    return true;
  });

  return headings;
};

export const getPageNumberForElement = (targetElement) => {
  if (!(targetElement instanceof Element)) {
    return 1;
  }

  const root = targetElement.closest(".ProseMirror");

  if (!root) {
    return 1;
  }

  return (
    Array.from(root.querySelectorAll(".page-footer-spacer")).filter((element) =>
      Boolean(
        element.compareDocumentPosition(targetElement) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).length + 1
  );
};

export const getPageNumberForNodePos = (editor, pos) => {
  if (!editor?.view) {
    return 1;
  }

  return getPageNumberForElement(editor.view.nodeDOM(pos));
};

export const getHeadingElementById = (editor, headingId) => {
  if (!editor?.view || !headingId) {
    return null;
  }

  const ownerDocument = editor.view.dom?.ownerDocument;
  const headingElement = ownerDocument?.getElementById(headingId);

  if (!(headingElement instanceof Element)) {
    return null;
  }

  return editor.view.dom.contains(headingElement) ? headingElement : null;
};

export const getPageNumberForHeadingId = (editor, headingId) =>
  getPageNumberForElement(getHeadingElementById(editor, headingId));

const createTextNode = (text, marks = []) => ({
  type: "text",
  text,
  ...(marks.length > 0 ? { marks } : {})
});

export const createTocTitleNode = (titleText = "목차") => ({
  type: "paragraph",
  content: [
    createTextNode(titleText)
  ]
});

export const createTocEntryNode = (entry) => ({
  type: "tocItem",
  attrs: {
    targetId: entry.headingId
  }
});

export const createTocNodes = (entries, options = {}) => {
  const { includeTitle = true, titleText = "목차" } = options;
  const nodes = entries.map(createTocEntryNode);

  if (!includeTitle) {
    return nodes;
  }

  return [createTocTitleNode(titleText), ...nodes];
};
