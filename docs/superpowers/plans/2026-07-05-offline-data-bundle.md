# Offline Data Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline-first release path that bundles latest experimental and latest stable CDDA JSON data, while letting users explicitly download other versions for offline reuse.

**Architecture:** Add a small data-source module that decides whether a version should load from bundled local files or remote GitHub URLs. Add a build-time preparation script that writes the bundled data and manifest under `public/offline-data/`. Keep normal startup local-only; remote version lists are fetched only from the user-triggered download flow.

**Tech Stack:** TypeScript, Svelte 5, Vite, Vitest, Workbox via `vite-plugin-pwa`, Node.js ESM scripts.

---

## File Structure

- Create `src/data-sources.ts`: Pure helpers for offline manifest loading, version resolution, data URL selection, remote build list loading, and explicit version download.
- Create `src/data-sources.test.ts`: Vitest coverage for manifest parsing, local-vs-remote URL selection, language target selection, and lazy remote fetch behavior.
- Modify `src/data.ts`: Replace hardcoded GitHub data URLs with URLs provided by `src/data-sources.ts`.
- Modify `src/App.svelte`: Stop fetching remote `builds.json` on startup, use bundled manifest builds for the main selector, and add a user-triggered download flow for other versions.
- Create `scripts/prepare-offline-data.mjs`: Download upstream build metadata and selected JSON files into `public/offline-data/`.
- Modify `package.json`: Add `prepare-offline-data` and `build:offline` scripts.
- Modify `vite.config.ts`: Ensure Workbox runtime caching covers remote language JSON as well as `all.json`.

## Task 1: Add Data Source Helpers

**Files:**
- Create: `src/data-sources.ts`
- Test: `src/data-sources.test.ts`

- [ ] **Step 1: Write failing tests for manifest-based URL resolution**

Create `src/data-sources.test.ts`:

```ts
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
  remoteBaseUrl:
    "https://raw.githubusercontent.com/nornagon/cdda-data/main",
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
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```shell
npx vitest run src/data-sources.test.ts
```

Expected: FAIL because `src/data-sources.ts` does not exist.

- [ ] **Step 3: Implement the data-source helper module**

Create `src/data-sources.ts`:

```ts
export type BuildInfo = {
  build_number: string;
  prerelease: boolean;
  created_at: string;
  langs?: string[];
};

export type OfflineManifest = {
  schemaVersion: 1;
  defaultVersion: string;
  stableVersion: string;
  bundledVersions: BuildInfo[];
  offlineLanguages: string[];
  dataBasePath: string;
  remoteBaseUrl: string;
};

const remoteBaseUrl = "https://raw.githubusercontent.com/nornagon/cdda-data/main";
const localDataBasePath = `${import.meta.env.BASE_URL}offline-data`.replace(
  /\/$/,
  "",
);

let offlineManifestPromise: Promise<OfflineManifest | null> | null = null;

const withoutTrailingSlash = (value: string) => value.replace(/\/$/, "");

const manifestBasePath = (manifest: OfflineManifest | null) =>
  withoutTrailingSlash(manifest?.dataBasePath ?? localDataBasePath);

const manifestRemoteBaseUrl = (manifest: OfflineManifest | null) =>
  withoutTrailingSlash(manifest?.remoteBaseUrl ?? remoteBaseUrl);

export function normalizeRequestedVersion(
  version: string,
  manifest: OfflineManifest | null,
) {
  if (version === "latest" && manifest) return manifest.defaultVersion;
  return version;
}

export function isBundledVersion(
  version: string,
  manifest: OfflineManifest | null,
) {
  const normalized = normalizeRequestedVersion(version, manifest);
  return (
    manifest?.bundledVersions.some(
      (build) => build.build_number === normalized,
    ) ?? false
  );
}

export function dataJsonUrl(version: string, manifest: OfflineManifest | null) {
  const normalized = normalizeRequestedVersion(version, manifest);
  if (isBundledVersion(normalized, manifest)) {
    return `${manifestBasePath(manifest)}/data/${normalized}/all.json`;
  }
  return `${manifestRemoteBaseUrl(manifest)}/data/${normalized}/all.json`;
}

export function languageJsonUrls(
  version: string,
  locale: string | null,
  manifest: OfflineManifest | null,
) {
  if (!locale || locale === "en") {
    return { localeUrl: null, pinyinUrl: null };
  }

  const normalized = normalizeRequestedVersion(version, manifest);
  const baseUrl = isBundledVersion(normalized, manifest)
    ? `${manifestBasePath(manifest)}/data/${normalized}/lang`
    : `${manifestRemoteBaseUrl(manifest)}/data/${normalized}/lang`;

  return {
    localeUrl: `${baseUrl}/${locale}.json`,
    pinyinUrl: locale.startsWith("zh_") ? `${baseUrl}/${locale}_pinyin.json` : null,
  };
}

