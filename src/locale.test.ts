import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, localeFromUrl, setLocaleInUrl } from "./locale";

describe("locale URL handling", () => {
  it("uses Simplified Chinese when no language is requested", () => {
    expect(localeFromUrl(new URL("https://example.test/"))).toBe(
      DEFAULT_LOCALE,
    );
  });

  it("keeps English explicit because Simplified Chinese is the default", () => {
    const url = new URL("https://example.test/?v=latest");

    setLocaleInUrl(url, "en");

    expect(url.searchParams.get("lang")).toBe("en");
  });

  it("removes the language parameter when selecting the default locale", () => {
    const url = new URL("https://example.test/?v=latest&lang=en");

    setLocaleInUrl(url, DEFAULT_LOCALE);

    expect(url.searchParams.has("lang")).toBe(false);
  });
});
