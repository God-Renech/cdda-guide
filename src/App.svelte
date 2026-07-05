<script lang="ts">
import Thing from "./Thing.svelte";
import { CddaData, data, loadProgress, mapType, singularName } from "./data";
import { tileData } from "./tile-data";
import SearchResults from "./SearchResults.svelte";
import Catalog from "./Catalog.svelte";
import dontPanic from "./assets/dont_panic.png";
import InterpolatedTranslation from "./InterpolatedTranslation.svelte";
import { t } from "@transifex/native";
import type { SupportedTypeMapped, SupportedTypesWithMapped } from "./types";
import throttle from "lodash/throttle";
import debounce from "lodash/debounce";
import { onDestroy } from "svelte";
import {
  bundledBuildsFromManifest,
  deleteVersionData,
  downloadVersionData,
  loadOfflineManifest,
  loadRemoteBuilds,
  type BuildInfo,
  type OfflineManifest,
} from "./data-sources";
import {
  addDownloadedBuild,
  loadDownloadedBuilds,
  mergeSelectableBuilds,
  removeDownloadedBuild,
  saveDownloadedBuilds,
} from "./downloaded-builds";
import { localeFromUrl, setLocaleInUrl } from "./locale";
import {
  markWelcomeNoticeSeen,
  shouldShowWelcomeNotice,
} from "./welcome-notice";

let item: { type: string; id: string } | null = null;
let search: string = "";
let renderedSearch = search;
const updateRenderedSearch = debounce((value: string) => {
  renderedSearch = value;
}, 150);

function renderSearchNow() {
  updateRenderedSearch.cancel();
  renderedSearch = search;
}

$: if (search !== renderedSearch) {
  if (search) updateRenderedSearch(search);
  else renderSearchNow();
}

onDestroy(updateRenderedSearch.cancel);

let offlineManifest: OfflineManifest | null = null;
let builds: BuildInfo[] | null = null;
let remoteBuilds: BuildInfo[] | null = null;
let remoteBuildsLoading = false;
let remoteBuildsError: string | null = null;
let downloadPanelOpen = false;
let downloadMessage: string | null = null;
let downloadingVersion: string | null = null;
let deletingVersion: string | null = null;
let downloadedBuilds = loadDownloadedBuilds();
let downloadedVersions = new Set<string>(
  downloadedBuilds.map((build) => build.build_number),
);
let selectableBuilds: BuildInfo[] = [];
let displayBuilds: BuildInfo[] = [];
let activeBuildNumber: string | null = null;
let activeBuild: BuildInfo | null = null;
let welcomeNoticeOpen = shouldShowWelcomeNotice();

loadOfflineManifest()
  .then((manifest) => {
    offlineManifest = manifest;
    const bundledBuilds = bundledBuildsFromManifest(manifest);
    builds = bundledBuilds.length > 0 ? bundledBuilds : null;
  })
  .catch((e) => {
    console.error(e);
    builds = null;
  });

const url = new URL(location.href);
const version = url.searchParams.get("v") ?? "latest";
const locale = localeFromUrl(url);
data.setVersion(version, locale);

$: bundledDefaultBuildNumber = builds?.[0]?.build_number ?? null;
$: activeBuildNumber =
  $data?.build_number ??
  (version === "latest" ? bundledDefaultBuildNumber : version);
$: selectableBuilds = mergeSelectableBuilds(builds ?? [], downloadedBuilds);
$: activeBuild = activeBuildNumber
  ? (selectableBuilds.find(
      (build) => build.build_number === activeBuildNumber,
    ) ??
    remoteBuilds?.find((build) => build.build_number === activeBuildNumber) ?? {
      build_number: activeBuildNumber,
      prerelease: true,
      created_at: "",
      langs: ["zh_CN"],
    })
  : null;
$: displayBuilds =
  activeBuild &&
  !selectableBuilds.some(
    (build) => build.build_number === activeBuild?.build_number,
  )
    ? [...selectableBuilds, activeBuild]
    : selectableBuilds;

