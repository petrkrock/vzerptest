# ВсемЗапчасти ERP (VZ ERP)

> Текущая версия: **1.34.1**
> ERP-система платформы автозапчастей: поставщики, покупатели, лиды, задачи, поддержка, медиаразмещения, аналитика, план/факт, ЛК поставщика, публичные формы. B2B, кросс-док модель.

---

## Стек

| Слой | Технология |
|---|---|
| Фронт | React 18 + TypeScript + Vite 5 + Tailwind 3 + Recharts + PWA (vite-plugin-pwa) |
| API | **NestJS 10 + Fastify 4** (`api/`) — заменяет PostgREST + Edge Functions + Supabase Auth |
| База | **PostgreSQL 15** (своя, в Coolify). RLS + доменная мультитенантность |
| Инфраструктура | **Coolify** — деплой из GitHub, PostgreSQL, SSL, бэкапы |
| SQL-клиент | **DBeaver** через SSH-туннель (порт 5432 наружу не открыт) |
| Почта | SMTP-транспорт через воркер (`outbox_events`), Telegram/MAX-уведомления |

**Режим: только свой стек (с v1.34.0 Supabase вырезан полностью).** Транспорт фронта — `src/lib/api.ts` → тот же origin (прокси `/api` → сервис API в Coolify).

## Архитектура

```
Браузер (CRM / ЛК / публичные формы)
   │
   ├── own-режим:  Nginx (Coolify) ──► API (NestJS+Fastify) ──► PostgreSQL (RLS)
   │                                   • AuthGuard + JWT (клеймы sub/domain_id)
   │                                   • withClaims(): SET request.jwt.claims + app.domain_id
   │                                   • модули: auth, sync, suppliers, buyers, lk, domains, public, email
   │
   
Почта: события → outbox_events → Email-воркер (poll 5 сек) → SMTP → sent/failed
```

Ключевые принципы:
- **RLS живёт в БД**, не в коде: `app_user` (RLS) / `app_admin` (BYPASSRLS, только серверные миграции/ЛК);
- изоляция доменов (арендаторов ЛК): политики `domain_id = current_domain_id()` на suppliers/buyers (USING + WITH CHECK, pgTAP-покрыты);
- API выставляет клеймы на каждый запрос — все хелперы (`is_admin`, `is_active_employee`, `access_*`, `current_domain_id`) работают без переписывания.

## Структура репозитория

```
api/            NestJS+Fastify API (Dockerfile — multi-stage)
src/            React-фронт
  lib/remote.ts   транспортный диспетчер синка (Supabase | own по флагу)
  lib/api.ts      apiClient (auth, sync, ЛК, домены)
migrations/     NNNN_*.sql — единственный путь изменения схемы
  0001_baseline.sql      чистые установки (снапшот схемы)
  0002..0005+            существующие базы применяют последовательно
tests/          pgTAP: tests/rls_isolation.sql — изоляция доменов
supabase/       legacy (schema.sql — эталон схемы; functions/ — до выключения Supabase-режима)
.github/workflows/verify.yml   аудит (prod, high+) → typecheck → сборка
```

## Локальная разработка

```bash
# Фронт (режим supabase — .env с VITE_SUPABASE_*)
npm install && npm run dev

# API (нужен свой PostgreSQL 15: миграции 0001–0005 → БД «erp»)
cd api && cp .env.example .env   # DATABASE_URL, DATABASE_URL_ADMIN, JWT_SECRET
npm install && npm run build && npm start   # http://localhost:3000/healthz

# Проверка изоляции доменов (pgTAP)
pg_prove -U postgres tests/rls_isolation.sql   # ожидается 7/7
```

## Деплой в Coolify (с нуля)

1. **Серверы**: панель Coolify — отдельный чистый сервер (2 CPU / 2 GB); прод — 4 CPU / 8 GB. Панель — за VPN/туннелем, не в открытом интернете.
2. **PostgreSQL 15** (Coolify → Add Resource → PostgreSQL): база `erp`, пользователь + пароль в env. Порт 5432 не публиковать.
3. **Роли БД** (один раз, psql под владельцем):
   ```sql
   CREATE ROLE app_user LOGIN PASSWORD '…';   -- API, с RLS
   CREATE ROLE app_admin LOGIN PASSWORD '…';  -- служебный доступ (BYPASSRLS)
   ```
   `pg_hba.conf`: только локальные подключения + SSH-туннель; `listen_addresses = 'localhost'`.
