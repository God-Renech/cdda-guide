import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { VitePWA } from "vite-plugin-pwa";
import EnvironmentPlugin from "vite-plugin-environment";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/",
  build: {
    sourcemap: true,
  },
  server: {
    port: 3000,
  },
  plugins: [
    EnvironmentPlugin({
      GITHUB_SHA: null,
      SENTRY_DSN: null,
    }),
    svelte(),
    svelteTesting(),
    VitePWA({
      devOptions: {
        enabled: true,
      },
      includeAssets: ["favicon.png"],
      manifest: {
        short_name: "CDDA物品浏览器离线版",
        name: "CDDA物品浏览器离线版by_ab_irdiden",
        icons: [
          {
            src: "icon-192.png",
            type: "image/png",
            sizes: "192x192",
          },
          {
            src: "icon-512.png",
            type: "image/png",
            sizes: "512x512",
          },
        ],
        start_url: "./",
        theme_color: "#202020",
        background_color: "#1c1c1c",
        display: "standalone",
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,json}"],
        // Bundled CDDA JSON data can include large all.json files.
        maximumFileSizeToCacheInBytes: 256 * 1024 * 1024,
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            // Bundled offline data is immutable for a deployed app version.
            urlPattern: ({ sameOrigin, url }) =>
              sameOrigin &&
              url.pathname.startsWith("/offline-data/") &&
              url.pathname.endsWith(".json"),
            handler: "CacheFirst",
          },
          {
            // latest data updates regularly, so try the network first.
            urlPattern:
              /^https:\/\/raw\.githubusercontent\.com\/.*\/latest\/(?:all|lang\/[^/]+)\.json$/,
            handler: "NetworkFirst",
          },
          {
            // the other data files are the same forever, so if we have
            // them from the cache they are fine.
            urlPattern:
              /^https:\/\/raw\.githubusercontent\.com\/.*\/data\/(?!latest\/).*\/(?:all|lang\/[^/]+)\.json$/,
            handler: "CacheFirst",
          },
          {
            // Use saved translations if possible, update in the background.
            urlPattern: /^https:\/\/cds.svc.transifex.net\//,
            handler: "StaleWhileRevalidate",
          },
        ],
        // Without this, a stale service worker can be alive for a long time,
        // and get out of date with the server.
        skipWaiting: true,
      },
    }),
  ],
});
