/**
 * Registers the PWA service worker via vite-plugin-pwa's virtual module.
 * The `virtual:pwa-register` import only resolves once the plugin has run
 * (i.e. after `npm install` + a real Vite build/dev run) — see
 * README.md if this import shows as unresolved before then.
 *
 * registerType is "prompt" in vite.config.ts (not "autoUpdate"), so a new
 * deploy never silently swaps the app under a user's feet mid-session —
 * onNeedRefresh below shows a toast and only updates when clicked.
 *
 * devOptions.enabled is false in vite.config.ts, so in `npm run dev` this
 * registers nothing — no service worker caching of dev-server bundles, no
 * confusing stale-code issues while developing.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onNeedRefresh() {
          // Lazy import so this (rarely-hit) path doesn't cost anything on first load.
          import('sonner').then(({ toast }) => {
            toast('Доступна новая версия приложения', {
              duration: Infinity,
              action: {
                label: 'Обновить',
                onClick: () => window.location.reload(),
              },
            });
          });
        },
        onOfflineReady() {
          console.info('[pwa] app is ready to work offline');
        },
        onRegisterError(err: unknown) {
          console.warn('[pwa] service worker registration failed:', err);
        },
      });
    })
    .catch(err => {
      // Expected in local dev before the plugin has generated anything, or
      // if the project hasn't been built with vite-plugin-pwa yet.
      console.warn('[pwa] virtual:pwa-register unavailable:', err);
    });
}