4. **Миграции** (через SSH/psql или временный контейнер под app_admin):
   новая база → `migrations/0001_baseline.sql`, затем все `0002…0012` по порядку;
   переезд с Supabase → дамп данных (`pg_dump --data-only` без системных схем) + `0002…0012` поверх копии схемы;
   обновление существующей прод-базы → применить только новые файлы (последние: `0009`–`0010` событийная синхронизация, `0011` — исправление `domain_id` у заявок с форм, `0012` — даты создания условий проценки). Миграции идемпотентны.
5. **Приложение API** (Coolify → Deploy from GitHub): build path `api/`, Dockerfile `api/Dockerfile`. Env: `DATABASE_URL` (app_user), `DATABASE_URL_ADMIN` (app_admin), `JWT_SECRET` (**≥ 32 символов, иначе API не стартует**), `CORS_ORIGINS`, `TRUST_PROXY_HOPS=1`, `SMTP_URL`, `PORT=3000`. Healthcheck: `GET /healthz`. После деплоя: в Coolify включить **Force HTTPS** для обоих доменов.
6. **Фронт**: build `npm run build` → статика; если API на отдельном домене — задать `VITE_API_URL` и `CORS_ORIGINS` (домен(ы) CRM через запятую). Образ фронта (`Dockerfile`) копирует `nginx.conf` и `security-headers.inc` (CSP, HSTS и др.) — менять заголовки только там.
7. **Фронт env**: `VITE_API_MODE=own`. GitHub → автодеплой при пуше.

## Переменные окружения

**API** (`api/.env.example`):
| Переменная | Назначение |
|---|---|
| `PORT` | порт (3000) |
| `DATABASE_URL` | postgres://app_user:…@postgres:5432/erp — RLS-роль |
| `DATABASE_URL_ADMIN` | postgres://app_admin:… — служебная (ЛК по токену, воркеры) |
| `JWT_SECRET` | подпись JWT (только сервер), **обязательно ≥ 32 символов** (`openssl rand -hex 32`); с пустым/`change-me` API не запускается |
| `CORS_ORIGINS` | домены CRM через запятую; пусто = любой origin (**только для разработки**) |
| `TRUST_PROXY_HOPS` | сколько прокси перед API (Coolify/Traefik = 1; 0 — нет). От этого зависит IP для лимитов логина/форм/загрузок |
| `RATE_LIMIT_PER_MIN` | общий лимит запросов с одного IP в минуту (по умолчанию 600) |
| `SMTP_URL` / `EMAIL_FROM` | почтовый воркер (пусто — воркер off; письма копятся в `outbox_events`). Отправитель — только `EMAIL_FROM` |
| `OFFER_ACCEPT_NOTIFY_TO` | email о принятии оферты ЛК (пусто — не слать) |
| `TELEGRAM_BOT_TOKEN`, `MAX_BOT_TOKEN`, `MAX_API_BASE` | уведомления форм (токены ботов — только в env; `MAX_API_BASE` по умолчанию platform-api2.max.ru). Каналы и получатели — в Настройки → Уведомления / Пользователи |

**Фронт** (`.env`): `VITE_API_MODE` (`supabase`|`own`), `VITE_API_URL` (пусто = same-origin), `VITE_SUPABASE_URL/ANON_KEY` — только для supabase-режима.

## Миграции и тесты

- Схема меняется **только** через `migrations/NNNN_*.sql` (аддитивно, идемпотентно). «Руками в SQL Editor» — нет.
- Каждая правка политик — с обновлением `tests/rls_isolation.sql` и зелёным прогоном pgTAP (7 проверок: без клейма → 0 строк; изоляция доменов SELECT/UPDATE; insert чужого домена отклонён; инвариант дефолт-домена).

## Бэкапы и восстановление

