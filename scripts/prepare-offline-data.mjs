import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const remoteBaseUrl =
  "https://raw.githubusercontent.com/nornagon/cdda-data/main";
const outputRoot = "public/offline-data";

function parseArgs(argv) {
  const versionsArg = argv.find((arg) => arg.startsWith("--versions="));
  return {
    versions: versionsArg
      ? versionsArg.slice("--versions=".length).split(",").filter(Boolean)
      : ["latest", "stable"],
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Error ${response.status} (${response.statusText}) fetching ${url}`,
    );
  }
  return response.json();
}

async function fetchOptionalJson(url) {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Error ${response.status} (${response.statusText}) fetching ${url}`,
    );
  }
  return response.json();
}

function selectBuilds(builds, requestedVersions) {
  const latest = builds[0];
  const stable = builds.find((build) => !build.prerelease);
  if (!latest) throw new Error("No latest build found in builds.json");
  if (!stable) throw new Error("No stable build found in builds.json");

  const selected = requestedVersions.map((version) => {
    if (version === "latest") return latest;
    if (version === "stable") return stable;
    const build = builds.find(
      (candidate) => String(candidate.build_number) === version,
    );
    if (!build) throw new Error(`Requested build not found: ${version}`);
    return build;
  });

  return [
    ...new Map(selected.map((build) => [build.build_number, build])).values(),
  ];
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value));
}

async function main() {
  const { versions } = parseArgs(process.argv.slice(2));
  const builds = await fetchJson(`${remoteBaseUrl}/builds.json`);
  const selectedBuilds = selectBuilds(builds, versions);
  const latest = builds[0];
  const stable = builds.find((build) => !build.prerelease);

  for (const build of selectedBuilds) {
    const version = build.build_number;
    await writeJson(
      path.join(outputRoot, "data", version, "all.json"),
      await fetchJson(`${remoteBaseUrl}/data/${version}/all.json`),
    );
    await writeJson(
      path.join(outputRoot, "data", version, "lang", "zh_CN.json"),
      await fetchJson(`${remoteBaseUrl}/data/${version}/lang/zh_CN.json`),
    );
    const pinyin = await fetchOptionalJson(
      `${remoteBaseUrl}/data/${version}/lang/zh_CN_pinyin.json`,
    );
    if (pinyin) {
      await writeJson(
        path.join(outputRoot, "data", version, "lang", "zh_CN_pinyin.json"),
        pinyin,
      );
    }
  }

  await writeJson(path.join(outputRoot, "offline-manifest.json"), {
    schemaVersion: 1,
    defaultVersion: latest.build_number,
    stableVersion: stable.build_number,
    bundledVersions: selectedBuilds,
    offlineLanguages: ["en", "zh_CN"],
    dataBasePath: "/offline-data",
    remoteBaseUrl,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
