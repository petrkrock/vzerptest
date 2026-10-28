# ARCHITECTURE — ВСЕМЗАПЧАСТИ CRM (vzcrm)

> Техническая архитектура «как есть». Деплой-инструкции — в `README.md`,
> регламент изменений — в `WORKFLOW.md`, матрица «код ↔ БД» (устарела, v1.18.34) —
> в `DB_CODE_DOC_MATRIX.md` до отдельной актуализации.

## 1. Общая схема

```
┌─────────────┐   HTTPS    ┌────────────────────── Supabase Cloud ──────────────────────┐
│  Браузер    │ ─────────► │ PostgreSQL 15 (RLS) · Auth (GoTrue, JWT) · Storage        │
│ React SPA   │  anon key  │ Edge Functions (Deno): public-form, create-manager,        │
│ (PWA, кэш)  │            │ update-manager, supplier-service, checko                   │
└─────────────┘            └─────────────────────────────────────────────────────────────┘
       ▲ same-origin (вариант Б)
┌──────┴──────┐  service_role key живёт ТОЛЬКО здесь (.env сервера, в браузер не попадает)
│ Nginx → PM2 │
│ monitor-    │  Раздаёт dist/ (SPA-fallback) и /api/* мониторинга (проверка JWT + admin)
│ server.js   │
└─────────────┘
```

Два варианта развёртывания: **А) Vercel + Supabase** (рекомендуется), **Б) свой сервер**
Nginx + PM2 (Node ≥ 18.18). Бэкенд в обоих случаях — облачный Supabase.

## 2. Фронтенд

- React 18 + TypeScript, Vite 5, Tailwind CSS 3, Recharts, lucide-react, sonner (toast).
- PWA: `vite-plugin-pwa` — service worker, офлайн-оболочка, автообновление.
- **Роутинг** (`src/App.tsx`): lazy-загрузка страниц; каждый раздел обёрнут в
  `RequireAccess section="..."` (проверка прав из сессии), `/settings`, `/database`,
  `/server` — только админ.
- **Состояние** (`src/lib/store.ts`): собственный версионированный store.
  Рабочее состояние — в памяти + localStorage; синхронизация с Supabase через
  `src/lib/supabase.ts` (push/pull diff).
- **Fail-safe загрузки** (уроки 1.6.x–1.7.x): pull выполняется ПЕРВЫМ; при ошибке
  localStorage не трогается; catch миграций возвращает сырые данные и логирует
  причину — база не стирается при F5. Миграции настроек — ВСЕГДА вне гейтов
  (run-once), чтобы существующие базы получали изменения.
- **Realtime** (`src/lib/realtime.ts`): подписка на 6 таблиц — suppliers, buyers,
  tasks, tickets, media_records, app_settings; изменения из других сессий
  подтягиваются автоматически.
- **Навигация** (`src/components/layout/navConfig.ts`): единый источник пунктов
  меню — Sidebar (десктоп) и BottomNav (мобильный) рендерятся из него.

## 3. База данных (Supabase / PostgreSQL)

### Таблицы (9)

| Таблица | Назначение |
|---|---|
| `suppliers` | Поставщики (все рабочие поля карточки, snake_case) |
| `buyers` | Покупатели |
| `tasks` | Задачи (history, resolved_at, deleted_at, priority) |
| `tickets` | Обращения поддержки (task_id FK → tasks) |
| `media_records` | Медиа-размещения |
| `app_settings` | JSONB-хранилище: справочники, пользователи, лиды, план/факт, ЛК, база знаний |
| `profiles` | Профили auth-пользователей (role: admin/manager) |
| `user_access` | Серверная копия ограничений менеджера (синхронизируется триггером) |
| `app_logs` | Журнал действий (DELETE/EXPORT/VIEW) |

Storage-бакет `knowledge` (public) — файлы базы знаний.

### Функции и триггеры

- `is_admin()`, `is_active_employee()`, `has_section_permission(section)` —
  проверки JWT-роли для RLS-политик.
- `access_supplier_types/cities`, `access_buyer_types/cities`, `access_ticket_types` —
  фильтры видимости менеджера.
- `handle_new_auth_user` — авто-создание profiles при регистрации.
- `guard_app_settings_update` + `app_settings_not_null_guard` — защита JSONB-настроек
  от обнуления.
- `sync_user_access` — синхронизация прав менеджера в `user_access`.
- `update_updated_at` — актуализация updated_at.

### Модель безопасности

- Доступ к данным — PostgREST с anon key; все таблицы закрыты **RLS** (политики
  проверяют JWT и роль).
- Административные операции (создание/бан менеджеров) — Edge Functions с проверкой
  роли admin внутри функции.
- Service-role — только у серверного `monitor-server.js`.
- Публичная форма — отдельная Edge Function: rate limit + honeypot + CORS-allowlist.

## 4. Edge Functions (Deno)

| Функция | Назначение |
|---|---|
| `public-form` | Приём заявок с публичных форм, уведомления Telegram/MAX/email |
| `create-manager` | Создание учётной записи менеджера (admin-only) |
| `update-manager` | Обновление/блокировка менеджера (admin-only) |
| `supplier-service` | API самообслуживания поставщика (ЛК /s/<token>) |
| `checko` | Скоринг по ИНН через Checko API |

Секреты — только в Supabase Secrets (`TELEGRAM_BOT_TOKEN`, `RESEND_API_KEY`,
`APP_ORIGINS` и т.д.).

## 5. Соглашения кода ↔ БД

- Клиентская модель — **camelCase**, БД — **snake_case**; мапперы в
  `src/lib/supabase.ts` (`mapSupplier`, `toSupplierRow` и т.д.).
- **Правило: править ОБЕ стороны маппера** при добавлении поля + тип в
  `src/types/index.ts` + `ALTER TABLE ... IF NOT EXISTS` для боевой базы.
- Удаление данных — маппер пишет `null`, иначе удаление «восстанавливается» из базы.
- Все типы сущностей — `src/types/index.ts`; справочные константы и дефолты —
  `src/constants/index.ts` (системные статусы нельзя удалять).

## 6. Прод-сервер (`server/monitor-server.js`)

Node без фреймворков: раздача `dist/` (SPA-fallback) + защищённое API серверных
метрик для раздела «Сервер» (проверка JWT + роль admin). Запуск — PM2, фронт —
Nginx reverse proxy.

## 7. Порядок выкладки на продакшн (строго)

1. SQL на боевую базу (ALTER, политики, бакеты).
2. Деплой edge functions: `supabase functions deploy <name> --no-verify-jwt`.
3. Сборка фронта: `npm ci && npm run build` → выкладка статики.
4. Перезапуск `monitor-server` (pm2/systemd), если менялся.

Откат: фронт — предыдущий версионный zip; функции — предыдущий релиз; база —
только через бэкап Supabase.
