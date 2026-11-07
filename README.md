# ВсемЗапчасти ERP (VZ ERP)

> Текущая версия: **1.35.11**
> ERP-система платформы автозапчастей: поставщики, покупатели, лиды, задачи, поддержка, медиаразмещения, аналитика, план/факт, ЛК поставщика, публичные формы.

---

## Стек

| Слой | Технология |
|---|---|
| Фронт | React 18 + TypeScript + Vite 5 + Tailwind 3 + Recharts + PWA (vite-plugin-pwa), раздаётся nginx |
| API | NestJS 10 + Fastify 4 (`api/`) |
| База | PostgreSQL 15 (своя, в Coolify), RLS + доменная мультитенантность |
| Инфраструктура | Coolify — деплой из GitHub, PostgreSQL, SSL, бэкапы |
| Почта и уведомления | SMTP-воркер (`outbox_events`), Telegram / MAX |

## Архитектура

```
Браузер (CRM / ЛК / публичные формы)
   │   crm.example.ru  — фронт (nginx, статика)
   └─► api.example.ru  — API (NestJS+Fastify) ──► PostgreSQL (RLS)
                          • AuthGuard + JWT (клеймы sub/domain_id)
                          • withClaims(): SET request.jwt.claims + app.domain_id
                          • модули: auth, sync, suppliers, buyers, lk, domains, public, files, events, email
Почта: события → outbox_events → Email-воркер (poll 5 сек) → SMTP → sent/failed
Realtime: sync_events + pg_notify → SSE (/events)
```

Ключевые принципы:
- **RLS живёт в БД**, не в коде: `app_user` (RLS) / `app_admin` (BYPASSRLS, только серверные операции: ЛК по токену, публичные формы, воркеры);
- изоляция доменов: политики `domain_id = current_domain_id()` на suppliers/buyers (pgTAP-покрыты);
- API выставляет клеймы на каждый запрос — хелперы (`is_admin`, `is_active_employee`, `access_*`, `current_domain_id`) работают в SQL.

## Структура репозитория

```
api/            NestJS+Fastify API (Dockerfile — multi-stage; scripts/create-admin.js — первый админ)
src/            React-фронт (lib/api.ts — транспорт, lib/store.ts — стор, lib/remote.ts — синк)
migrations/     NNNN_*.sql — единственный путь изменения схемы (0001 baseline → 0012)
tests/          pgTAP: tests/rls_isolation.sql — изоляция доменов
docs/           архитектура, дизайн, PRD, домены (справочно)
Dockerfile      образ фронта (nginx + security-headers.inc)
.github/workflows/verify.yml   аудит (prod, high+) → typecheck → сборка фронта и API
```

## Локальная разработка

```bash
# Фронт
npm install && npm run dev                  # VITE_API_URL=http://localhost:3000 в .env

# API (нужен PostgreSQL 15 с ролями и миграциями, см. «Деплой», шаги 3–4)
cd api && cp .env.example .env              # DATABASE_URL, DATABASE_URL_ADMIN, JWT_SECRET
npm install && npm run build && npm start   # http://localhost:3000/healthz

# Проверка изоляции доменов (pgTAP)
pg_prove -U postgres tests/rls_isolation.sql
```

## Деплой в Coolify (с нуля)

Два домена: `crm.example.ru` (фронт) и `api.example.ru` (API). Фронт не проксирует API — адрес API вшивается в сборку.

1. **Сервер**: Coolify на отдельном сервере (2 CPU / 2 GB; прод — 4 CPU / 8 GB), панель — за VPN/туннелем.
2. **PostgreSQL 15** (Add Resource → PostgreSQL): база `erp`. Порт 5432 наружу не публиковать.
3. **Роли БД** (один раз, psql под суперпользователем Postgres из Coolify):
   ```sql
   CREATE ROLE app_user  LOGIN PASSWORD '…';             -- API, подчиняется RLS
   CREATE ROLE app_admin LOGIN BYPASSRLS PASSWORD '…';   -- служебная роль (ЛК, формы, воркеры); BYPASSRLS обязателен
   ```
4. **Миграции** (psql под владельцем БД, не под `app_admin`; `OWNER_URL` — строка подключения владельца; по порядку, остановка на первой ошибке):
   ```bash
   for f in migrations/0*.sql; do psql "$OWNER_URL" -v ON_ERROR_STOP=1 -f "$f" || break; done
   ```
   Существующая база с данными — применять только недостающие файлы (см. `MIGRATION.md`). Миграции идемпотентны.
5. **API** (Deploy from GitHub): build path `api/`, Dockerfile `api/Dockerfile`, домен `api.example.ru`, порт 3000, healthcheck `GET /healthz`.
   Env: `DATABASE_URL` (app_user), `DATABASE_URL_ADMIN` (app_admin), `JWT_SECRET` (≥ 32 символов, иначе API не стартует),
   `CORS_ORIGINS=https://crm.example.ru`, `TRUST_PROXY_HOPS=1`; для почты `SMTP_URL`, `EMAIL_FROM`; для ботов — токены (таблица ниже).
6. **Первый администратор**: Coolify → API → Terminal:
   ```bash
   ADMIN_PASSWORD='пароль-от-12-символов' node scripts/create-admin.js
   ```
   Создаёт `admin@vz.tech` (bcrypt-хеш в `profiles`). Войти в CRM, в Настройки → Пользователи завести личную учётную запись администратора.
7. **Фронт** (Deploy from GitHub): корень репозитория, `Dockerfile`, домен `crm.example.ru`.
   Environment Variables → **Build Variable** `VITE_API_URL=https://api.example.ru` (меняется только пересборкой).
8. **HTTPS**: для обоих доменов включить **Force HTTPS** (Coolify/Traefik терминирует SSL).
9. **Первый вход**: открыть CRM → войти → настройки по умолчанию создаются при первом входе администратора (формы, справочники).

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

**Фронт** (задаются при сборке): `VITE_API_URL` — адрес API (`https://api.example.ru`). Секретов во фронте нет.

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

## Документация проекта

| Файл | Назначение |
|---|---|
| `README.md` | этот файл: установка, деплой, эксплуатация |
| `MIGRATION.md` | журнал версий и обязательных действий при обновлении |
| `WORKFLOW.md` | регламент разработки и выкладки |
| `docs/` | `ARCHITECTURE`, `DESIGN`, `DOMAINS`, `PRD` — справочные, местами содержат устаревшие упоминания Supabase |
| `Techdebt/` | известные ограничения (realtime при нескольких инстансах API) |

## Чек-лист релиза

1. Миграции применены на проде → 2. `npm audit` (фронт и `api/`, prod, high+) → 3. `npm run typecheck` → 4. `npm run build` (фронт и API) → 5. pgTAP зелёный → 6. смоук → 7. тег версии + запись в `MIGRATION.md`.

**Смоук после выкладки:** `GET https://api.example.ru/healthz` → ok · вход админом · тестовая заявка с каждой формы появляется в CRM без F5 · ЛК нового поставщика открывается по ссылке и PIN · F5 в ЛК не показывает «Сохранено» · срок задачи не меняется после F5 · загрузка картинки в ЛК.

**Безопасность перед продом:** `JWT_SECRET` и `CORS_ORIGINS` заданы · Force HTTPS включён · `app_admin` создан с `BYPASSRLS` · RLS проверен: `SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';` (в миграциях `ENABLE ROW LEVEL SECURITY` есть только у служебных таблиц событий и outbox, у бизнес-таблиц — сверить с боевой БД) · пароль по умолчанию администратора сменён скриптом `create-admin.js`.