const tilesets = [
  {
    name: "AltiCa",
    url: "https://raw.githubusercontent.com/CleverRaven/Cataclysm-DDA/{version}/gfx/Altica",
  },
  {
    name: "BrownLikeBears",
    url: "https://raw.githubusercontent.com/CleverRaven/Cataclysm-DDA/{version}/gfx/BrownLikeBears",
  },
  {
    name: "Chibi_Ultica",
    url: "https://raw.githubusercontent.com/CleverRaven/Cataclysm-DDA/{version}/gfx/ChibiUltica",
  },
  {
    name: "Cuteclysm(Alpha)",
    url: "https://raw.githubusercontent.com/CleverRaven/Cataclysm-DDA/{version}/gfx/Cuteclysm",
  },
  {
    name: "Hollow Moon",
    url: "https://raw.githubusercontent.com/CleverRaven/Cataclysm-DDA/{version}/gfx/HollowMoon",
  },
  {
    name: "MSXotto+",
    url: "https://raw.githubusercontent.com/CleverRaven/Cataclysm-DDA/{version}/gfx/MshockXotto%2B",
  },
  {
    name: "NeoDays",
    url: "https://raw.githubusercontent.com/CleverRaven/Cataclysm-DDA/{version}/gfx/NeoDaysTileset",
  },
  {
    name: "RetroDays",
    url: "https://raw.githubusercontent.com/CleverRaven/Cataclysm-DDA/{version}/gfx/RetroDaysTileset",
  },
  {
    name: "UltiCa",
    url: "https://raw.githubusercontent.com/CleverRaven/Cataclysm-DDA/{version}/gfx/UltimateCataclysm",
  },
];

const normalizeTemplate = (t: string) => (t === "null" || !t ? "" : t);
function loadTileset(): string {
  try {
    const templ = localStorage.getItem("cdda-guide:tileset");
    if (!templ) return "";
    return normalizeTemplate(templ);
  } catch (e) {
    return "";
  }
}
function saveTileset(url: string) {
  try {
    if (!url) localStorage.removeItem("cdda-guide:tileset");
    else localStorage.setItem("cdda-guide:tileset", normalizeTemplate(url));
  } catch (e) {
    /* swallow security errors, which can happen when in incognito mode */
  }
}
let tilesetUrlTemplate = loadTileset();
$: saveTileset(tilesetUrlTemplate);
$: tilesetUrl = $data
  ? (tilesetUrlTemplate?.replace("{version}", $data.build_number!) ?? null)
  : null;
$: tileData.setURL(tilesetUrl);

function decodeQueryParam(p: string) {
  return decodeURIComponent(p.replace(/\+/g, " "));
}

function load() {
  const path = location.pathname.slice(import.meta.env.BASE_URL.length - 1);
  let m: RegExpExecArray | null;
  if ((m = /^\/([^\/]+)(?:\/(.+))?$/.exec(path))) {
    const [, type, id] = m;
    if (type === "search") {
      item = null;
      search = decodeQueryParam(id ?? "");
      renderSearchNow();
    } else {
      item = { type, id: id ? decodeURIComponent(id) : "" };
    }

    window.scrollTo(0, 0);
  } else {
    item = null;
    search = "";
    renderSearchNow();
  }
}

$: if (item && item.id && $data && $data.byIdMaybe(item.type as any, item.id)) {
  const it = $data.byId(item.type as any, item.id);
  document.title = `${singularName(
    it,
  )} - The Hitchhiker's Guide to the Cataclysm`;
} else if (item && !item.id && item.type) {
  document.title = `${item.type} - The Hitchhiker's Guide to the Cataclysm`;
} else {
  document.title = "The Hitchhiker's Guide to the Cataclysm";
}

load();

// Throttle replaceState to avoid browser warnings.
// |throttle| isn't defined when running tests for some reason.
const replaceState = throttle
  ? throttle(history.replaceState.bind(history), 100, {
      trailing: true,
    })
  : history.replaceState.bind(history);

const clearItem = () => {
  if (item)
    history.pushState(
      null,
      "",
      import.meta.env.BASE_URL +
        (search ? "search/" + encodeURIComponent(search) : "") +
        location.search,
    );
  else
    replaceState(
      null,
      "",
      import.meta.env.BASE_URL +
        (search ? "search/" + encodeURIComponent(search) : "") +
        location.search,
    );
  item = null;
};

function maybeNavigate(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const anchor = target?.closest("a") as HTMLAnchorElement | null;
  if (anchor && anchor.href) {
    const { origin, pathname } = new URL(anchor.href);
    if (
      origin === location.origin &&
      pathname.startsWith(import.meta.env.BASE_URL)
    ) {
      event.preventDefault();
      history.pushState(null, "", pathname + location.search);
      load();
    }
  }
}

