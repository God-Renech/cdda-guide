import { describe, expect, it } from "vitest";
import {
  addDownloadedBuild,
  mergeSelectableBuilds,
  removeDownloadedBuild,
  type DownloadedBuild,
} from "./downloaded-builds";

const stable: DownloadedBuild = {
  build_number: "0.H-RELEASE",
  prerelease: false,
  created_at: "2025-12-01T00:00:00Z",
  langs: ["zh_CN"],
};

const experimental: DownloadedBuild = {
  build_number: "2026-07-05-1200",
  prerelease: true,
  created_at: "2026-07-05T12:00:00Z",
  langs: ["zh_CN"],
};

describe("downloaded builds", () => {
  it("adds downloaded builds without duplicating an existing build", () => {
    const downloaded = addDownloadedBuild([stable], {
      ...stable,
      langs: ["en", "zh_CN"],
    });

    expect(downloaded).toEqual([{ ...stable, langs: ["en", "zh_CN"] }]);
  });

  it("removes downloaded builds by build number", () => {
    expect(
      removeDownloadedBuild([stable, experimental], stable.build_number),
    ).toEqual([experimental]);
  });

  it("merges bundled and downloaded builds for the version selector", () => {
    expect(mergeSelectableBuilds([experimental], [stable])).toEqual([
      experimental,
      stable,
    ]);
  });
});
