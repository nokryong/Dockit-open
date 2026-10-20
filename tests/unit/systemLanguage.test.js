import { describe, expect, it } from "vitest";
import { normalizeLanguagePreference, resolveLanguage } from "../../app/LIB/i18n";

describe("system language", () => {
  it("keeps explicit choices and treats anything else as the system language", () => {
    expect(normalizeLanguagePreference("ko")).toBe("ko");
    expect(normalizeLanguagePreference("en")).toBe("en");
    expect(normalizeLanguagePreference("system")).toBe("system");
    expect(normalizeLanguagePreference(undefined)).toBe("system");
    expect(normalizeLanguagePreference("fr")).toBe("system");
  });

  it("uses Korean only for a Korean system and English otherwise", () => {
    expect(resolveLanguage("system", "ko-KR")).toBe("ko");
    expect(resolveLanguage("system", "ko")).toBe("ko");
    expect(resolveLanguage("system", "en-US")).toBe("en");
    expect(resolveLanguage("system", "ja-JP")).toBe("en");
    expect(resolveLanguage("system", "")).toBe("en");
    expect(resolveLanguage("ko", "en-US")).toBe("ko");
    expect(resolveLanguage("en", "ko-KR")).toBe("en");
  });
});
