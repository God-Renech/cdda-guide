import { describe, expect, it, vi } from "vitest";
import {
  dataJsonUrl,
  getDownloadTargets,
  languageJsonUrls,
  loadRemoteBuilds,
  normalizeRequestedVersion,
  type BuildInfo,
  type OfflineManifest,
} from "./data-sources";

const bundledBuilds: BuildInfo[] = [
  {
    build_number: "2026-07-05-1200",
    prerelease: true,
    created_at: "2026-07-05T12:00:00Z",
    langs: ["zh_CN"],
  },
  {
    build_number: "0.H-RELEASE",
    prerelease: false,
    created_at: "2026-06-01T00:00:00Z",
    langs: ["zh_CN"],
  },
];

const manifest: OfflineManifest = {
  schemaVersion: 1,
  defaultVersion: "2026-07-05-1200",
  stableVersion: "0.H-RELEASE",
  bundledVersions: bundledBuilds,
  offlineLanguages: ["en", "zh_CN"],
  dataBasePath: "/offline-data",
  remoteBaseUrl: "https://raw.githubusercontent.com/nornagon/cdda-data/main",
};

describe("offline data source helpers", () => {
  it("maps latest to the bundled default version", () => {
    expect(normalizeRequestedVersion("latest", manifest)).toBe(
      "2026-07-05-1200",
    );
    expect(normalizeRequestedVersion("0.H-RELEASE", manifest)).toBe(
      "0.H-RELEASE",
    );
  });

  it("uses bundled data URLs for bundled versions", () => {
    expect(dataJsonUrl("latest", manifest)).toBe(
      "/offline-data/data/2026-07-05-1200/all.json",
    );
    expect(dataJsonUrl("0.H-RELEASE", manifest)).toBe(
      "/offline-data/data/0.H-RELEASE/all.json",
    );
  });

  it("uses remote data URLs for non-bundled versions", () => {
    expect(dataJsonUrl("2026-07-04-0900", manifest)).toBe(
      "https://raw.githubusercontent.com/nornagon/cdda-data/main/data/2026-07-04-0900/all.json",
    );
  });

  it("does not request a language JSON for English", () => {
    expect(languageJsonUrls("latest", "en", manifest)).toEqual({
      localeUrl: null,
      pinyinUrl: null,
    });
  });

  it("requests Simplified Chinese and pinyin JSON for bundled versions", () => {
    expect(languageJsonUrls("latest", "zh_CN", manifest)).toEqual({
      localeUrl: "/offline-data/data/2026-07-05-1200/lang/zh_CN.json",
      pinyinUrl: "/offline-data/data/2026-07-05-1200/lang/zh_CN_pinyin.json",
    });
  });

  it("returns all remote download targets for an explicit version download", () => {
    expect(getDownloadTargets("2026-07-04-0900", manifest)).toEqual([
      "https://raw.githubusercontent.com/nornagon/cdda-data/main/data/2026-07-04-0900/all.json",
      "https://raw.githubusercontent.com/nornagon/cdda-data/main/data/2026-07-04-0900/lang/zh_CN.json",
      "https://raw.githubusercontent.com/nornagon/cdda-data/main/data/2026-07-04-0900/lang/zh_CN_pinyin.json",
    ]);
  });

  it("fetches remote builds only when requested", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => bundledBuilds,
    })) as unknown as typeof fetch;

    await expect(loadRemoteBuilds(fetchImpl, manifest)).resolves.toEqual(
      bundledBuilds,
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/nornagon/cdda-data/main/builds.json",
    );
  });
});
