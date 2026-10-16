const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "sub",
  "span",
  "strike",
  "strong",
  "sup",
  "u",
  "ul"
]);

const DROP_WITH_CONTENT = new Set([
  "base",
  "embed",
  "iframe",
  "object",
  "script",
  "style"
]);

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const isAllowedHref = (href) => {
  try {
    const protocol = new URL(href, "https://dockit.invalid").protocol;
    return ["http:", "https:", "mailto:"].includes(protocol);
  } catch {
    return false;
  }
};

// Untrusted rich HTML is only rendered through this DOM-based allowlist boundary.
// Current callers receive content after client-side state/fetch updates. The fallback
// remains safe if this utility is ever reached while DOMParser is unavailable.
export const sanitizeRichHtml = (html) => {
  if (typeof DOMParser === "undefined") {
    return escapeHtml(html || "");
  }

  const document = new DOMParser().parseFromString(String(html || ""), "text/html");

  [...document.body.querySelectorAll("*")].forEach((element) => {
    const tagName = element.tagName.toLowerCase();

    if (DROP_WITH_CONTENT.has(tagName)) {
      element.remove();
      return;
    }

    if (!ALLOWED_TAGS.has(tagName)) {
      element.replaceWith(document.createTextNode(element.textContent || ""));
      return;
    }

    [...element.attributes].forEach((attribute) => {
      if (tagName === "a" && attribute.name.toLowerCase() === "href") {
        if (!isAllowedHref(attribute.value)) {
          element.removeAttribute(attribute.name);
        }
        return;
      }

      element.removeAttribute(attribute.name);
    });

    if (tagName === "a" && element.hasAttribute("href")) {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer nofollow");
    }
  });

  return document.body.innerHTML;
};