export function getDownloadTargets(
  version: string,
  manifest: OfflineManifest | null,
) {
  const remoteBase = manifestRemoteBaseUrl(manifest);
  return [
    `${remoteBase}/data/${version}/all.json`,
    `${remoteBase}/data/${version}/lang/zh_CN.json`,
    `${remoteBase}/data/${version}/lang/zh_CN_pinyin.json`,
  ];
}

export async function loadOfflineManifest(fetchImpl: typeof fetch = fetch) {
  if (!offlineManifestPromise) {
    offlineManifestPromise = fetchImpl(`${localDataBasePath}/offline-manifest.json`)
      .then((response) => {
        if (!response.ok) return null;
        return response.json() as Promise<OfflineManifest>;
      })
      .catch(() => null);
  }
  return offlineManifestPromise;
}

export async function loadRemoteBuilds(
  fetchImpl: typeof fetch = fetch,
  manifest: OfflineManifest | null = null,
) {
  const response = await fetchImpl(`${manifestRemoteBaseUrl(manifest)}/builds.json`);
  if (!response.ok) {
    throw new Error(
      `Error ${response.status} (${response.statusText}) fetching builds.json`,
    );
  }
  return (await response.json()) as BuildInfo[];
}

export async function downloadVersionData(
  version: string,
  manifest: OfflineManifest | null,
  fetchImpl: typeof fetch = fetch,
) {
  const targets = getDownloadTargets(version, manifest);
  const results = [];
  for (const target of targets) {
    const response = await fetchImpl(target);
    if (!response.ok && !target.endsWith("_pinyin.json")) {
      throw new Error(
        `Error ${response.status} (${response.statusText}) downloading ${target}`,
      );
    }
    if (response.ok) await response.arrayBuffer();
    results.push({ url: target, ok: response.ok });
  }
  return results;
}
```

- [ ] **Step 4: Run the data-source tests**

Run:

```shell
npx vitest run src/data-sources.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```shell
git add src/data-sources.ts src/data-sources.test.ts
git commit -m "Add offline data source helpers"
```

## Task 2: Route Data Loading Through Data Sources

**Files:**
- Modify: `src/data.ts`
- Test: `src/data-sources.test.ts`

- [ ] **Step 1: Add a test for resolved source loading inputs**

Extend `src/data-sources.test.ts` with:

```ts
import { resolveDataUrls } from "./data-sources";

it("resolves data and language URLs together", () => {
  expect(resolveDataUrls("latest", "zh_CN", manifest)).toEqual({
    version: "2026-07-05-1200",
    dataUrl: "/offline-data/data/2026-07-05-1200/all.json",
    localeUrl: "/offline-data/data/2026-07-05-1200/lang/zh_CN.json",
    pinyinUrl: "/offline-data/data/2026-07-05-1200/lang/zh_CN_pinyin.json",
    bundled: true,
  });
});
```

- [ ] **Step 2: Run the data-source test and verify it fails**

Run:

```shell
npx vitest run src/data-sources.test.ts
```

Expected: FAIL because `resolveDataUrls` is not exported.

- [ ] **Step 3: Add `resolveDataUrls` to `src/data-sources.ts`**

Add:

```ts
export function resolveDataUrls(
  version: string,
  locale: string | null,
  manifest: OfflineManifest | null,
) {
  const normalized = normalizeRequestedVersion(version, manifest);
  const { localeUrl, pinyinUrl } = languageJsonUrls(normalized, locale, manifest);
  return {
    version: normalized,
    dataUrl: dataJsonUrl(normalized, manifest),
    localeUrl,
    pinyinUrl,
    bundled: isBundledVersion(normalized, manifest),
  };
}
```

- [ ] **Step 4: Modify `src/data.ts` to use resolved URLs**

Change the imports:

```ts
import {
  loadOfflineManifest,
  resolveDataUrls,
} from "./data-sources";
```

Replace `fetchJson` and `fetchLocaleJson` with URL-based helpers:

```ts
const fetchJson = async (
  url: string,
  progress: (receivedBytes: number, totalBytes: number) => void,
) => {
  return fetchJsonWithProgress(url, progress);
};
```

Inside `data.setVersion`, before the `Promise.all`, add:

```ts
const manifest = await loadOfflineManifest();
const sourceUrls = resolveDataUrls(version, locale, manifest);
```

Then change the `Promise.all` calls to:

