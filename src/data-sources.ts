export type BuildInfo = {
  build_number: string;
  prerelease: boolean;
  created_at: string;
  langs: string[];
};

export type OfflineManifest = {
  schemaVersion: number;
  defaultVersion: string;
  stableVersion?: string;
  bundledVersions: BuildInfo[];
  offlineLanguages: string[];
  dataBasePath?: string;
  remoteBaseUrl?: string;
};

type LanguageUrls = {
  localeUrl: string | null;
  pinyinUrl: string | null;
};

const DEFAULT_REMOTE_BASE_URL =
  "https://raw.githubusercontent.com/nornagon/cdda-data/main";
const DEFAULT_OFFLINE_LANGUAGES = ["en", "zh_CN"];

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function localDataBasePath(manifest: OfflineManifest | null): string {
  return stripTrailingSlash(
    manifest?.dataBasePath ?? `${import.meta.env.BASE_URL}offline-data`,
  );
}

function remoteBaseUrl(manifest: OfflineManifest | null): string {
  return stripTrailingSlash(manifest?.remoteBaseUrl ?? DEFAULT_REMOTE_BASE_URL);
}

function dataBaseUrl(
  version: string,
  manifest: OfflineManifest | null,
  forceRemote = false,
): string {
  const base =
    !forceRemote && isBundledVersion(version, manifest)
      ? localDataBasePath(manifest)
      : remoteBaseUrl(manifest);
  return `${base}/data/${version}`;
}

function isEnglishLocale(locale: string | null): locale is null | "" | "en" {
  return locale == null || locale === "" || locale === "en";
}

function isChineseLocale(locale: string): boolean {
  return locale.startsWith("zh_");
}

function normalizedManifest(manifest: OfflineManifest): OfflineManifest {
  return {
    ...manifest,
    dataBasePath: localDataBasePath(manifest),
    remoteBaseUrl: remoteBaseUrl(manifest),
  };
}

export function normalizeRequestedVersion(
  version: string,
  manifest: OfflineManifest | null,
): string {
  return version === "latest" && manifest ? manifest.defaultVersion : version;
}

export function isBundledVersion(
  version: string,
  manifest: OfflineManifest | null,
): boolean {
  if (!manifest) {
    return false;
  }
  const normalizedVersion = normalizeRequestedVersion(version, manifest);
  return manifest.bundledVersions.some(
    (build) => build.build_number === normalizedVersion,
  );
}

export function bundledBuildsFromManifest(
  manifest: OfflineManifest | null,
): BuildInfo[] {
  return manifest?.bundledVersions ?? [];
}

export function dataJsonUrl(
  version: string,
  manifest: OfflineManifest | null,
): string {
  const normalizedVersion = normalizeRequestedVersion(version, manifest);
  return `${dataBaseUrl(normalizedVersion, manifest)}/all.json`;
}

export function languageJsonUrls(
  version: string,
  locale: string | null,
  manifest: OfflineManifest | null,
): LanguageUrls {
  if (isEnglishLocale(locale)) {
    return { localeUrl: null, pinyinUrl: null };
  }

  const normalizedVersion = normalizeRequestedVersion(version, manifest);
  const base = dataBaseUrl(normalizedVersion, manifest);
  return {
    localeUrl: `${base}/lang/${locale}.json`,
    pinyinUrl: isChineseLocale(locale)
      ? `${base}/lang/${locale}_pinyin.json`
      : null,
  };
}

export function resolveDataUrls(
  version: string,
  locale: string | null,
  manifest: OfflineManifest | null,
) {
  const normalized = normalizeRequestedVersion(version, manifest);
  const { localeUrl, pinyinUrl } = languageJsonUrls(
    normalized,
    locale,
    manifest,
  );
  return {
    version: normalized,
    dataUrl: dataJsonUrl(normalized, manifest),
    localeUrl,
    pinyinUrl,
    bundled: isBundledVersion(normalized, manifest),
  };
}

export function getDownloadTargets(
  version: string,
  manifest: OfflineManifest | null,
): string[] {
  const normalizedVersion = normalizeRequestedVersion(version, manifest);
  const base = dataBaseUrl(normalizedVersion, manifest, true);
  const targets = [`${base}/all.json`];

  for (const locale of manifest?.offlineLanguages ??
    DEFAULT_OFFLINE_LANGUAGES) {
    if (isEnglishLocale(locale)) {
      continue;
    }
    targets.push(`${base}/lang/${locale}.json`);
    if (isChineseLocale(locale)) {
      targets.push(`${base}/lang/${locale}_pinyin.json`);
    }
  }

  return targets;
}

let offlineManifestPromise: Promise<OfflineManifest | null> | null = null;

export async function loadOfflineManifest(
  fetchImpl: typeof fetch = fetch,
): Promise<OfflineManifest | null> {
  if (!offlineManifestPromise) {
    offlineManifestPromise = fetchImpl(
      `${localDataBasePath(null)}/offline-manifest.json`,
    )
      .then((response) =>
        response.ok ? (response.json() as Promise<OfflineManifest>) : null,
      )
      .then((manifest) => (manifest ? normalizedManifest(manifest) : null))
      .catch(() => null);
  }
  return offlineManifestPromise;
}

export async function loadRemoteBuilds(
  fetchImpl: typeof fetch = fetch,
  manifest: OfflineManifest | null = null,
): Promise<BuildInfo[]> {
  const response = await fetchImpl(`${remoteBaseUrl(manifest)}/builds.json`);
  if (!response.ok) {
    throw new Error(`Failed to load remote builds: ${response.status}`);
  }
  return (await response.json()) as BuildInfo[];
}

export async function downloadVersionData(
  version: string,
  manifest: OfflineManifest | null,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const targets = getDownloadTargets(version, manifest);

  for (const target of targets) {
    const response = await fetchImpl(target);
    if (!response.ok) {
      if (target.endsWith("_pinyin.json") && response.status === 404) {
        continue;
      }
      throw new Error(`Failed to download ${target}: ${response.status}`);
    }
    await response.arrayBuffer();
  }
}
