export const DOCKIT_DESIGN_PRESETS = Object.freeze([
  "cover-title-primary",
  "cover-subtitle",
  "section-title-accent",
  "summary-callout",
  "key-message"
]);

export const DOCKIT_DESIGN_PRESET_SET = new Set(DOCKIT_DESIGN_PRESETS);

export const validateDockitDesignPreset = (value) => {
  if (value === null || value === undefined || value === "") {
    return { valid: true, value: null };
  }

  if (typeof value !== "string") {
    return { valid: false, value: null };
  }

  const normalized = value.normalize("NFC").trim();

  return DOCKIT_DESIGN_PRESET_SET.has(normalized)
    ? { valid: true, value: normalized }
    : { valid: false, value: null };
};