```ts
const [dataJson, localeJson, pinyinNameJson] = await Promise.all([
  retry(() =>
    fetchJson(sourceUrls.dataUrl, (receivedBytes, totalBytes) => {
      totals[0] = totalBytes;
      receiveds[0] = receivedBytes;
      updateProgress();
    }),
  ),
  sourceUrls.localeUrl &&
    retry(() =>
      fetchJson(sourceUrls.localeUrl!, (receivedBytes, totalBytes) => {
        totals[1] = totalBytes;
        receiveds[1] = receivedBytes;
        updateProgress();
      }),
    ),
  sourceUrls.pinyinUrl &&
    retry(() =>
      fetchJson(sourceUrls.pinyinUrl!, (receivedBytes, totalBytes) => {
        totals[2] = totalBytes;
        receiveds[2] = receivedBytes;
        updateProgress();
      }),
    ),
]);
```

- [ ] **Step 5: Run tests for the changed module**

Run:

```shell
npx vitest run src/data-sources.test.ts src/data.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```shell
git add src/data.ts src/data-sources.ts src/data-sources.test.ts
git commit -m "Route data loading through offline sources"
```

## Task 3: Add Offline Data Preparation Script

**Files:**
- Create: `scripts/prepare-offline-data.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create the script**

Create `scripts/prepare-offline-data.mjs`:

```js
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
    const build = builds.find((candidate) => candidate.build_number === version);
    if (!build) throw new Error(`Requested build not found: ${version}`);
    return build;
  });

  return [...new Map(selected.map((build) => [build.build_number, build])).values()];
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
```

- [ ] **Step 2: Add package scripts**

Modify `package.json` scripts:

```json
"prepare-offline-data": "node scripts/prepare-offline-data.mjs",
"build:offline": "yarn prepare-offline-data && vite build",
```

- [ ] **Step 3: Check the script help path through syntax validation**

Run:

```shell
node --check scripts/prepare-offline-data.mjs
```

Expected: no syntax errors.

- [ ] **Step 4: Commit Task 3**

Run:

```shell
git add package.json scripts/prepare-offline-data.mjs
git commit -m "Add offline data preparation script"
```

## Task 4: Change App Startup and Version UI

**Files:**
- Modify: `src/App.svelte`
- Modify: `src/data-sources.ts`
- Test: `src/data-sources.test.ts`

- [ ] **Step 1: Add data-source helpers for UI state**

Extend `src/data-sources.test.ts`:

```ts
import { bundledBuildsFromManifest } from "./data-sources";

it("uses only bundled builds for normal version selection", () => {
  expect(bundledBuildsFromManifest(manifest)).toEqual(bundledBuilds);
});
```

- [ ] **Step 2: Implement `bundledBuildsFromManifest`**

Add to `src/data-sources.ts`:

```ts
export function bundledBuildsFromManifest(manifest: OfflineManifest | null) {
  return manifest?.bundledVersions ?? [];
}
```

- [ ] **Step 3: Update `App.svelte` imports**

Add:

```ts
import {
  bundledBuildsFromManifest,
  downloadVersionData,
  loadOfflineManifest,
  loadRemoteBuilds,
  type BuildInfo,
  type OfflineManifest,
} from "./data-sources";
```

- [ ] **Step 4: Replace startup remote builds fetch**

Replace the existing `builds` declaration and `fetch("https://raw.githubusercontent.com/nornagon/cdda-data/main/builds.json")` block with:

```ts
let offlineManifest: OfflineManifest | null = null;
let builds: BuildInfo[] | null = null;
let remoteBuilds: BuildInfo[] | null = null;
let remoteBuildsLoading = false;
let remoteBuildsError: string | null = null;
let downloadMessage: string | null = null;
let downloadingVersion: string | null = null;

loadOfflineManifest().then((manifest) => {
  offlineManifest = manifest;
  builds = bundledBuildsFromManifest(manifest);
});
```

- [ ] **Step 5: Add explicit remote download actions**

Add below `saveTileset`:

```ts
async function showRemoteBuilds() {
  remoteBuildsLoading = true;
  remoteBuildsError = null;
  downloadMessage = null;
  try {
    remoteBuilds = await loadRemoteBuilds(fetch, offlineManifest);
  } catch (e) {
    remoteBuildsError =
      e instanceof Error ? e.message : "Unable to load remote versions";
  } finally {
    remoteBuildsLoading = false;
  }
}

async function downloadBuild(buildNumber: string) {
  if (
    !confirm(
      t(
        "Download {buildNumber} for offline use? This downloads game JSON and Simplified Chinese language data.",
        { buildNumber },
      ),
    )
  ) {
    return;
  }
  downloadingVersion = buildNumber;
  remoteBuildsError = null;
  downloadMessage = null;
  try {
    await downloadVersionData(buildNumber, offlineManifest);
    downloadMessage = t("{buildNumber} downloaded. You can switch to it now.", {
      buildNumber,
    });
  } catch (e) {
    remoteBuildsError =
      e instanceof Error
        ? e.message
        : t("Unable to download {buildNumber}", { buildNumber });
  } finally {
    downloadingVersion = null;
  }
}
```