- Coolify: расписание бэкапов PostgreSQL → внешний volume/объектное хранилище.
- **Восстановление прогоняется**, а не «настраивается»: раз в квартал поднимаем копию из бэкапа по этой инструкции.
- RPO: 24 часа (ежесуточный дамп). RTO: 1 час (restore дампа + переключение Coolify).
- Порядок восстановления: 1) новый Postgres в Coolify; 2) `psql -f` последнего дампа; 3) недостающие миграции `000N+`; 4) env API → новый хост; 5) healthz → проверка входа и ЛК; 6) переключение домена.

## Наблюдаемость и эксплуатация

- `GET /healthz` — для healthcheck Coolify (дешёвый, без БД).
- Логи: JSON-старт приложения, ошибки воркеров через `Logger` → stdout Coolify.
- Алерты: healthcheck Coolify (Telegram-бот панели); порог пула соединений — пул ≤ 20 на сервис, **PgBouncer не требуется** (зафиксировано; пересмотр при росте пула).
- Решение по SSL: внутри сети Coolify — по необходимости; наружу — SSL терминирует Coolify/Traefik.

## Модель данных (кратко)

Таблицы: `suppliers`, `buyers`, `tasks`, `tickets`, `media_records`, `app_settings` (jsonb-хранилище), `profiles`, `user_access`, `app_logs`, `id_registry`, `commerce.domains` (+ view `public.domains`), `integration_facts`, `outbox_events`, `email_queue`-события в outbox. Всё с RLS; см. `migrations/0001_baseline.sql`.

## Документация проекта (актуальность)

| Файл | Статус |
|---|---|
| `README.md` (этот) | ✅ актуален |
| `READMEstart.md` | ✅ запуск с нуля по шагам (новичок) |
| `READMEgo.md` | ✅ выкатка обновлений, откаты, smoke-тесты |
| `MIGRATION.md` | ✅ единый журнал версий v1.31.11 → настоящее |
| `docs/DOMAINS.md` | ⚠️ план фаз 1–3 частично устарел: фаза 1 (схема, RLS, view) выполнена, публичного доступа по host своих доменов ещё нет — план остаётся ориентиром |
| `docs/DB_CODE_DOC_MATRIX.md` | ⚠️ генерировался под CRM-структуру, сверяется вручную; источник истины — `migrations/` + `tests/` |
| `docs/release_*.sql` | ⚠️ исторические релизы до введения `migrations/`; для новых установок не нужны |
| `supabase/` | ⚠️ legacy: `schema.sql` — эталон схемы (синхронизирован с 0001), `functions/` — до выключения supabase-режима |
| `monitor-server.js` | ⚠️ статика+healthz для старого хостинга; в Coolify не нужен (healthz даёт API) |

**Истребление неактуального** (после подтверждения own-режима боевыми тестами, отдельной
версией): удалить `supabase/` целиком, `docs/release_*.sql`, `monitor-server.js`; `schema.sql`
как эталон заменить ссылкой на `migrations/0001_baseline.sql`; WORKFLOW.md — сверить и сократить.

## Что вырезано при переезде

Supabase Auth (→ свой JWT на profiles+bcrypt, миграция 0005), PostgREST (→ модули API), Edge Functions supplier-service/public-form (→ `lk/`, `public/`), прямой Resend (→ SMTP-воркер). Папка `supabase/` удаляется после подтверждения own-режима боевыми тестами.

## Чек-лист релиза

1. `migrations/NNNN` применены (prod; проверить `0011`) → 2. `npm audit` (фронт **и** `api/`, prod, high+) → 3. `npm run typecheck` → 4. `npm run build` (фронт + API) → 5. pgTAP зелёный → 6. smoke: вход / ЛК по токену / форма лида / письмо из ЛК → 7. тег версии + запись в MIGRATION.md.

**Безопасность перед продом:** `JWT_SECRET` и `CORS_ORIGINS` заданы; Force HTTPS включён; RLS проверен на проде — `SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';` (в репозитории `ENABLE ROW LEVEL SECURITY` есть только у служебных таблиц событий и outbox, у бизнес-таблиц — сверить с боевой БД); порядок гонять смоук: заявка с каждой формы появляется в CRM без F5, ЛК нового поставщика открывается.
