import { APP_VERSION } from '@/constants';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';

// Публичные роуты (/forms/*, /s/*) получают отдельное лёгкое приложение:
// форма, встроенная на чужой сайт, не должна тянуть бандл всей CRM
// (store/auth/supabase-js) и не регистрирует service worker. Решение
// принимается по pathname ДО динамического импорта — тяжёлый чанк
// просто не запрашивается.
const isPublicRoute =
  window.location.pathname.startsWith('/forms/') ||
  window.location.pathname.startsWith('/s/');

async function bootstrap() {
  const rootEl = document.getElementById('root')!;
  if (isPublicRoute) {
    const { default: PublicApp } = await import('./PublicApp');
    console.log(`%cVZ ERP build v${APP_VERSION}`, 'color:#e60023;font-weight:bold');
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <BrowserRouter>
          <PublicApp />
        </BrowserRouter>
      </React.StrictMode>,
    );
    return;
  }
  // Ловим необработанные ошибки и rejected-промисы → пишем в app_logs,
  // чтобы админ мог понять, что сломалось (видно только ему, RLS).
  const { logToServer } = await import('./lib/log');
  window.addEventListener('error', e => void logToServer('error', e.message, e.error?.stack));
  window.addEventListener('unhandledrejection', e =>
    void logToServer('error', e.reason?.message ?? String(e.reason), e.reason?.stack));

  const [{ default: App }, { registerServiceWorker }] = await Promise.all([
    import('./App'),
    import('./lib/registerSW'),
  ]);
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
  registerServiceWorker();
}

void bootstrap();