- [ ] **Step 6: Add download UI near version controls**

In the `.data-options` paragraph, after the version selector, add:

```svelte
<button type="button" on:click={showRemoteBuilds} disabled={remoteBuildsLoading}>
  {remoteBuildsLoading ? t("Loading...") : t("Download other version")}
</button>
```

Below the `.data-options` paragraph, add:

```svelte
{#if remoteBuildsError}
  <p class="download-status">{remoteBuildsError}</p>
{/if}
{#if downloadMessage}
  <p class="download-status">{downloadMessage}</p>
{/if}
{#if remoteBuilds}
  <ul class="remote-builds">
    {#each remoteBuilds as build}
      <li>
        <button
          type="button"
          disabled={downloadingVersion === build.build_number}
          on:click={() => downloadBuild(build.build_number)}>
          {downloadingVersion === build.build_number
            ? t("Loading...")
            : build.build_number}
        </button>
        {#if !build.prerelease}
          <span>{t("stable")}</span>
        {/if}
      </li>
    {/each}
  </ul>
{/if}
```

- [ ] **Step 7: Add compact styles**

In the `<style>` block, add:

```css
.download-status {
  color: var(--cata-color-gray);
}
.remote-builds {
  max-height: 12rem;
  overflow: auto;
  padding-left: 1.25rem;
}
.remote-builds li {
  margin: 0.25rem 0;
}
```

- [ ] **Step 8: Run targeted tests**

Run:

```shell
npx vitest run src/data-sources.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

Run:

```shell
git add src/App.svelte src/data-sources.ts src/data-sources.test.ts
git commit -m "Use bundled builds for startup"
```

## Task 5: Update PWA Runtime Cache Patterns

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Update remote data cache patterns**

In `vite.config.ts`, replace the two `all.json` runtime caching entries with patterns that also match language JSON:

```ts
{
  urlPattern:
    /^https:\/\/raw\.githubusercontent\.com\/.*\/latest\/(?:all|lang\/[^/]+)\.json$/,
  handler: "NetworkFirst",
},
{
  urlPattern:
    /^https:\/\/raw\.githubusercontent\.com\/.*\/data\/(?!latest\/).*\/(?:all|lang\/[^/]+)\.json$/,
  handler: "CacheFirst",
},
```

- [ ] **Step 2: Run validation**

Run:

```shell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit Task 5**

Run:

```shell
git add vite.config.ts
git commit -m "Cache downloaded language data"
```

## Task 6: Verify Offline Build Path

**Files:**
- No source edits unless verification reveals defects.

- [ ] **Step 1: Install dependencies if missing**

Run:

```shell
yarn install
```

Expected: dependencies installed or already current.

- [ ] **Step 2: Run focused tests**

Run:

```shell
npx vitest run src/data-sources.test.ts src/data.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run project validation**

Run:

```shell
yarn validate
```

Expected: PASS.

- [ ] **Step 4: Run offline data preparation when network is available**

Run:

```shell
yarn prepare-offline-data
```

Expected: `public/offline-data/offline-manifest.json` and two data directories are generated.

- [ ] **Step 5: Build the offline release**

Run:

```shell
yarn build:offline
```

Expected: Vite build completes and `dist/` contains the app plus `offline-data`.

- [ ] **Step 6: Keep generated data out of git**

Run:

```shell
git status --short
```

Expected: source changes are committed; generated `public/offline-data/` is untracked or ignored according to the implementation decision.

If generated data appears as untracked files, add a `.gitignore` entry for `public/offline-data/` and commit it:

```shell
git add .gitignore
git commit -m "Ignore generated offline data"
```

## Task 7: Push Branch

**Files:**
- No source edits.

- [ ] **Step 1: Check branch and log**

Run:

```shell
git status --short --branch
git log --oneline -5
```

Expected: branch is `feat/offline-data-bundle`, worktree is clean, and recent commits include the offline data work.

- [ ] **Step 2: Push to fork**

Run:

```shell
git push -u origin feat/offline-data-bundle
```

Expected: branch is pushed to `God-Renech/cdda-guide`.

---

## Spec Coverage Check

- Default bundled versions: Task 3 script selects latest experimental and latest stable.
- No image packs: Task 3 downloads only JSON; Task 5 does not add image caching.
- User-triggered remote list: Task 4 removes startup remote fetch and adds explicit download flow.
- Reuse original cache: Task 5 keeps Workbox runtime caching for remote data files.
- Future repacks: Task 3 supports `--versions`.
- GitHub fork workflow: Task 7 pushes the feature branch.