window.addEventListener("popstate", () => {
  load();
});

let deferredPrompt: any;
window.addEventListener("beforeinstallprompt", (e) => {
  deferredPrompt = e;
});

function maybeFocusSearch(e: KeyboardEvent) {
  if (e.key === "/" && document.activeElement?.id !== "search") {
    document.getElementById("search")?.focus();
    e.preventDefault();
  }
}

function getLanguageName(code: string) {
  // from src/options.cpp
  return (
    {
      en: "English",
      ar: "العربية",
      cs: "Český Jazyk",
      da: "Dansk",
      de: "Deutsch",
      el: "Ελληνικά",
      es_AR: "Español (Argentina)",
      es_ES: "Español (España)",
      fr: "Français",
      hu: "Magyar",
      id: "Bahasa Indonesia",
      is: "Íslenska",
      it_IT: "Italiano",
      ja: "日本語",
      ko: "한국어",
      nb: "Norsk",
      nl: "Nederlands",
      pl: "Polski",
      pt_BR: "Português (Brasil)",
      ru: "Русский",
      sr: "Српски",
      tr: "Türkçe",
      uk_UA: "український",
      zh_CN: "中文 (天朝)",
      zh_TW: "中文 (台灣)",
    }[code] ??
    (Intl?.DisplayNames
      ? new Intl.DisplayNames([code.replace(/_/, "-")], {
          type: "language",
        }).of(code.replace(/_/, "-"))
      : code)
  );
}

const randomableItemTypes = new Set<keyof SupportedTypesWithMapped>([
  "item",
  "monster",
  "furniture",
  "terrain",
  "vehicle_part",
  "tool_quality",
  "mutation",
  "martial_art",
  "json_flag",
  "achievement",
  "conduct",
  "proficiency",
]);
async function getRandomPage() {
  const d = await new Promise<CddaData>((resolve) => {
    const unsubscribe = data.subscribe((v) => {
      if (v) {
        resolve(v);
        setTimeout(() => unsubscribe());
      }
    });
  });
  const items = d
    .all()
    .filter(
      (x) => "id" in x && randomableItemTypes.has(mapType(x.type)),
    ) as (SupportedTypeMapped & { id: string })[];
  return items[(Math.random() * items.length) | 0];
}

let randomPage: string | null = null;
function newRandomPage() {
  getRandomPage().then((r) => {
    randomPage = `${import.meta.env.BASE_URL}${mapType(r.type)}/${r.id}${
      location.search
    }`;
  });
}
newRandomPage();

// This is one character behind the actual search value, because
// of the throttle, but eh, it's good enough.
let currentHref = location.href;
$: (item, search, (currentHref = location.href));

function langHref(lang: string, href: string) {
  const u = new URL(href);
  setLocaleInUrl(u, lang);
  return u.toString();
}

function switchToBuild(buildNumber: string) {
  const url = new URL(location.href);
  if (buildNumber === builds?.[0]?.build_number) {
    url.searchParams.delete("v");
  } else {
    url.searchParams.set("v", buildNumber);
  }
  location.href = url.toString();
}

function currentLanguageLabel() {
  try {
    return getLanguageName(locale);
  } catch {
    return locale;
  }
}

async function showRemoteBuilds() {
  downloadPanelOpen = true;
  remoteBuildsLoading = true;
  remoteBuildsError = null;
  downloadMessage = null;
  try {
    remoteBuilds = await loadRemoteBuilds(fetch, offlineManifest);
  } catch (e) {
    remoteBuildsError =
      e instanceof Error ? e.message : t("Unable to load remote versions");
  } finally {
    remoteBuildsLoading = false;
  }
}

