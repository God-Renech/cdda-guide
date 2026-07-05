import { describe, expect, it } from "vitest";
import { selectBuilds } from "./offline-build-selection.mjs";

const builds = [
  {
    build_number: "2026-07-05-1415",
    prerelease: true,
    created_at: "2026-07-05T14:15:00Z",
    langs: ["de"],
  },
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

describe("offline build selection", () => {
  it("selects the newest requested default builds that include Simplified Chinese", () => {
    expect(
      selectBuilds(builds, ["latest", "stable"]).map(
        (build) => build.build_number,
      ),
    ).toEqual(["2026-07-05-1200", "0.H-RELEASE"]);
  });
});
