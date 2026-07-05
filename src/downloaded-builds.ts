import type { BuildInfo } from "./data-sources";

export type DownloadedBuild = BuildInfo;

const STORAGE_KEY = "cdda-guide:downloaded-builds";

function uniqueByBuildNumber(builds: BuildInfo[]): BuildInfo[] {
  const byBuildNumber = new Map<string, BuildInfo>();
  for (const build of builds) {
    byBuildNumber.set(build.build_number, build);
  }
  return [...byBuildNumber.values()];
}

export function addDownloadedBuild(
  downloadedBuilds: DownloadedBuild[],
  build: BuildInfo,
): DownloadedBuild[] {
  return uniqueByBuildNumber([...downloadedBuilds, build]);
}

export function removeDownloadedBuild(
  downloadedBuilds: DownloadedBuild[],
  buildNumber: string,
): DownloadedBuild[] {
  return downloadedBuilds.filter((build) => build.build_number !== buildNumber);
}

export function mergeSelectableBuilds(
  bundledBuilds: BuildInfo[],
  downloadedBuilds: DownloadedBuild[],
): BuildInfo[] {
  return uniqueByBuildNumber([...bundledBuilds, ...downloadedBuilds]);
}

export function loadDownloadedBuilds(
  storage: Storage = localStorage,
): DownloadedBuild[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (build): build is DownloadedBuild =>
        build &&
        typeof build.build_number === "string" &&
        typeof build.prerelease === "boolean" &&
        typeof build.created_at === "string" &&
        Array.isArray(build.langs),
    );
  } catch {
    return [];
  }
}

export function saveDownloadedBuilds(
  downloadedBuilds: DownloadedBuild[],
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify(uniqueByBuildNumber(downloadedBuilds)),
    );
  } catch {
    // Ignore storage failures; downloading should still work for this session.
  }
}