function syncDownloadedBuilds(nextDownloadedBuilds: BuildInfo[]) {
  downloadedBuilds = nextDownloadedBuilds;
  downloadedVersions = new Set(
    downloadedBuilds.map((build) => build.build_number),
  );
  saveDownloadedBuilds(downloadedBuilds);
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
  const build = remoteBuilds?.find(
    (build) => build.build_number === buildNumber,
  ) ?? {
    build_number: buildNumber,
    prerelease: true,
    created_at: "",
    langs: ["zh_CN"],
  };
  try {
    await downloadVersionData(buildNumber, offlineManifest);
    syncDownloadedBuilds(addDownloadedBuild(downloadedBuilds, build));
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

async function deleteDownloadedBuild(buildNumber: string) {
  if (
    !confirm(
      t("Delete downloaded offline data for {buildNumber}?", { buildNumber }),
    )
  ) {
    return;
  }
  deletingVersion = buildNumber;
  remoteBuildsError = null;
  downloadMessage = null;
  try {
    await deleteVersionData(buildNumber, offlineManifest);
    syncDownloadedBuilds(removeDownloadedBuild(downloadedBuilds, buildNumber));
    downloadMessage = t("{buildNumber} deleted.", { buildNumber });
    if (activeBuildNumber === buildNumber) {
      switchToBuild(builds?.[0]?.build_number ?? "latest");
    }
  } catch (e) {
    remoteBuildsError =
      e instanceof Error
        ? e.message
        : t("Unable to delete {buildNumber}", { buildNumber });
  } finally {
    deletingVersion = null;
  }
}

function dismissWelcomeNotice() {
  welcomeNoticeOpen = false;
  markWelcomeNoticeSeen();
}
</script>

<svelte:window on:click={maybeNavigate} on:keydown={maybeFocusSearch} />

<svelte:head>
  {#if activeBuild}
    {#each [...activeBuild.langs].sort((a, b) => a.localeCompare(b)) as lang}
      <link
        rel="alternate"
        hreflang={lang}
        href={langHref(lang, currentHref)} />
    {/each}
  {/if}
</svelte:head>

<header>
  <nav>
    <div class="title">
      <!-- svelte-ignore a11y-invalid-attribute -->
      <strong>
        <a
          href={import.meta.env.BASE_URL + location.search}
          on:click={() => (search = "")}
          ><span class="wide">Hitchhiker's Guide to the Cataclysm</span><span
            class="narrow">HHG</span
          ></a>
      </strong>
    </div>
    <div class="search">
      <input
        style="margin: 0; width: 100%"
        placeholder={t("Search...", {
          _comment: "Placeholder text in the search box",
        })}
        type="search"
        bind:value={search}
        on:input={clearItem}
        id="search" />
    </div>
  </nav>
</header>
<main>
  {#if welcomeNoticeOpen}
    <div class="download-backdrop">
      <div
        class="welcome-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-notice-title">
        <h2 id="welcome-notice-title">提示</h2>
        <p>
          cdda指南可以直接访问<a href="https://cdda.doiiars.com/?lang=zh_CN"
            >https://cdda.doiiars.com/?lang=zh_CN</a
          >，本来不想做离版的，群友催了一个月所以做了，有问题加群1021460103。
        </p>
        <button type="button" on:click={dismissWelcomeNotice}>知道了</button>
      </div>
    </div>
  {/if}

  {#if item}
    {#if $data}
      {#key item}
        {#if item.id}
          <Thing {item} data={$data} />
        {:else}
          <Catalog type={item.type} data={$data} />
        {/if}
      {/key}
    {:else}
      <span style="color: var(--cata-color-gray)">
        <em>{t("Loading...")}</em>
        {#if $loadProgress}
          ({($loadProgress[0] / 1024 / 1024).toFixed(1)}/{(
            $loadProgress[1] /
            1024 /
            1024
          ).toFixed(1)} MB)
        {/if}
      </span>
    {/if}
  {:else if search}
    {#if $data}
      {#key renderedSearch}
        <SearchResults data={$data} search={renderedSearch} />
      {/key}
    {:else}
      <span style="color: var(--cata-color-gray)">
        <em>{t("Loading...")}</em>
        {#if $loadProgress}
          ({($loadProgress[0] / 1024 / 1024).toFixed(1)}/{(
            $loadProgress[1] /
            1024 /
            1024
          ).toFixed(1)} MB)
        {/if}
      </span>
    {/if}
  {:else}
    <img
      src={dontPanic}
      height="200"
      width="343"
      style="float:right"
      alt="The words 'Don't Panic' in big friendly letters" />
    <p>
      <InterpolatedTranslation
        str={t(
          `The {hhg} is a guide to the zombie survival roguelike game {link_cdda}. You can
search for things in the game, like items (e.g. a {link_flashlight}), furniture
(e.g. a {link_table}), or monsters (e.g. a {link_zombie}), and find useful
information about them. The data in the Guide comes directly from the JSON
files in the game itself.`,
          {
            hhg: "{hhg}",
            link_cdda: "{link_cdda}",
            link_flashlight: "{link_flashlight}",
            link_table: "{link_table}",
            link_zombie: "{link_zombie}",
          },
        )}
        slot0="hhg"
        slot1="link_cdda"
        slot2="link_flashlight"
        slot3="link_table"
        slot4="link_zombie">
        <strong slot="0">Hitchhiker's Guide to the Cataclysm</strong>
        <a slot="1" href="https://cataclysmdda.org/"
          >Cataclysm: Dark Days Ahead</a>
        <a
          slot="2"
          href="{import.meta.env.BASE_URL}item/flashlight{location.search}"
          >{t("flashlight", { _comment: "Item name" })}</a>
        <a
          slot="3"
          href="{import.meta.env.BASE_URL}furniture/f_table{location.search}"
          >{t("table", { _comment: "Furniture" })}</a>
        <a
          slot="4"
          href="{import.meta.env.BASE_URL}monster/mon_zombie{location.search}"
          >{t("zombie", { _comment: "Monster name" })}</a>
      </InterpolatedTranslation>
    </p>
    <p>
      {t(`The Guide stores all its data locally and is offline-capable, so you can
take it with you wherever you go. There's nothing to do to make the Guide
work offline, just visit the page and it will work even without internet
access, as long as you've visited it once before.`)}
      {#if deferredPrompt}
        <InterpolatedTranslation
          str={t(
            `It's also {installable_button}, so you can pop it out of your browser and use it like a regular app.`,
            { installable_button: "{installable_button}" },
          )}
          slot0="installable_button">
          <button
            slot="0"
            class="disclosure"
            on:click={(e) => {
              e.preventDefault();
              deferredPrompt.prompt();
            }}
            >{t("installable", {
              _context: "Front page",
              _comment: "Meaning, install the Hitchhiker's Guide app itself.",
            })}</button>
        </InterpolatedTranslation>
      {/if}
    </p>
    <p style="font-style: italic; color: var(--cata-color-gray)">
      {t(
        `More popular than the Celestial Home Care Omnibus, better selling than
Fifty-three More Things to do in Zero Gravity, and more controversial than
Oolon Colluphid's trilogy of philosophical blockbusters Where God Went
Wrong, Some More of God's Greatest Mistakes and Who is this God Person
Anyway?`,
        {
          _comment:
            "This is a quote from the Hitchhiker's Guide to the Galaxy, by Douglas Adams",
        },
      )}
    </p>
    <p>
      <InterpolatedTranslation
        str={t(
          `The Guide is developed on {link_github} by {link_nornagon}. If you notice any problems, please {link_file_an_issue}!`,
          {
            link_github: "{link_github}",
            link_nornagon: "{link_nornagon}",
            link_file_an_issue: "{link_file_an_issue}",
          },
        )}
        slot0="link_github"
        slot1="link_nornagon"
        slot2="link_file_an_issue">
        <a slot="0" href="https://github.com/nornagon/cdda-guide">GitHub</a>
        <a slot="1" href="https://www.nornagon.net">nornagon</a>
        <a slot="2" href="https://github.com/nornagon/cdda-guide/issues"
          >{t("file an issue")}</a>
      </InterpolatedTranslation>
    </p>

    {#if locale !== "en"}
      <p style="font-weight: bold">
        <InterpolatedTranslation
          str={t(
            `You can help translate the Guide into your language on {link_transifex}.`,
            { link_transifex: "{link_transifex}" },
          )}
          slot0="link_transifex">
          <a
            slot="0"
            href="https://www.transifex.com/nornagon/the-hitchhikers-guide-to-the-cataclysm/"
            >Transifex</a>
        </InterpolatedTranslation>
      </p>
    {/if}

    <h2>{t("Catalogs")}</h2>
    <ul>
      <li><a href="/item{location.search}">{t("Items")}</a></li>
      <li><a href="/monster{location.search}">{t("Monsters")}</a></li>
      <li><a href="/furniture{location.search}">{t("Furniture")}</a></li>
      <li><a href="/terrain{location.search}">{t("Terrain")}</a></li>
      <li><a href="/vehicle_part{location.search}">{t("Vehicle Parts")}</a></li>
      <li><a href="/tool_quality{location.search}">{t("Qualities")}</a></li>
      <li><a href="/mutation{location.search}">{t("Mutations")}</a></li>
      <li><a href="/martial_art{location.search}">{t("Martial Arts")}</a></li>
      <li><a href="/json_flag{location.search}">{t("Flags")}</a></li>
      <li>
        <a href="/achievement{location.search}">{t("Achievements")}</a> /
        <a href="/conduct{location.search}">{t("Conducts")}</a>
      </li>
      <li><a href="/proficiency{location.search}">{t("Proficiencies")}</a></li>
    </ul>

    <InterpolatedTranslation
      str={t(`Or visit a {link_random_page}.`, {
        link_random_page: "{link_random_page}",
      })}
      slot0="link_random_page">
      <a slot="0" href={randomPage} on:click={() => setTimeout(newRandomPage)}
        >{t("random page")}</a>
    </InterpolatedTranslation>
  {/if}

  <p class="data-options">
    {t("Version:")}
    {#if $data || displayBuilds.length > 0}
      {#if displayBuilds.length > 0}
        <!-- svelte-ignore a11y-no-onchange -->
        <select
          value={activeBuildNumber ?? ""}
          on:change={(e) => {
            switchToBuild(e.currentTarget.value);
          }}>
          <optgroup label="Stable">
            {#each displayBuilds.filter((b) => !b.prerelease) as build}
              <option value={build.build_number}>{build.build_number}</option>
            {/each}
          </optgroup>
          <optgroup label="Experimental">
            {#each displayBuilds.filter((b) => b.prerelease) as build}
              <option value={build.build_number}
                >{build.build_number}{#if build.build_number === bundledDefaultBuildNumber}&nbsp;(latest){/if}</option>
            {/each}
          </optgroup>
        </select>
      {:else if $data}
        <select disabled>
          <option>{$data.build_number}</option>
        </select>
      {/if}
    {:else}
      <em style="color: var(--cata-color-gray)">({t("Loading...")})</em>
    {/if}
    <button
      type="button"
      on:click={showRemoteBuilds}
      disabled={remoteBuildsLoading}>
      {remoteBuildsLoading ? t("Loading...") : t("Download other version")}
    </button>
    <span style="white-space: nowrap">
      {t("Tileset:")}
      <!-- svelte-ignore a11y-no-onchange -->
      <select
        value={tilesetUrlTemplate}
        on:change={(e) => {
          tilesetUrlTemplate = e.currentTarget.value;
        }}>
        <option value="">None (ASCII)</option>
        {#each tilesets as { name, url }}
          <option value={url}>{name}</option>
        {/each}
      </select>
    </span>
    <span style="white-space: nowrap">
      {t("Language:")}
      {#if activeBuild}
        {@const langs = activeBuild.langs}
        {@const validLangs = langs.filter((lang) => {
          try {
            getLanguageName(lang);
            return true;
          } catch {
            return false;
          }
        })}
        <select
          value={locale}
          on:change={(e) => {
            const url = new URL(location.href);
            const lang = e.currentTarget.value;
            setLocaleInUrl(url, lang);
            location.href = url.toString();
          }}>
          <option value="en">English</option>
          {#each validLangs.sort((a, b) => a.localeCompare(b)) as lang}
            <option value={lang}>{getLanguageName(lang)}</option>
          {/each}
        </select>
      {:else if $data}
        <select disabled><option>{currentLanguageLabel()}</option></select>
      {:else}
        <select disabled><option>{t("Loading...")}</option></select>
      {/if}
    </span>
  </p>
  {#if remoteBuildsError}
    <p class="download-status">{remoteBuildsError}</p>
  {/if}
  {#if downloadMessage}
    <p class="download-status">{downloadMessage}</p>
  {/if}
  {#if downloadPanelOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div
      class="download-backdrop"
      on:click={(e) => {
        if (e.target === e.currentTarget) downloadPanelOpen = false;
      }}>
      <div
        class="download-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-panel-title">
        <header class="download-panel-header">
          <h2 id="download-panel-title">{t("Download other version")}</h2>
          <button
            type="button"
            class="close-button"
            aria-label={t("Close")}
            on:click={() => (downloadPanelOpen = false)}>×</button>
        </header>

        {#if remoteBuildsLoading}
          <p class="download-status">{t("Loading...")}</p>
        {/if}
        {#if remoteBuildsError}
          <p class="download-error">
            {t(
              "Network problem loading versions. Please check your connection and try again.",
            )}
          </p>
          <p class="download-status">{remoteBuildsError}</p>
          <button type="button" on:click={showRemoteBuilds}
            >{t("Retry")}</button>
        {/if}
        {#if downloadMessage}
          <p class="download-status">{downloadMessage}</p>
        {/if}
        {#if remoteBuilds}
          <ul class="remote-builds">
            {#each remoteBuilds as build}
              <li>
                <div>
                  <strong>{build.build_number}</strong>
                  {#if !build.prerelease}
                    <span>{t("stable")}</span>
                  {/if}
                </div>
                <div class="remote-build-actions">
                  {#if downloadedVersions.has(build.build_number)}
                    <button
                      type="button"
                      on:click={() => switchToBuild(build.build_number)}
                      >{t("Switch")}</button>
                    <button
                      type="button"
                      disabled={deletingVersion === build.build_number}
                      on:click={() =>
                        deleteDownloadedBuild(build.build_number)}>
                      {deletingVersion === build.build_number
                        ? t("Loading...")
                        : t("Delete")}
                    </button>
                  {:else}
                    <button
                      type="button"
                      disabled={downloadingVersion === build.build_number}
                      on:click={() => downloadBuild(build.build_number)}>
                      {downloadingVersion === build.build_number
                        ? t("Loading...")
                        : t("Download")}
                    </button>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  {/if}
</main>

<style>
main {
  text-align: left;
  padding: 1em;
  max-width: 980px;
  margin: 0 auto;
  margin-top: 4rem;
}
header {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 100;
  box-shadow: 0px 0px 8px rgba(0, 0, 0, 0.5);
  width: 100%;
  height: 4rem;
  background: rgba(33, 33, 33, 0.98);
  padding: 0 calc(1em + 8px);
  box-sizing: border-box;
}

nav {
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
}

nav > .search {
  flex: 1;
  max-width: calc(0.5 * 980px);
}

nav > .title .narrow {
  display: none;
}

nav > .title {
  margin-right: 1em;
}

@media (max-width: 600px) {
  nav > .title .wide {
    display: none;
  }
  nav > .title .narrow {
    display: inline;
  }

  nav > .search {
    flex: 1;
  }
}

.data-options select {
  max-width: 100%;
}

.download-status {
  margin: -0.5em 0 0.75em;
  color: var(--cata-color-gray);
  font-size: 0.9em;
}

.remote-builds {
  display: grid;
  gap: 0.35em;
  margin: 0;
  padding: 0;
  list-style: none;
}

.remote-builds li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75em;
  padding: 0.45em 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.remote-builds li:last-child {
  border-bottom: 0;
}

.remote-build-actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35em;
}

.download-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  align-items: end;
  background: rgba(0, 0, 0, 0.55);
  padding: 1em;
}

.download-panel {
  width: min(100%, 720px);
  max-height: min(76vh, 720px);
  margin: 0 auto;
  overflow: auto;
  padding: 1em;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  background: rgba(33, 33, 33, 0.98);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

.welcome-panel {
  width: min(100%, 520px);
  max-width: calc(100vw - 1em);
  margin: auto;
  padding: 1em;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  background: rgba(33, 33, 33, 0.98);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  overflow-wrap: anywhere;
}

.welcome-panel h2 {
  margin-top: 0;
  font-size: 1.15em;
}

.welcome-panel a {
  overflow-wrap: anywhere;
}

.download-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1em;
  margin-bottom: 0.75em;
}

.download-panel-header h2 {
  margin: 0;
  font-size: 1.15em;
}

.close-button {
  min-width: 2.25em;
}

.download-error {
  margin: 0 0 0.5em;
  color: var(--cata-color-red);
}

@media (max-width: 600px) {
  .download-backdrop {
    padding: 0.5em;
  }

  .download-panel {
    max-height: 82vh;
  }

  .remote-builds li {
    align-items: flex-start;
    flex-direction: column;
  }

  .remote-build-actions {
    justify-content: flex-start;
  }
}
</style>
