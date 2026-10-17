import { memo, useCallback } from "react";
import { Typography } from "sud-ui";

const previewFamilies = new WeakMap();
let previewObserver;

function observePreview(element, fontFamily) {
  if (typeof IntersectionObserver === "undefined") {
    element.style.fontFamily = fontFamily;
    return;
  }
  previewObserver ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const family = previewFamilies.get(entry.target);
      if (family) entry.target.style.fontFamily = family;
      previewObserver.unobserve(entry.target);
      previewFamilies.delete(entry.target);
    }
  });
  previewFamilies.set(element, fontFamily);
  previewObserver.observe(element);
  return () => {
    previewObserver.unobserve(element);
    previewFamilies.delete(element);
  };
}

const FontOptionPreview = memo(function FontOptionPreview({ label, fontFamily }) {
  const previewRef = useCallback((element) => {
    if (element) return observePreview(element, fontFamily);
  }, [fontFamily]);

  return (
    <Typography ref={previewRef} size="sm" className="not-dockit-font" style={{ display: "block" }}>
      {label}
    </Typography>
  );
});

export default FontOptionPreview;
