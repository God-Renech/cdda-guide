export const DEFAULT_LOCALE = "zh_CN";

export function localeFromUrl(url: URL): string {
  return url.searchParams.get("lang") ?? DEFAULT_LOCALE;
}

export function setLocaleInUrl(url: URL, locale: string): void {
  if (locale === DEFAULT_LOCALE) {
    url.searchParams.delete("lang");
  } else {
    url.searchParams.set("lang", locale);
  }
}
