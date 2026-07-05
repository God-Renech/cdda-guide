# Offline Data Bundle Design

## Goal

Build an offline-first release path for this fork of cdda-guide. The default
offline build ships with two data versions:

- latest experimental
- latest stable

The build must include game JSON data and Simplified Chinese language data only.
Tileset images are not bundled. Users can still explicitly download other
versions for offline reuse, but the app must not fetch or show the full remote
version list during normal startup.

## Non-Goals

- Do not bundle tileset image packs.
- Do not commit generated large data files by default.
- Do not replace the upstream online/cache behavior for versions that are not
  bundled.
- Do not add a full download-manager UI in the first implementation.

## Approach

Use a build-time data preparation script plus a small runtime data-source layer.
The script downloads the two default versions and writes them under
`public/offline-data/`. Vite then copies that directory into the production
build. The app reads a local manifest first and only contacts GitHub when the
user explicitly asks to download another version.

This keeps the offline fork close to upstream: the original remote data URLs and
service-worker runtime caching remain useful for explicitly downloaded versions,
while the default app path is local and fast.

## Offline Data Preparation

Add a script such as `scripts/prepare-offline-data.mjs`.

The script downloads upstream `builds.json`, then selects:

- the first build in the list as latest experimental
- the first build with `prerelease === false` as latest stable

For each selected build, it downloads:

- `data/<build>/all.json`
- `data/<build>/lang/zh_CN.json`
- `data/<build>/lang/zh_CN_pinyin.json`, when available

English does not need a language file because the app already uses the raw game
JSON strings as the English source.

The script writes:

- `public/offline-data/offline-manifest.json`
- `public/offline-data/data/<build>/all.json`
- `public/offline-data/data/<build>/lang/zh_CN.json`
- `public/offline-data/data/<build>/lang/zh_CN_pinyin.json`, when available

The manifest records bundled versions, default latest experimental, default
stable, supported offline languages, and enough build metadata for the version
selector.

The script should be parameterized so future releases can prepare other builds
without code changes. A future command may look like:

```shell
yarn prepare-offline-data --versions latest,stable
```

or:

```shell
yarn prepare-offline-data --versions 0.H-RELEASE,2026-07-05-1200
```

## Runtime Data Loading

Add a small module that resolves data URLs and build metadata.

It should provide:

- local manifest loading from `/offline-data/offline-manifest.json`
- bundled-version checks
- local `all.json` and language URLs for bundled builds
- remote GitHub URLs for non-bundled builds
- a lazy remote builds-list fetch used only by the download-other-version UI

Normal startup uses only the local manifest. The app should not fetch upstream
`builds.json` automatically, even when the network is available. This avoids slow
startup and bad UX behind restricted or unreliable access to GitHub.

The existing `data.setVersion(version, locale)` flow can remain mostly intact,
but its fetch helpers should receive URLs from the new data-source layer instead
of hardcoding GitHub URLs.

## Version Selection UI

The main version selector shows only the bundled latest experimental and latest
stable builds from the local manifest.

Next to the selector, add an explicit "download other version" entry point. Only
after the user opens that flow should the app fetch the remote build list.

The download flow should:

1. Fetch remote `builds.json` on demand.
2. Show available remote versions.
3. Ask the user to confirm downloading the selected version for offline use.
4. Download that version's `all.json`, `zh_CN.json`, and optional
   `zh_CN_pinyin.json`.
5. Let the existing service worker runtime cache store the downloaded responses.
6. Offer to switch to that version after a successful download.

Failures in this flow must not affect the currently loaded guide. If GitHub is
unreachable, show a small failure message and keep the user on bundled versions.

## Language Behavior

The offline build guarantees:

- English
- Simplified Chinese (`zh_CN`)

English uses source JSON strings and should not request an English language JSON.
Simplified Chinese loads `zh_CN.json` and, when present, `zh_CN_pinyin.json`.

Other languages can remain possible through upstream data if future UI exposes
them, but they are not part of the guaranteed offline bundle.

## PWA and Caching

Bundled data lives under `public/offline-data/` and is served from the same
origin as the app. Workbox should include these files in the static build output
or otherwise allow them to be requested reliably from the local app.

Remote data caching should continue to use the existing service-worker runtime
cache. The runtime caching URL patterns should cover:

- remote `all.json`
- remote `zh_CN.json`
- remote `zh_CN_pinyin.json`

The app should not bundle tileset image data. Existing tileset behavior can stay
online-only, and the default complete offline path is ASCII rendering.

## Build Commands

Add scripts such as:

```json
{
  "prepare-offline-data": "node scripts/prepare-offline-data.mjs",
  "build:offline": "yarn prepare-offline-data && vite build"
}
```

Keep the existing `build` script unchanged to reduce merge friction with
upstream.

## Testing

Add focused tests for the new data-source behavior:

- manifest parsing
- bundled-version detection
- URL selection for local bundled versions
- URL selection for remote non-bundled versions
- language URL behavior for English and Simplified Chinese
- remote builds list being fetched only when the user starts the download flow

Run the normal project checks where possible. If network-dependent fixture setup
fails, run the offline-safe unit tests and document the network limitation.

## Git and Release Flow

Implement on a branch named `feat/offline-data-bundle`.

Keep changes concentrated in:

- the offline data preparation script
- the data-source module
- local adjustments to `data.ts` and `App.svelte`
- Workbox cache patterns in `vite.config.ts`
- focused tests

Commit the design first, then implement in small commits. Push the branch to the
GitHub fork after verification.

Generated large JSON data should not be committed by default. The release or
deployment workflow should generate it before building the offline release.
