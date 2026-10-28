import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: process.env.VITE_DEV_HOST || "127.0.0.1",
    port: 8080,
  },
  plugins: [
    react(),
    VitePWA({
      // autoUpdate: свежий деплой сразу подменяет SW-кэш при первом заходе
      // после релиза — безопасно, т.к. источник истины данных — Supabase,
      // а не локальный кэш. Обновление под пользователем mid-session не
      // страшно: store перечитывается с сервера при логине/realtime.
      registerType: "autoUpdate",
      // We call registerSW() ourselves from src/lib/registerSW.ts (via the
      // virtual:pwa-register module) so we can hook onNeedRefresh into our
      // own toast — injectRegister: false stops the plugin from ALSO
      // auto-injecting its own <script> that would register a second time.
      injectRegister: false,
      // Only active in production builds — a service worker caching
      // Vite's dev-server bundles would cause confusing stale-code issues
      // during `npm run dev`.
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "icons/apple-touch-icon.png"],
      manifest: {
        // v1.31.16: публичные названия CRM → ERP
        name: "ВсемЗапчасти ERP",
        short_name: "ВЗ ERP",
        description: "ERP-система управления платформой: поставщики, покупатели, задачи, обращения и медиаразмещения",
        id: "/",
        start_url: "/dashboard",
        scope: "/",
        display: "fullscreen",
        // Browsers try each mode left-to-right, falling back if a mode
        // isn't supported — "fullscreen" hides the OS status bar entirely
        // on Android; "standalone" (still no browser UI, just the status
        // bar visible) is what everything else lands on. Android is where
        // this matters — see index.html for iOS, which doesn't take this
        // manifest field into account for home-screen apps at all.
        display_override: ["fullscreen", "standalone"],
        orientation: "portrait-primary",
        background_color: "#F5F5F5",
        theme_color: "#CC0000",
        lang: "ru",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        // Precache the hashed build output (JS/CSS/fonts/icons) — Workbox
        // knows the real filenames at build time, unlike a hand-written
        // service worker, so this is exact instead of best-effort.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        // SPA fallback: any uncached same-origin navigation (a deep link
        // opened while offline) still resolves to the cached app shell, so
        // React Router can take over client-side instead of hitting a dead
        // end. Cross-origin requests (Supabase) are never same-origin
        // navigations, so this never applies to them.
        navigateFallback: "/index.html",
        // Nothing further needed to keep Supabase out of this: navigateFallback
        // only ever applies to actual browser navigations (address bar loads,
        // link clicks) — it never intercepts fetch() calls to Supabase's
        // separate origin, so CRM data always stays live.
        runtimeCaching: [
          {
            urlPattern: ({ sameOrigin, request }) => sameOrigin && request.destination === "image",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "vz-crm-images" },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
