## v1.35.3 — Финал боевой стабилизации (данные, ЛК, оферта, typecheck)

**Данные (симптом «сливает после F5»):** портирована вся цепочка фиксов боевой сессии —
сигнатуры `update*(next)` (было `(id, next)` → payload без id/полей), UPSERT
(`ON CONFLICT DO UPDATE`), UUID-фильтр (`*_by`/`responsible_id` не-UUID → NULL + имя в
`created_by_name`), snakize ДО SAFE_COL, dotenv, service_access-токены, findByToken по
`service_access->>'token'`, readPin приоритет `service_access.pin` + trim + fallback-колонка,
pinOk string|number, склады: dual-ключи (`warehouses`/`warehouseLocations`), dual
`multiWarehouse`/`multiwarehouse`, валидация города склада по справочнику убрана.
Колонка `pin TEXT` — в 0007.

**Оферта:** мост двух моделей — `resolveOffer()` (включённый договор из `offerContracts` →
маппинг edition/lkTitle/lkGreeting/lkOffer; легаси `supplier_offer[0]` — fallback);
`acceptedEdition` пишется в тот же источник. Гейт `ensurePricingAccepted` перед принятием
снят (был замкнутым кругом), флаг фиксируется при принятии.

**API-вход:** по `profiles` (email+bcrypt), статус из settings.users опционально.
**CORS/транспорт:** Content-Type только с телом (Fastify «Body cannot be empty»).
**Синк:** savepoint-изоляция + ошибки в ответе + журнал app_logs.
**ЛК:** `cabinetTitle` = домен.title || оферта.lkTitle (единый источник заголовка).
**Формы:** core-поля всегда видимы + label из дефиниции.

**Фронт (typecheck 84 → 0):** хуки SupplierCardPage подняты выше guard (рантайм-крэш),
`freshSupplier` NonNullable-алиас, типы: StatusColor/MediaContract/Ticket.createdBy/
exportKind/'Удаление'-статус, TERMINAL-arrays `string[]`, whForm.address, касты через unknown,
PricingPage/PlanFact/Analytics/Tasks/Support/Settings/Suppliers/Buyer/Database/Leads/
Media/TicketCard правки. ID-блок: видим системный токен ЛК, внутренний UUID — в title.
**FBS:** 0008_cleanup_fbs.sql (идемпотентный) + исключён из дефолтов.
**PWA:** маркер `VZ ERP build vX.Y.Z` в консоли main.tsx — проверка доставки бандла.

**Деплой:** 0007 + 0008 на базу → пересборка обоих пакетов → проверка маркера версии в
консоли (если не v1.35.3 — сброс Service Worker: F12 → Application → Service Workers →
Unregister → Clear site data → Ctrl+F5).

---
## v1.35.2 — Фиксы боевого прогона (вход, синк, ЛК, формы, FBS)

1. **«Body cannot be empty when content-type is application/json» + 401 на /sync/snapshot:**
   `apiRequest` ставил Content-Type на ВСЕ запросы, включая GET без тела — Fastify падал.
   Теперь Content-Type только с телом. Это же лечило молча падавший пуш (симптом
   «данные удаляются при новом заходе» — они просто не доезжали до сервера).
2. **Вход только через запись в settings.users** (иначе 401 ещё до проверки пароля):
   `auth.service` теперь аутентифицирует по `profiles` (email + bcrypt, сервисное чтение
   — токена ещё нет, RLS profiles не пускает). Статус сотрудника из settings.users —
   опционально: запись есть и статус не active → отказ; записи нет → вход разрешён,
   права настраиваются в Настройки → Пользователи. Двойной учёт больше не обязателен.
3. **FBS воскресал в «Сервисах продаж»:** удалён из дефолтов стора — новые клиенты его
   больше не засевают. На сервере удалить один раз: Настройки → Сервисы (если ещё есть).
4. **ЛК 404 «Ссылка недействительна»:** у поставщиков до service_access не было токена.
   0007 дополнен разовым бэкфиллом токенов (только где их нет). Применить 0007 ещё раз —
   идемпотентно, уже существующие токены не трогает.
5. **Формы без подписей:** getConfig отдаёт label из дефиниции поля (старые конфиги
   хранили только key/visible).
6. `startTime` TypeError в консоли — сторонний инжект (расширение браузера), в коде
   приложения таких символов нет. Игнорировать.

**После обновления:** пересобрать фронт и API; на базе повторно `0007_prod_columns.sql`;
жёсткая перезагрузка (Ctrl+F5). Проверка: вход → данные сохраняются и переживают
перезаход → ЛК по старым ссылкам открывается → формы с подписями всех полей.

---
## v1.35.1 — Единый prod_baseline.sql для чистых установок

`migrations/prod_baseline.sql` — вся схема (0001…0007) одним идемпотентным файлом:
для установки с нуля на чистую базу применять ТОЛЬКО его. Существующая база с данными
не трогает этот файл — ей нужны только недостающие номерные миграции (сейчас: 0007,
а при отставании — 0002…0007 по порядку). Нумерованные файлы сохранены как есть.

---
## v1.35.0 — PROD-стабилизация: корни всех падений найдены и закрыты

**Дрейф схемы (сверка кода API с боевой базой):** `migrations/0007_prod_columns.sql` —
API писал колонки/таблицы, которых в базе не было (симптомы «ничего не работает»):
`suppliers.pricing_accepted_at / cab_contact / cab_phone / cab_email / service_search_conditions`,
`tickets.source`, таблицы `outbox_events` + `integration_facts` (почта ЛК падала молча).
Применить ОДИН раз на боевой базе (идемпотентно).

**Оферта (замкнутый круг разорван):** `acceptOfferEdition` больше не требует
`pricing_accepted_at` никем не ставившийся флаг — принятие оферты само фиксирует его
(`pricing_accepted_at = lk_offer_accepted_at`). Заявки ЛК (продвижение/новости/материалы)
достижимы после принятия. Заголовок ЛК: дашборд отдаёт `cabinetTitle` = домен.title ||
оферта.lkTitle (единый источник; страница больше не читает несуществующие ключи).

**Синк стора (savepoint-изоляция):** каждая запись пакета — свой SAVEPOINT; ошибка одной
строки откатывает только её; ответ `{ok, applied, errors[]}`; фронт пишет ошибки в app_logs
(`remote.ts`). «Всё слетает при обновлении» и «задачи не записываются» — лечатся, причины
стали видимы текстом.

**Формы «два поля»:** `getConfig` гарантирует видимость core-полей всегда (старые конфиги
с флагами у пары полей больше не уродуют форму).

**Модуль logs:** привит и приведён к боевым колонкам app_logs (level, message, page, stack,
user_email).

**FBS в «сервисах продаж»:** не баг — системный сервис из дефолтов стора попал в настройки
при первом пустом пуше («local wins on empty server»). Не нужен — удалить в
Настройки → Сервисы (system-сервисы помечены в интерфейсе).

**Проверка на проде после 0007:** оферта (принять → флаг появился → заявка уходит) →
условия/склады сохраняются → форма лида (включая поддержку) → письмо из ЛК →
создать задачу без срока (записывается, ошибки в app_logs при наличии).

---
## v1.34.1 — Фиксы typecheck API после локального прогона (13 ошибок закрыты)

**Найдено боевым прогоном (фронт — сразу чисто, API — 13 ошибок в 5 файлах), все закрыты:**
1. `suppliers.controller.ts` — после рефакторинга `DataAccess` вызовы не передавали `table`:
   подставлен `'suppliers'` во все 5 методов (buyers.controller был корректен).
2. `public/field-defs.ts` — тип `optionsSource` расширен `'sources' | 'buyerCategoryComments'`
   (использовались в данных полей форм).
3. `public/notify.ts` — в интерфейс `NotifyUser` добавлен `email?: string`.
4. `lk.service.ts` — приведение `service_search_conditions` к типу `withStatuses`.
5. `main.ts` CORS — регистрация через `getHttpAdapter().getInstance()`: типы плагина больше
   не конфликтуют с дублем fastify в `@nestjs/platform-fastify` (раньше требовался npm-dedupe,
   теперь не зависит от него). Плюс `overrides: {"fastify": "$fastify"}` в api/package.json.
6. `HistoryTab.tsx` — удалён дубль ключа `created` в мапе подписей.
7. `KnowledgePage.tsx` — исправлен JSX блока загрузки файла (побит при развёртывании
   тернарника в v1.34.0): `{!editingId ? (...)}` и полный тернарник `uploading ? … : …`.

**Порядок у пользователя:** заменить 5 файлов (или весь архив) → `cd api && npm install`
(подтянет override) → `npm run typecheck` → `npm run build`.

---
## v1.34.0 — PROD: криты аудита закрыты + Supabase вырезан ПОЛНОСТЬЮ

**Критические исправления (аудит перед продом):**
1. Хардкод `admin/admin123` удалён из default store — демо-входа больше нет; пароль только в
   `profiles.password_hash` (bcrypt).
2. Хранимый XSS в ЛК: `dangerouslySetInnerHTML` новостей → `DOMPurify.sanitize` (деп dompurify).
3. Брутфорс: `/auth/login` — 5 попыток/5 мин на email+ip (in-memory, единый отклик); ЛК-PIN —
   5 неверных → блокировка токена на 10 мин.
4. `migrations/0006_indexes.sql` — индексы под рост (suppliers/buyers inn/email/name/responsible,
   tasks/tickets FK+status, media_records.supplier, outbox pending, profiles email).
5. CORS: `CORS_ORIGINS`-allowlist для API; any-origin только `/forms` и `/lk` (embed) — prefix-scope.
6. Логи `max-w-full`; TTL access-токена 12ч → 2ч.

**Полный вырез Supabase (переезд завершён):**
- Удалены: `src/lib/supabase.ts`, `functions-api.ts`, `realtime.ts`, `env.ts`, `pages/server/`,
  `monitor-server.js`, папка `supabase/`, `docs/release_*.sql`; из `package.json` выведен
  `@supabase/supabase-js`; env фронта — только `VITE_API_URL`.
- Порты в API: `POST /checko/lookup` (прозрачный прокси, контракт как у edge), `POST /files` +
  `GET /files/:name` (base64→volume, svg запрещён, path-traversal закрыт — замена storage),
  `POST /logs` (app_logs), `POST/PATCH /auth/users` (входы: profiles+bcrypt; бан = NULL хэша).
- Страницы переключены на API: checko, log, MediaPage, SupplierServicePage (storage→API),
  KnowledgePage, DatabasePage (delete* → remote), SettingsPage (пользователи/баннеры/домены,
  тексты обновлены), App.tsx (без realtime-гейта), PublicFormPage.
- `auth.ts` — own-only (20 экспортов permission-API сохранены), `remote.ts`/`api.ts` — own-only.
- Realtime-подписок нет: обновления между клиентами — по перезаходу; SSE/poll — следующая задача.

**Проверка на проде:** вход (rate-limit) → карточки CRUD → ЛК по токену (PIN-блок) → форма лида
(дедуп+письмо) → загрузка файла → создание пользователя → Домены → `pg_prove` 7/7 →
`npm run typecheck` обоих пакетов.

---

## v1.33.3 — Аудит перед продом + READMEstart/READMEgo

Тотальный аудит (dead code, security, логика, адаптив, prod-готовность). Сразу исправлено:
мёртвые `apiLkGet/apiLkPost`, DRY-дедуп публичных форм (unified-функция). Криты зафиксированы
и закрыты в v1.34.0. Созданы `READMEstart.md` (запуск с нуля по шагам, памятка команд) и
`READMEgo.md` (выкатка обновлений: БД→код, откаты, smoke-тесты).

---

## v1.33.2 — Финал этапа переезда: README под новый стек

**README.md переписан полностью** (как было заявлено при старте переезда): стек (Coolify +
PostgreSQL 15 + NestJS/Fastify API + DBeaver + GitHub), архитектура с RLS-клеймами, структура
репозитория, локальная разработка, **деплой в Coolify по шагам** (роли app_user/app_admin,
порядок миграций, прокси /api, фича-флаг), таблица env-переменных (api/.env.example дополнен
TELEGRAM_BOT_TOKEN/MAX_API_BASE), миграции + pgTAP, **бэкапы/восстановление (RPO 24ч / RTO 1ч,
квартальный прогон restore)**, наблюдаемость (PgBouncer не требуется — зафиксировано порогом
пула ≤ 20), чек-лист релиза. api/package.json версия синхронизирована (1.33.2).

**Весь код переезда собран (v1.32.0 → v1.33.2):** миграции + pgTAP, API (auth, sync, suppliers,
buyers, lk, domains, public, email), фронт-адаптер с фича-флагом VITE_API_MODE, вырезан
marketingKit. Папка `supabase/` и supabase-режим остаются до подтверждения own-режима боевыми
тестами; выключение — отдельной правкой (удаление папки, workflows-шагов, env).

---

## v1.33.1 — Фаза C: публичные формы лидов в своём API (порт public-form)

**`api/src/public/`** — PublicModule, порт edge function `public-form`:
- `public.controller.ts` — контракт 1:1 как у edge: `GET /forms?type=…`, `POST /forms {type,…}`
  (embed.js и PublicFormPage не менялись); CORS (`@fastify/cors`, origin: true — формы на чужих сайтах;
  JWT-эндпоинты всё равно закрыты);
- `field-defs.ts` — FIELD_DEFS 1:1 из edge (supplier/buyer отличаются полями), marketingKit не портируется;
- `public.service.ts` — GET-конфиг + POST-submit: rate-limit 10/мин/IP, антибот (honeypot+≥2 сек),
  whitelist-валидация, дедуп ИНН/телефон/email (БЕЗ создания записи — только уведомление менеджеру,
  как в edge), 3-ступенчатый INSERT (полный→core→минимум), принудительный статус «Новый»;
  **совместимость двух контрактов**: `{data,loadedAt,website}` (embed.js) и `{values,renderedAt,honeypot}`
  (PublicFormPage — в edge совпадал только embed.js, латентный баг standalone-страницы формы закрыт);
- `notify.ts` — уведомления: email через воркер (`outbox_events`, global + личные копии),
  Telegram/MAX прямые fetch, персональные маршруты по ответственному.

**Фронт:** диспетчер `getServiceUrl('public-form')` → `/forms`; PublicFormPage на диспетчере.
Деп: `@fastify/cors`. Env: TELEGRAM_BOT_TOKEN, MAX_API_BASE, MAX_TOKEN/USER_ID (в настройках БД).

**Проверка:** own-режим: embed-форма на стороннем сайте шлёт лид → запись + уведомления;
дубль по ИНН → 400 «…Заявка направлена менеджеру», записи нет. Supabase-режим: без изменений.

---

## v1.33.0 — Вырезана форма «Маркетинг-кит» (публичная, только ИНН)

По постановке: форма медиа/маркетинг-кит, работавшая только при заполнении ИНН, удалена
ПОЛНОСТЬЮ, рабочие формы не тронуты. Удалено: тип `PublicFormEntityType` (остались
supplier/buyer/ticket), поле `AppSettings.forms.marketingKit`, конфиг в `DEFAULT_FORM_CONFIGS`,
миграции в store (merge + success-сообщение + union-итерация), вкладка в Настройки → Формы,
ветка «фиксированная анкета ИНН» в рендере. Роут `/forms/marketingKit` → «Форма недоступна».
Тип тикетов «Маркетинг-кит» (TICKET_TYPES) — другая сущность, НЕ тронут. Edge function
public-form (серверная часть) не менялась — форма недостижима с вырезанным конфигом/роутом.

Контроль после вырезки: `grep marketingKit` по src → ноль (кроме исторических строк в данных);
баланс скобок по всем правленным файлам — идеальный; рабочие конфиги supplier/buyer/ticket и
миграции сторов целы. Внимание: при контроле пойман и устранён инцидент — усечение хвоста
store.ts при точечной правке; файл восстановлен из эталона v1.32.9 и переприменены ровно 3
заявленные правки (дифф подтверждает: 8 строк, ничего лишнего).

---

## v1.32.9 — Фаза C: страницы на своём API (ЛК + домены)

**`api/src/domains/`** — DomainsModule: CRUD доменов через view public.domains (RLS admin-only).
Удаление «с концами» переехало из фронта в API и стало **атомарным** (перепривязка
suppliers/buyers на дефолт + DELETE в одной транзакции). Дефолтный домен защищён и в коде,
и 400 от API.

**Фронт:**
- `functions-api.ts` — диспетчер `getServiceUrl/getServiceHeaders`: own-режим маршрутизирует
  `supplier-service` на наш `/lk`, иначе — edge function как раньше;
- `SupplierServicePage` — все 9 вызовов ЛК на диспетчере (own → `/lk`, supabase → без изменений);
- `SettingsPage` — 4 функции доменов с own-ветками (apiDomainsList/Create/Update/Delete),
  supabase-ветки не тронуты;
- `api.ts` — хелперы вернулись **с потребителями** (apiLkGet/apiLkPost, apiDomains*).

**Пока не перенесено (сознательно):** public-form (embed-форма лидов) — свой эндпоинт появится
в v1.32.10 вместе с README; до тех пор в own-режиме форма продолжает ходить в Supabase edge.

**Проверка:** supabase-режим — как работало. own: ЛК открывается/сохраняет через /lk; домены
добавляются/выключаются/удаляются через API (удаление с арендаторами — атомарно).

---

## v1.32.8 — Уборка: повторный дедкод-скан после перехода на remote-диспетчер

**Метод:** word-boundary скан по всему src с полным списком файлов (без обрезок) + контроль
«внешних ссылок на снятые export» и баланса скобок. Два прокола пойманы и исправлены на контроле:
`CRMStore` оказался нужен `supabase.ts` (export возвращён), `debounce` — ровно одно вхождение
во всём src (объявление), удалён после полной проверки.

**Убрано (внешних ссылок нет — проверено):**
- `supabase.ts`: `pushRemoteSnapshot` (после 1.32.7 ни одного вызова);
- `api.ts`: переписан до подключённого минимума (auth+синк); CRUD-фабрика и ЛК-хелперы без
  потребителей вырезаны — вернутся вместе с миграцией страниц (v1.32.9);
- `utils.ts`: `debounce` (единственное вхождение — объявление);
- Снят `export` (объявления живы как внутренние кирпичи): 13 типов в types, FormField*
  в constants, ALL_NAV_ITEMS/NavItem, contactPrefIcon, subscribeToStoreChanges,
  ensureSystemStatuses.

**Не тронуто:** вся логика, подписи функций, Supabase-режим (по умолчанию — как работал).

**Проверка:** `npm run typecheck` + сборка — единственный источник истины после такой уборки;
рефакторинг без изменения поведения, регрессия не ожидается.

---

## v1.32.7 — Фаза C: синк стора через свой API

**`api/src/sync/`** — SyncModule: `GET /sync/snapshot` (все 5 таблиц, активные строки + settings
как есть, RLS-клеймы), `POST /sync/ops` (батч diff `{entity, op, id, data}` в одной транзакции,
whitelist сущностей, camelCase→snake_case, domain_id из клейма, жёсткий delete через RLS),
`PUT /sync/settings` (upsert app_settings с FOR UPDATE).

**`src/lib/remote.ts`** — транспортный диспетчер с контрактом мапперов (pullRemoteSnapshot,
saveSettings, create/update/delete ×5). Режим `supabase` — честная делегация в старые мапперы;
режим `own` — `/sync/*` с camelize таблиц (settings — без маппинга, jsonb-ключи остаются
snake_case). **`store.ts` переключён на './remote'** — логика диффов/пуша не тронута, только
дорога; 3 гарда синка → `remoteSyncEnabled()` (own-режим не требует настроенного Supabase).

**Режим по умолчанию — `supabase`: поведение приложения не изменилось** (сверено: старые
импорты удалены, remoteSyncEnabled=1 импорт+3 гарда). Полный own-режим: auth (1.32.6) + синк
(1.32.7) готовы; realtime-подписки в own-режиме пока не переносятся — обновления между
клиентами приходят со следующим пулом/перезаходом (SSE — отдельной задачей).

**Проверка:** own-режим: вход → стор заполняется из /sync/snapshot; правка карточки → пакет
в /sync/ops применяется, в другой вкладке (после пула) видно. Supabase-режим: как раньше.

---

## v1.32.6 — Фаза C: транспортный слой к своему API (фича-флаг)

**`src/lib/api.ts`** — apiClient: Bearer-токен в localStorage, `apiRequest` (JSON, ApiError с
сообщением сервера), `camelize` (API отдаёт snake_case как в БД → camelCase фронт-типов),
CRUD-фабрика (suppliers/buyers готовы), ЛК-пасsthrough (`apiLkGet/apiLkPost`).

**Режим:** `VITE_API_MODE` — `supabase` (по умолчанию, поведение не изменилось) | `own`.
`VITE_API_URL` пуст = same-origin (прокси /api → сервис в Coolify). Типы env — в vite-env.d.ts.

**`auth.ts`:** ветка own-режима в `login()` (apiLogin → токен → профиль из стора), `logout()`
чистит и API-токен. Ветка Supabase — не тронута. Миграция мапперов (store.ts/sync/realtime/
страницы) — по одной за следующие сборки; own-режим до завершения миграции — неполный, поэтому
флаг по умолчанию 'supabase'.

**CI (verify.yml):** добавлен шаг `npm run typecheck` после аудита (требование аудита переезда
2.7.4). Первый прогон может показать накопленные ошибки типов — чиним при первом же запуске.

**Проверка:** без переменных — приложение работает как раньше (Supabase). С `VITE_API_MODE=own`
логин уходит в POST /auth/login (требует api/ из v1.32.2+ и миграцию мапперов для полного цикла).

---

## v1.32.5 — Фаза B: почтовый воркер (outbox → SMTP)

**`api/src/email/`** — поллинг `outbox_events` (5 сек): забирает события с email-payload
(`payload ->> 'email' IS NOT NULL`), атомарный захват пачки `UPDATE … RETURNING` (двойной отправки
нет даже при двух репликах), отправка через Nodemailer по `SMTP_URL`, статусы sent/failed,
ретраи до 5 попыток с `last_error`. Без @nestjs/schedule — обычный setInterval.

События ЛК (принятие оферты, заявки) из v1.32.4 автоматически доезжают до почты —
отдельных правок ЛК не потребовалось. Env: `SMTP_URL`, `EMAIL_FROM`.

**Проверка:** SMTP_URL задан → в ЛК принять оферту (или вставить строку в outbox_events) →
письмо в ящике ≤ ~10 сек; в БД status=sent, sent_at заполнен; SMTP пуст → воркер молча off.

---

## v1.32.4 — Фаза B: ЛК поставщика по токену (порт edge function)

**`api/src/lk/`** — полный порт `supabase/functions/supplier-service` (поведение 1:1):
`GET /lk?token=` (карточка + branding домена + availableCities) и `POST /lk` (PIN → сохранение
складов/проценки/условий/контактов кабинета/оферты, спец-действия: принятие оферты, заявка на
продвижение, новости Торгов, договор медиа, материалы, правки новостей; пустой patch → дашборд).

**Ключевые решения порта:**
- Служебный пул `DATABASE_URL_ADMIN` (роль BYPASSRLS — аналог service_role): авторизация ЛК =
  токен+PIN, не JWT; доступ через `DatabaseService.withAdmin()`;
- Заявки/принятие оферты пишутся в `outbox_events` (воркер почты — v1.32.5), вместо прямой
  отправки из edge function;
- `app_settings` правится в транзакции с блокировкой строки (lost-update edge function устранён);
- `supplier_offer` в настройках — массив, редакция `[0]` (путь jsonb_set исправлен на
  `{supplier_offer,0,acceptedEdition}`);
- bodyLimit 512 КБ (как в edge function); rate-limit по PIN не переносим (в edge отключён с v1.23.19).

**Проверка:** фронт ЛК (SupplierServicePage) против `/lk` — GET/POST сценарии без изменений форм;
`statusHint` — '' (вычисление из edge не портили, проверить на фронте при тестах).

---

## v1.32.3 — Фаза B: data-модули suppliers/buyers

**`api/src/data-access.ts`** — общий CRUD поверх таблиц с RLS: list/get/create/update/soft-delete.
Колонки — whitelist (регекс + защита системных полей), значения параметризованы. `domain_id`
при создании берётся из клейма пользователя (INSERT-политика та же). Строки отдаются как есть
(snake_case) — маппинг во фронт-адаптере (фаза C). `SuppliersService`/`BuyersService` — тонкие.

**Эндпоинты:** `GET/POST /suppliers(/:id)`, `PATCH/DELETE /suppliers/:id` (buyers — зеркально).
Все через `withClaims` — фильтрация домена/доступа/ответственного на стороне БД, как на Supabase.

**Проверка:** токен менеджера → список только его домена; PATCH чужого домена → 404/0 строк
(USING-фильтр 0002); создание → domain_id из клейма; DELETE → deleted_at, в id_registry
триггер проставит метку.

---

## v1.32.2 — Фаза B: auth-модуль + слой БД с клеймами

**`migrations/0005_profiles_password_hash.sql`** — profiles.password_hash (bcrypt). На Supabase
пароли в auth.users (вне схемы), на своём сервере — рядом с ролью в profiles. Применить вместе с 0002–0004.

**`api/src/database/`** — DatabaseService (pg Pool) + `withClaims(user, fn)`: каждый запрос к
данным — в транзакции, `set_config('request.jwt.claims', …, true)` + `app.domain_id`. RLS-политики
и хелперы (is_admin, current_domain_id, access_*) работают **без изменений** — как на Supabase.

**`api/src/auth/`** — `POST /auth/login` (пользователь из app_settings.users, хэш из profiles,
bcrypt-compare) → JWT `{sub, email, role, domain_id}` TTL 12ч. AuthGuard глобальный:
всё закрыто по умолчанию, публичное — декоратор `@Public()` (логин, healthz, позже ЛК).
Дефолтный домен — константа (фаза 1, как на Supabase).

**Деплой:** DATABASE_URL под ролью `app_user` (RLS работает; BYPASSRLS-роль — только миграции).

**Проверка:** сид с bcrypt-хэшем → login → 200 + token; запрос без токена → 401;
healthz без токена → 200 (@Public).

---

## v1.32.1 — Фаза B: скелет API (NestJS + Fastify)

**`api/` — новый сервис (замена PostgREST + Edge Functions + Auth):**
- NestJS + Fastify-адаптер, listen `0.0.0.0:${PORT}` (иначе healthcheck Coolify не достучится);
- `GET /healthz` → `{status, uptime, version}` — дешёвый, без обращений к БД;
- multi-stage `Dockerfile` (build → prod под `USER node`); до появления lockfile — `npm install`,
  после первого прогона lockfile коммитим и переводим на `npm ci`;
- `.env.example`: PORT, DATABASE_URL (роль `app_user` — RLS работает), JWT_SECRET.

**Сознательно НЕ сделано (следующие сборки):** auth-модуль (bcrypt+JWT, выставление
`request.jwt.claims` + `app.domain_id`), data-модули, ЛК-роуты. Модули добавляются по одному.

**Проверка:** `cd api && npm install && npm run build && npm start` → `curl localhost:3000/healthz`
→ `{"status":"ok"}`; в Coolify — приложение зелёное, healthcheck проходит.

---

## v1.32.0 — Фаза A переезда: миграции, фикс RLS-доменов, фундамент 1С, pgTAP

**Процесс:** изменения схемы — только через `migrations/NNNN_*.sql` (ручной SQL Editor умирает).
`0001_baseline.sql` — снапшот схемы для ЧИСТЫХ установок; существующие базы применяют 0002→0004.
Тесты изоляции — `tests/rls_isolation.sql` (pgTAP: `pg_prove -U postgres tests/rls_isolation.sql`).

**`migrations/0002_fix_update_rls.sql` + синхронно `supabase/schema.sql` (исправлена дыра аудита):**
в UPDATE-политиках `suppliers`/`buyers` доменный фильтр был только в WITH CHECK — менеджер домена A
мог изменять записи домена B. Фильтр добавлен в USING (семантика типов/городов/ответственного не тронута).

**`migrations/0003_integration_1c.sql`:** таблицы `integration_facts` (идемпотентность по
UNIQUE(source, external_id)) и `outbox_events` (outbox-шаблон под исходящие события) — фундамент
обмена с 1С. RLS admin-only. Потребителей пока нет — триггеры не создаём.

**`migrations/0004_auth_compat.sql`:** мост для своего сервера без Supabase — `auth.uid()` шим
(читает `sub` из `request.jwt.claims`, который будет выставлять наш API). Вся модель прав
(is_admin, is_active_employee, has_section_permission, access_*, current_domain_id) работает без
переписывания. На Supabase безопасно (штатная auth.uid() уже есть — блок пропускается).

**`tests/rls_isolation.sql`** — 7 проверок: без клейма → 0 строк; домен B не видит default (и
симметрия); INSERT чужого домена отклонён; UPDATE чужой домен не изменяет (USING-фильтр 0002);
UPDATE со сменой домена отклонён (WITH CHECK); инвариант активного дефолт-домена.

**Проверка:** на чистом PG15 (Docker): baseline → 0002(для существующих)/0003/0004 → `pg_prove` зелёный.

---

## v1.31.18 — Настройки → Домены: фокусный режим, удаление, защита дефолта

**`SettingsPage.tsx` (без изменений БД — view `public.domains` уже работает):**
1. **Фокусный режим:** кнопка «Домены» открывает отдельный экран доменов — остальные пункты
   меню и все настройки системы не рендерятся (ранний return); возврат — кнопка «← Система».
2. **Удаление домена «с концами»:** у домена (кроме дефолтного) — корзина через готовый
   `GuardedDelete` (паттерн проекта). Перед удалением его поставщики и покупатели
   перепривязываются на дефолтный домен (обязательно: `domain_id NOT NULL` + FK), затем строка
   домена удаляется — вместе с брендингом ЛК (титул, приветствие, баннер). Пошаговые ошибки
   с toast, без частичных состояний.
3. **Дефолтный домен** (UUID `00000000-0000-4000-8000-000000000001`, host `default`): бейдж
   «Дефолтный», всегда активен — кнопки «Выключить» и корзины у него нет, переключение
   дополнительно заблокировано в `toggleDomain`.

**Проверка:** Настройки → Домены → только экран доменов → «← Система» возвращает → добавить
домен → удалить его (арендаторы на дефолте) → у дефолта нет «Выключить»/корзины.

---

## v1.31.17 — Предразработка ERP: доработка входа и шапки

**Страница входа (`LoginPage.tsx`):**
1. Логотип при входе: 230px → **333px**; отступ блока логотипа снизу 2rem → **3rem** (mb-12) — только на /login.
2. В строке логина иконка почты заменена на **шестерёнку** (Settings из lucide); `Mail` убран из импортов (мёртвый код).
3. **Кнопка «Войти» появляется только когда логин найден** среди `settings.users` (регистр не важен).
   Страховка от блокировки: если список пользователей ещё не загружен (первый визит, чистый
   кэш — список берётся из синхронизированного стора) — кнопка показывается всегда.
4. У строки пароля — **галочка «Запомнить»** рядом с глазом (тот же серый стиль: неактивна —
   gray-300, активна — gray-600). При включении логин/пароль сохраняются в localStorage
   (`vz_remember_login`) и подставляются при следующем входе; при выключении — стираются.
   Сохранение происходит только после успешного входа.

**Шапка ERP (`Header.tsx`):** логотип 150px → **245px** (кнопка «на главную» — без изменений,
ведёт на '/'). ЛК поставщика не тронут.

**Проверка:** /login → лого 333px, шестерёнка в поле логина, кнопка появляется после ввода
известного email → галочка запоминает пароль (перезайти) → шапка с лого 245px → ЛК со старым лого.

---

## v1.31.16 — Предразработка ERP: публичный ребрендинг CRM → ERP

**index.html:** title, description, keywords, og:*, twitter:*, apple-mobile-web-app-title —
все публичные названия переведены на ERP по постановке. **vite.config.ts:** PWA manifest
(name/short_name/description) → «ВсемЗапчасти ERP» / «ВЗ ERP».

**Страница входа (`LoginPage.tsx`):**
- Логотип → новый `/public/logo-erp.png`; подпись «CRM система отдела продаж» → «Система управления платформой».
- Удалены: заголовок «Вход в систему», подписи «Email (логин)»/«Пароль», плейсхолдер и
  демо-блок с admin@vz.tech (вместе с ними мёртвые `showDemoHint` и импорт `isSupabaseConfigured`).

**Шапка (`Header.tsx`):** логотип → `/logo-erp.png`.
**ЛК поставщика (`SupplierServicePage.tsx`):** старый логотип `/logo.png` НЕ меняется — как заявлено.
**Прочее:** комментарий в `public/embed.js`, `APP_VERSION` → 1.31.16.

**Проверка:** сборка → вкладка/заголовок «ВсемЗапчасти ERP» → вход без подписей и подсказок,
новый логотип на входе и в шапке → ЛК поставщика со старым логотипом.

---

## v1.31.15 — Гейт аудита: только production-зависимости

**Изменение:** `.github/workflows/verify.yml` — `npm audit --audit-level=high` →
`npm audit --audit-level=high --omit=dev`.

**Почему:** все оставшиеся уязвимости — dev-тулчейн (esbuild dev-server, postcss-selector-parser,
vite) — в продакшн-бандл не попадают, но блокировали релиз-гейт. high в production-зависимостях
по-прежнему блокирует. Мажорные апгрейды (vite 8, react-router 7) — по-прежнему задача v1.32.x.

---
## v1.31.14 — Закрытие уязвимостей high без мажорных апгрейдов

**Причина:** CI-гейт `npm audit --audit-level=high` блокировал релиз; typecheck не запускался.
Мажорные апгрейды (vite 8 / react-router 7 / tailwind) — отдельная задача (v1.32.x), тут только
безопасные патчи через `overrides` в package.json (принудительная версия ВЛОЖЕННЫХ зависимостей,
API-совместимые):

- `source-map-js` → `^1.2.2` — high: event-loop DoS через source-map offsets (GHSA-68fv-2mgg-jv7q).
- `serialize-javascript` → `^7.1.3` — XSS через `</script>` в сериализованных телах функций.
- `fast-uri` → `^3.1.9` — спуфинг схемы/normalization URI.

**Осталось (moderate, требуют мажорных апгрейдов — v1.32.x):** esbuild/vite (dev-server),
postcss-selector-parser (CPU exhaustion), react-router (open redirect через backslash).

**Проверка:** `rm -rf node_modules package-lock.json && npm install && npm audit` —
high 0, gate зелёный. Затем `npm run typecheck` и `npm run build`.

---
## v1.31.13 — Hotfix: восстановлены импорты (спред-использование) + typecheck

**Причина:** в v1.31.12 сканер мёртвых импортов не видел использования через спред
(`...NAME` — точка перед именем блокировала совпадение) и зря удалил 6 импортов.
Симптом в браузере: `ReferenceError: EMPTY_ACCESS is not defined` — приложение не стартует.

**Фронт:**
1. `src/lib/store.ts` — восстановлены `EMPTY_ACCESS` (из '@/types'), `DEFAULT_TASK_TYPES`,
   `DEFAULT_FORM_CONSENT` (из '@/constants'). Все используются спредом в `defaultAdmin`/миграциях.
2. `src/pages/support/SupportPage.tsx`, `TicketCardPage.tsx` — восстановлен `TICKET_TYPES`
   (используется как `[...TICKET_TYPES]`).
3. Остальная чистка v1.31.12 перепроверена корректным методом — мёртвый код подтверждён, не тронут.
4. `tsconfig.json`, `tsconfig.app.json` — `ignoreDeprecations: "6.0"` → `"5.0"`
   (значение "6.0" валидно только для TS 6.x; проект на TS 5.5 — typecheck падал с TS5103).

**Проверка:** `npm run typecheck` чисто → `npm run dev` → вход, создание поставщика/покупателя,
Поддержка (список тикетов), Настройки → Домены.

---
## v1.31.12 — Фиксы RLS (id_registry, public.domains) + чистка мёртвого кода

**БД (`docs/release_1.31.12.sql` — выполнить ДО выкладки фронта):**
1. `id_registry`: 4 триггер-функции реестра (`trg_suppliers/buyers_id_registry_bi/bd`) → `SECURITY DEFINER`.
   Симптом: «new row violates row-level security policy for table id_registry» (42501) —
   менеджер не мог создать/удалить поставщика/покупателя: RLS реестра SELECT-only для admin,
   а триггер писал с правами вызывающего. Логика триггеров не изменена.
2. Домены: прокси-вью `public.domains` (security_invoker) поверх `commerce.domains` + grants.
   Симптом: «Не удалось найти таблицу 'public.domains' в кэше схем» — фронт шлёт FROM 'domains'
   без схемы, PostgREST ищет в public. Плюс RLS `domains_admin_all` на commerce.domains
   (CRUD доменов только для admin; политика после определения is_admin()).
3. `supabase/schema.sql` синхронизирован (всё то же для новых установок).

**Код (фронт):**
4. Удалены мёртвые экспорты: `DEFAULT_SUPPLIER_TYPES`, `DEFAULT_BUYER_TYPES` (constants),
   `useSyncLog()`, `recentSyncErrorCount()` (store), `SupplierScoring` (types).
5. Удалены 41 мёртвый импорт в 12 файлах (recharts из AnalyticsPage, иконки lucide, константы).
   Алиасы `supabaseSignIn/supabaseSignOut` (auth.ts) и `LinkIcon` (KnowledgePage) — НЕ тронуты
   (используются).

**Проверка после выкладки:** менеджер создаёт поставщика и покупателя (без 42501) → удаляет →
Настройки → Домены открываются/добавляются → ЛК поставщика `/s/<token>` работает.

---

## v1.31.11 — Домены: изоляция (мультитенантность)

- commerce.domains — таблица доменов-арендаторов (host UNIQUE, title/greeting/
  banner, is_active); дефолт-домен с фиксированным UUID. Точечный GRANT SELECT.
- suppliers.domain_id / buyers.domain_id: tenant-столбец, backfill в default,
  NOT NULL БЕЗ DEFAULT (непропатченный INSERT падает — правка «явная ошибка»).
- current_domain_id(): клейм JWT → NULL без молчаливого фолбэка (RLS не
  пропускает); фолбэк на default — только admin (фаза 1).
- RLS: 6 политик suppliers/buyers с условием домена (чужой домен невидим).
- RPC get_supplier_with_domain(token) — поставщик + домен одной транзакцией;
  edge function findSupplierByToken переключён на RPC; ответ содержит
  lkDomain { host, title, greeting }; титул вкладки ЛК из домена.
- Фронт: mappers domain_id обе стороны (fallback DEFAULT_DOMAIN_ID), типы,
  константа; Настройки → меню категорий → вкладка «Домены» (CRUD).
- pgTAP: supabase/tests/database/domains_test.sql (4 теста, ключевой —
  «без клейма → 0 строк»).
- Зафиксировано решение: денормализация domain_id в будущих offers/orders/
  shipments (RLS без JOIN'ов).
- Документация: docs/DOMAINS.md — полное описание механизма.

Релизный SQL: docs/release_1.31.11.sql (⚠️ NOT NULL требует одновременную
сборку фронта). Порядок: SQL → supplier-service → сборка → жёсткая перезагрузка.

## v1.31.10 — ERP-фундамент: RLS (SELECT-обёртки), commerce-схема, CHECK внешних ID, pgTAP

- Все 36 RLS-политик: вызовы is_admin()/is_active_employee()/has_section_permission()/
  access_*() обёрнуты в (SELECT …) — вычисление один раз на запрос, а не на строку
  (Supabase-рекомендация; критично для таблиц под миллион записей).
- CREATE SCHEMA commerce + GRANT + комментарий-договор: parts/offers/orders/
  shipments — только туда; CRM остаётся в public.*.
- CHECK-констрейнты chk_suppliers_external / chk_buyers_external: external_id
  без external_source запрещён (закрыта дыра уникальности uq_*_external).
- Комментарий-контракт: app_settings не растёт (кроме users/forms/dbLogs).
- pgTAP: supabase/tests/database/rls_test.sql (4 теста: неизменяемость id,
  автогенерация public_id, запись в id_registry, CHECK external_source).
  Запуск: supabase test db.

Релизный SQL для прода: docs/release_1.31.10.sql (порядок: схема commerce →
CHECK → DROP/CREATE 36 политик). Идемпотентен.

UUIDv7: НЕ вводим — Supabase на PostgreSQL 15, uuidv7() появится только в PG 18.
План: при апгрейде платформы заменить gen_random_uuid() → uuidv7() в default
id и в клиентском generateId() (единая правка двух мест).

Мёртвого кода в зоне правок не обнаружено (все функции schema.sql используются).

Файлы: schema.sql, supabase/tests/database/rls_test.sql, docs/release_1.31.10.sql.
Фронт не тронут. Деплой: release_1.31.10.sql на прод → (опционально) сборка.

## v1.31.9 — Лог синка: читаемый текст ошибок (вместо [object Object])

Синк писал '[object Object]' для thrown-ошибок операций (String(reason) по
объекту) — причину падения create (suppliers/buyers) было не видно. Теперь
извлекаются code/message/details. Диагностика зависших записей (1 buyer +
2 suppliers, падают каждый синк):

```sql
-- 1. Колонки v1.30.98/99 на месте?
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_name IN ('suppliers','buyers')
   AND column_name IN ('external_id','external_source','public_id');
-- 2. Последовательности и реестр существуют?
SELECT relname FROM pg_class
 WHERE relname IN ('id_registry','supplier_public_seq','buyer_public_seq');
-- 3. Триггеры есть, а функции/объекты целы?
SELECT tgname FROM pg_trigger
 WHERE tgname LIKE '%public_id%' OR tgname LIKE '%id_registry%' OR tgname LIKE '%id_immutable%';
```

Если (1) пусто или (2)/(3) рассинхронизованы — прогнать релизные SQL
v1.30.98/99 заново (идемпотентны). После выкладки 1.31.9 следующий синк
покажет точный текст ошибки в «Логи синка».

Файлы: store. SQL: диагностический (выше). Деплой: сборка фронта → жёсткая
перезагрузка.

## v1.31.8 — Кнопки синих панелей 33px, Лиды padding 0, активный красный !important, вкладки Аналитики/Настроек

- Синие панели массовых действий (Поставщики, Покупатели, Задачи, Поддержка):
  кнопки приведены к единому .action-btn.action-btn-md (33px, без обводки,
  единый дизайн).
- База лидов: у контейнера раздела убран padding (p-4 sm:p-6 → 0).
- .action-btn-active: красный текст #DC2626 с !important.
- Аналитика: в меню категорий добавлена вкладка «Аналитика CRM» (первая,
  активная). Настройки: добавлено меню категорий с вкладкой «Система».

Файлы: index.css, Buyers/Suppliers/Support/Tasks, Leads, Analytics, Settings.
SQL: не требуется. Деплой: сборка фронта → жёсткая перезагрузка.

## v1.31.7 — Откат: кнопки ЛК-дэшборда в исходном дизайне

1.31.6 зря унифицировал кнопки блоков ЛК («СКЛАД», «Подробнее», «+») —
возвращены исходные стили. Единый дизайн action-btn остаётся в CRM (меню
доп.категорий разделов). Выровненная высота блоков Баннер/ВЗ ЧАТ/О компании
сохранена.

Файлы: SupplierServicePage. SQL: не требуется. Деплой: сборка фронта → жёсткая
перезагрузка.

## v1.31.6 — ЛК дашборд: единые кнопки блоков, равная высота карточек

- Кнопки блоков дашборда ЛК («СКЛАД», «Подробнее» ×2, «+» ×2) приведены к
  единому дизайну меню категорий (.action-btn — как во всех разделах CRM).
- Блоки Баннер, ВЗ ЧАТ и «О компании» выровнены по высоте: h-full на всех
  трёх карточках (баннер — flex-контейнер, изображение заполняет высоту,
  заглушка min-h-40).

Файлы: SupplierServicePage. SQL: не требуется. Деплой: сборка фронта → жёсткая
перезагрузка.

## v1.31.5 — Меню категорий: активный красный везде, Лиды без лишнего padding, Знания без иконки

- .action-btn-active: текст красный #DC2626 (как активный пункт в Продвижении)
  + фон #E0E0E0 — едино во всех разделах.
- База лидов: убран вложенный контейнер в панели (padding 0 — кнопки прямо в
  панели); переключатели «Покупатели/Поставщики» на action-btn-active.
- База знаний: удалён блок иконки (w-10 h-10 rounded-xl bg-brand-red/10).

Файлы: index.css, LeadsPage, KnowledgePage. SQL: не требуется. Деплой: сборка
фронта → жёсткая перезагрузка.

## v1.31.4 — Меню доп.категорий: единые кнопки без обводки; дашборд без панели

- Дашборд: панель действий удалена полностью (не нужна).
- Кнопки меню доп.категорий (.action-btn): БЕЗ обводки (border: 0), прозрачный
  фон, min-height 25px, наводка #F5F5F5, активный пункт — фон #E0E0E0.
- Все кнопки панелей во всех разделах абсолютно одинаковы: варианты primary/
  danger убраны, самодельные чипы фильтров (Задачи, Поддержка, Аналитика,
  База данных) переведены на общий action-btn (+action-btn-active). Статусные
  чипы задач сохраняют цветовой код статуса (инлайн-стиль поверх единой базы).

Файлы: index.css, Dashboard, Tasks, Support, Analytics, Database + унификация
кнопок во всех разделах. SQL: не требуется. Деплой: сборка фронта → жёсткая
перезагрузка.

## v1.31.3 — Панели действий: парящая подложка без обводки + единые кнопки

- В строках кнопок разделов (Дашборд, План/Факт, Поставщики, Покупатели,
  Задачи, Поддержка, База лидов, Проценка, Продвижение, Аналитика, База знаний,
  База данных, Дашборд МОП/МОЗ) добавлена подложка .actions-bar (белая,
  rounded-2xl, тень, БЕЗ обводки) — парящее горизонтальное меню действий.
- Все кнопки действий унифицированы в .action-btn (min-height 36px, дизайн —
  по кнопкам «Условия проценки»/«Список складов» из Проценки): обычная — белая
  с обводкой; .action-btn-primary — красная; .action-btn-danger — светло-
  красная; активная — серый фон (.action-btn-active).
- Новые классы — в index.css. Вкладки Настроек (навигация раздела) не тронуты.

Файлы: index.css + 14 страниц. SQL: не требуется. Деплой: сборка фронта →
жёсткая перезагрузка.

## v1.31.2 — Разделы без титлов: действия слева

В разделах Дашборд (общий и МОП/МОЗ), План/Факт, Поставщики, Покупатели,
Задачи, Поддержка, База лидов, Проценка, Продвижение, Аналитика, База знаний,
Настройки, База данных удалены заголовки (page-title); кнопки действий,
ранее справа, перенесены влево на место заголовка. Логика разделов не тронута.

Файлы: 14 страниц. SQL: не требуется. Деплой: сборка фронта → жёсткая
перезагрузка.

## v1.31.1 — Меню: группы свёрнуты с иконками, CRM, «Продвижение», логотип → главная

- Группы меню (CRM/Сервисы/Система) скрыты по умолчанию — раскрытие по клику;
  у каждой группы своя иконка. В свёрнутом меню — иконки групп (клик — первый
  видимый пункт группы), а не подменю. Группа с активным разделом раскрыта.
- Активный подпункт — лёгкий серый фон с закруглением (bg-gray-100 rounded-lg).
- «Работа» переименована в «CRM»; «Медиа сервис» → «Продвижение», стоит после
  «Проценки» (navConfig — порядок и подписи, логика маршрутов не тронута).
- Между подпунктами — ещё меньше пробел (py-1, без отступа блока).
- Логотип в шапке кликабелен — переход на главную (/).
- Файлы: navConfig, Sidebar, Header. SQL: не требуется.

Деплой: сборка фронта → жёсткая перезагрузка.

## v1.31.0 — Предразработка ERP: редизайн Layout (шапка на всю ширину, парящее меню)

- Шапка на всю длину экрана (sticky): слева — логотип (перенесён из меню),
  справа — быстрые ссылки, колокольчик и блок пользователя (перенесён из меню,
  после колокольчика). На мобильном шапки нет (навигация — BottomNav).
- Меню — парящая карточка: отступы от краёв (left-3/bottom-3), отступ сверху
  от шапки, закругления (rounded-2xl), тень. Слева меню — справа контент.
- Группы «Работа» / «Сервисы» / «Система» — кнопки-аккордеоны с раскрытием
  вниз; активная группа раскрыта принудительно. Подпункты — компактные,
  вертикальные, без подложки (активный — красный, жирный).
- Свернутое меню (иконки) сохранено; мобильный полноэкранный drawer прежний
  (с блоком пользователя и выходом).
- Файлы: Header.tsx, Layout.tsx, Sidebar.tsx (переписаны). SQL: не требуется.

Деплой: сборка фронта → жёсткая перезагрузка.

## v1.30.105 — Hotfix: сборка падала (JSX-комментарий в тернарнике баннера)

Сборка 1.30.103/104 падала (Expected ')' but found 'href', стр. 657): JSX-
комментарий баннера стоял первым узлом в скобках тернарника. Заменён на JS-
комментарий. Усиленный чекер класса ошибок — 0 вхождений.

Файлы: SupplierServicePage. SQL: не требуется. Деплой: сборка фронта →
перезапуск dev-сервера → жёсткая перезагрузка.

## v1.30.104 — Титул кабинета — в названии вкладки браузера

1.30.103 показывал титул заголовком в теле кабинета — перенесено в
document.title (useEffect по cabTitle): поставщик видит титул в названии вкладки.
Заголовок в кабинете удалён.

Файлы: SupplierServicePage. SQL: не требуется. Деплой: сборка фронта → жёсткая
перезагрузка.

## v1.30.103 — ЛК: баннер фиксированного размера, переименования, «Титул»

- Баннер на дашборде ЛК: блок больше не растягивается под картинку —
  w-full + h-40 object-cover (как блоки ВЗ ЧАТ и «О компании»).
- Сводка «О компании» (только названия): «Статус» → «Поставщик»,
  «Медиа сервис» → «Сервис рекламы».
- Продвижение: «Медиа сервисы» → «Рекламные форматы».
- Настройки → ЛК Поставщик: после «Ссылки офер» новая кнопка «Титул» —
  настройка «Титул для кабинета» (settings.cabinetTitle). Титул показывается
  поставщику в верхней части кабинета (ЛК → Кабинет); edge function отдаёт
  cabinetTitle.

Файлы: SupplierServicePage, SettingsPage, types, store, supplier-service.
SQL: не требуется (всё в app_settings JSONB). Деплой: supplier-service →
сборка фронта → жёсткая перезагрузка.

## v1.30.102 — Дедупликация системных сервисов: строгая пара (svc-* + системное имя)

1.30.101 не удалил дубли в ЛК: копия создавалась с тем же каноническим id
(svc-dbs), а фильтр сохранял все записи с каноническими id. Теперь системной
считается строго пара (id=svc-* и name=DBS/MARKET/MEDIA); все остальные записи
с системными именами или каноническими id удаляются, мердж воссоздаёт
канонические. ЛК читает сервер — применить SQL очистки на проде (ЛК станет
чистым сразу, без редеплоя edge function):

```sql
UPDATE app_settings
SET settings = jsonb_set(settings, '{supplierServices}',
  (SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
   FROM jsonb_array_elements(settings->'supplierServices') elem
   WHERE (elem->>'name' NOT IN ('DBS','MARKET','MEDIA')
          AND elem->>'id' NOT IN ('svc-dbs','svc-market','svc-media'))
      OR (elem->>'id', elem->>'name') IN
         (('svc-dbs','DBS'), ('svc-market','MARKET'), ('svc-media','MEDIA'))))
WHERE id = 'global' AND jsonb_typeof(settings->'supplierServices') = 'array';
```

Файлы: store, MIGRATION. Деплой: SQL → сборка фронта → жёсткая перезагрузка.

## v1.30.101 — Очистка случайных дублей системных сервисов продаж

Миграция вне гейта (store): убирает копии системных сервисов, созданные багом
редактирования (v1.30.100) — оставляет только канонические записи
(svc-dbs/svc-market/svc-media), удаляет лишние записи с системными именами
и дедуплицирует по id. При первой загрузке CRM список почистится и запушится.

SQL для немедленной чистки на проде (выполнить и перезагрузить страницу):
```sql
-- Удаляем дубли системных сервисов: оставляем канонические id, остальные с
-- системными именами — выкидываем (идемпотентно, безопасно для пользовательских)
UPDATE app_settings
SET settings = jsonb_set(settings, '{supplierServices}',
  (SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
   FROM jsonb_array_elements(settings->'supplierServices') elem
   WHERE elem->>'id' IN ('svc-dbs','svc-market','svc-media')
      OR NOT (elem->>'name' IN ('DBS','MARKET','MEDIA'))))
WHERE id = 'global' AND jsonb_typeof(settings->'supplierServices') = 'array';
-- Если канонических записей нет (их удалили) — восстановить:
INSERT INTO-стиль не нужен: миграция store воссоздаст канонические при загрузке.
```

Файлы: store, MIGRATION. Деплой: сборка фронта → жёсткая перезагрузка
(миграция отработает при входе, дубли исчезнут из Настроек и ЛК).

## v1.30.100 — Сервисы продаж: публичные названия + фикс дубля при редактировании

- supplierServices: новое поле publicName — публичное название для ЛК
  (DBS→«проценка», MARKET→«маркетплейс», MEDIA→«реклама»; системные name внутри
  не меняются — логика, чипы, тарифы работают как раньше). Формы добавления и
  редактирования сервиса в Настройки → Сервисы продаж получили поле публичного
  названия; в списке показано «в ЛК: …».
- Фикс дубля: мердж системных сервисов в store переведён с имени на ID
  (svc-dbs/svc-market/svc-media) — переименование системного сервиса больше не
  порождает копию дефолтного.
- ЛК поставщика: «Активные сервисы продаж» получают список с сервера
  (edge function → services: code/label) — новые сервисы появляются в ЛК без
  правки кода; чипы показывают публичные названия.

SQL для прода (идемпотентно; клиентская миграция store проделает то же при
первой загрузке и запушит):
```sql
UPDATE app_settings
SET settings = jsonb_set(settings, '{supplierServices}',
  (SELECT COALESCE(jsonb_agg(
     CASE WHEN elem->>'name' IN ('DBS','MARKET','MEDIA') AND (elem->>'publicName') IS NULL
          THEN elem || jsonb_build_object('publicName',
               CASE elem->>'name' WHEN 'DBS' THEN 'проценка' WHEN 'MARKET' THEN 'маркетплейс' ELSE 'реклама' END)
          ELSE elem END), '[]'::jsonb)
   FROM jsonb_array_elements(settings->'supplierServices') elem))
WHERE id = 'global' AND jsonb_typeof(settings->'supplierServices') = 'array';
```

Файлы: store, types, SettingsPage, SupplierServicePage, supplier-service.
Деплой: supplier-service → сборка фронта → жёсткая перезагрузка.

## v1.30.99 — Читаемые бизнес-ID: S000001 (поставщики), B000001 (покупатели)

- Новые колонки public_id (suppliers, buyers) + уникальные индексы.
- Последовательности supplier_public_seq / buyer_public_seq (NO CYCLE, CACHE 1):
  номер выдаётся один раз и никогда не переиспользуется — даже после удаления
  записи её номер остаётся занятым. Триггеры BEFORE INSERT заполняют public_id
  автоматически ('S'||lpad(n,6,'0') / 'B'||…).
- UUID id остаётся внутренним PK (синхронизация, ЛК, связи) — читаемый ID —
  для людей и документов. Требование «неповторяемости» сохранено обоими слоями.
- Фронт: publicId в типах и мапперах обе стороны; в таблицах под названием —
  S/B-ID (внутренний UUID — в tooltip).

SQL для боевой базы (ПЕРЕД выкладкой фронта):
```sql
-- 1. Колонки
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE buyers    ADD COLUMN IF NOT EXISTS public_id TEXT;
-- 2. Последовательности (NO CYCLE — номер навсегда занят)
CREATE SEQUENCE IF NOT EXISTS supplier_public_seq AS INTEGER NO CYCLE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS buyer_public_seq AS INTEGER NO CYCLE CACHE 1;
-- 3. Backfill: существующим — номера по порядку создания (идемпотентно)
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM suppliers WHERE public_id IS NULL)
UPDATE suppliers s SET public_id = 'S' || lpad(n.rn::text, 6, '0')
FROM numbered n WHERE s.id = n.id;
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM buyers WHERE public_id IS NULL)
UPDATE buyers b SET public_id = 'B' || lpad(n.rn::text, 6, '0')
FROM numbered n WHERE b.id = n.id;
-- 4. Сдвиг последовательностей за backfill
SELECT setval('supplier_public_seq', GREATEST((SELECT count(*) FROM suppliers), 1));
SELECT setval('buyer_public_seq', GREATEST((SELECT count(*) FROM buyers), 1));
-- 5. Триггеры (тела — в schema.sql v1.30.99)
-- 6. Уникальные индексы
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_public_id ON suppliers(public_id) WHERE public_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_buyers_public_id ON buyers(public_id) WHERE public_id IS NOT NULL;
```

Тесты приёмки: все строки имеют public_id (NOT NULL после backfill);
INSERT без public_id → автозаполнение 'S'/'B' + 6 цифр; повторный INSERT →
следующий номер; удалённый номер не выдаётся повторно (последовательность
монотонна, NO CYCLE).

Откат: DROP TRIGGER ×2 → DROP FUNCTION ×2 → DROP SEQUENCE ×2 → DROP INDEX ×2 →
DROP COLUMN public_id (UUID id и реестр v1.30.98 сохраняются).

## v1.30.98 — Постоянные ID поставщиков/покупателей + id_registry

Схема (supabase/schema.sql): колонки external_id/external_source (suppliers,
buyers) + уникальные индексы по паре; таблица id_registry (вечный журнал выданных
UUID); триггеры — реестр при INSERT, запрет изменения id, пометка deleted_at при
DELETE (ID хранится в реестре навсегда); RLS: чтение реестра — admin.
Фронт: типы externalId/externalSource, маппинг обе стороны (supabase.ts), в
таблицах Поставщики/Покупатели под названием — вторая строка с ID
(text-[10px] font-mono text-gray-400).

Фактура: suppliers.id / buyers.id — уже UUID PK DEFAULT gen_random_uuid();
генератор клиента crypto.randomUUID() — повторное использование исключено
на уровне БД. id_registry — аудит и гарантия «на бумаге».

SQL для боевой базы (ПЕРЕД выкладкой фронта, иначе upsert упадёт на колонках):
```sql
-- 1. Колонки
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS external_source TEXT;
ALTER TABLE buyers    ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE buyers    ADD COLUMN IF NOT EXISTS external_source TEXT;
-- 2. Реестр + индексы
CREATE TABLE IF NOT EXISTS id_registry (
  id UUID PRIMARY KEY, entity_type TEXT NOT NULL, entity_id UUID NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(), issued_by TEXT, metadata JSONB DEFAULT '{}'::jsonb);
CREATE INDEX IF NOT EXISTS idx_id_registry_entity ON id_registry(entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_external ON suppliers(external_source, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_buyers_external ON buyers(external_source, external_id) WHERE external_id IS NOT NULL;
-- 3. Backfill реестра (существующие ID фиксируем как выданные)
INSERT INTO id_registry (id, entity_type, entity_id, issued_at, issued_by)
  SELECT id, 'supplier', id, COALESCE(created_at, now()), 'migration' FROM suppliers ON CONFLICT (id) DO NOTHING;
INSERT INTO id_registry (id, entity_type, entity_id, issued_at, issued_by)
  SELECT id, 'buyer', id, COALESCE(created_at, now()), 'migration' FROM buyers ON CONFLICT (id) DO NOTHING;
-- 4. Триггеры (тела — в schema.sql; применить оттуда или через supabase db push)
-- 5. RLS
ALTER TABLE id_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS id_registry_select_admin ON id_registry;
CREATE POLICY id_registry_select_admin ON id_registry FOR SELECT TO authenticated USING (public.is_admin());
```

Тесты приёмки: UPDATE suppliers SET id = gen_random_uuid() → ошибка 'id immutable';
DELETE + проверка id_registry (ID остаётся, metadata.deleted_at проставлена);
SELECT count(*) FROM suppliers = count(*) реестра для 'supplier'.

Откат: DROP TRIGGER ×6 → DROP FUNCTION ×6 → DROP TABLE id_registry (данные
колонок external_* можно оставить) → DROP INDEX uq_*. SQL → сборка фронта.

## v1.30.97 — Hotfix: SupplierServicePage не загружался (JSX-комментарий в тернарнике)

Сборка падала (Expected '</', got 'ident', стр. 776): JSX-комментарий v1.30.96
оказался первым узлом в скобках тернарника (между скобкой и ним — JS-строка-
комментарий, поэтому чекер пропустил). Комментарий объединён с JS-комментарием.

Файлы: SupplierServicePage. SQL: не требуется. Деплой: сборка фронта →
перезапуск dev-сервера → жёсткая перезагрузка.

## v1.30.96 — ЛК: статус договора в сводке — размер/радиус как «Подробнее»

В блоке сводки (с подложкой overlay) статус договора приведён к форме кнопки
«Подробнее» этого же блока: text-xs font-semibold px-2.5 py-1 rounded-md;
мягкие цвета статуса сохранены. Только это место.

Файлы: SupplierServicePage. SQL: не требуется. Деплой: сборка фронта.

## v1.30.95 — Fix: «в работе» + мягкий цвет статуса договора везде, F5-вылеты, операторы

- Статус договора «Новый» отображается «в работе» во ВСЕХ трёх местах
  (дашборд ЛК, блок «Договор» Продвижения — там подпись отсутствовала, CRM).
- Цвет статуса договора единый и мягкий везде: bg-green-100/text-green-700,
  bg-amber-100/text-amber-700 («в работе»), bg-gray-100/text-gray-500
  (rounded-full) — в обеих частях ЛК и в CRM.
- Вылет из ЛК после повторных F5: авто-проверка пина выходила из ЛК при ЛЮБОЙ
  ошибке (включая сетевые сбои edge function). Теперь выход только при явно
  невалидном пине/токене, сетевые — ретрай через 2 с.
- Операторы: повторный тик сохранения через 300 мс после создания/правки —
  защита от гонки «F5 раньше push».

Файлы: SupplierServicePage, SettingsPage, MediaPage. SQL: не требуется. Деплой:
сборка фронта → жёсткая перезагрузка.

## v1.30.94 — Hotfix: новости в ЛК, вылеты при обновлении, правка оператора

- Новости пустые в ЛК: фильтр published рубил записи из БД без поля (миграция
  была только в localStorage). Теперь `published !== false` — легаси считаются
  опубликованными, скрыты только со снятой публикацией.
- Вылеты из ЛК при повторных обновлениях: loadLkInfo писал в data новый объект
  при каждом ответе → эффект [data] перезапускал загрузку бесконечно. Теперь
  setData только при реальном изменении phone — петля разорвана.
- Оператор: кнопка «Сохранить изменения» при правке + «Отмена» (раньше всегда
  было «Создать оператора» — создавался дубль вместо обновления).

Файлы: supplier-service, SupplierServicePage, SettingsPage. SQL: не требуется.
Деплой: supplier-service → сборка фронта → жёсткая перезагрузка.

## v1.30.93 — Hotfix: SupplierServicePage не загружался (JSX-комментарий в скобках)

Сборка 1.30.92 падала: в строке статуса договора дашборда JSX-комментарий
оказался первым узлом в скобках тернарника — модуль не трансформировался.
Объединён с JS-комментарием. Усилен чекер класса ошибок (скобки любого типа).

Файлы: SupplierServicePage. SQL: не требуется. Деплой: сборка фронта →
перезапуск dev-сервера → жёсткая перезагрузка.

## v1.30.92 — Единый цвет статуса договора, «в работе», «Новости рынка», публикация новостей, операторы CRUD

- Статус договора везде одинаковый (дашборд ЛК, блок «Договор», CRM Медиа):
  кнопочный solid — Активный bg-green-600, «в работе» bg-amber-500, Не активный
  bg-gray-400 (text-xs px-2.5 py-1 rounded-md, белый текст).
- Проценка (ЛК): статус склада «Новый» отображается как «в работе».
- «От поставщиков к поставщикам» → «Новости рынка» (дашборд ЛК + Настройки →
  ЛК Поставщик → Новости).
- Новости (Настройки → ЛК Поставщик → Новости, оба блока — «Новости платформы»
  и «Новости рынка»): у каждой новости кнопки «Опубликовать»/«Снять»
  (опубликованные видны в ЛК), «Редактировать» (подгружает в форму), удаление
  с подтверждением (GuardedDelete). Новые — черновики до публикации.
  Edge function: ленты news/vendorNews в ЛК — только опубликованные.
  Миграция store: существующим новостям проставлено published: true.
- Оператор (Настройки → ЛК Поставщик): «Редактировать» (подгружает в форму,
  сохранение обновляет) и удаление с подтверждением.

Файлы: SupplierServicePage, SettingsPage, MediaPage, store, types,
supplier-service. SQL: не требуется. Деплой: supplier-service → сборка →
жёсткая перезагрузка.

## v1.30.91 — ЛК дашборд: статус-кнопка договора; «в работе» везде

- Дашборд, строка «Медиа сервис»: если договор найден (любой статус) —
  «Подробнее» скрыта, вместо неё статус-кнопка договора (тот же размер и
  радиус, что «Подробнее»: text-xs px-2.5 py-1 rounded-md; цвет по статусу —
  Активный зелёный, «в работе» янтарный, Не активный серый, белый текст).
  Без договора — «Подробнее» и «+» (активация) как раньше.
- «Новый» → «в работе» теперь и в CRM (Медиа → Договора).

Файлы: SupplierServicePage, MediaPage. SQL: не требуется. Деплой: сборка
фронта → жёсткая перезагрузка.

## v1.30.90 — ЛК дашборд: «Медиа сервис», «в работе», «+» = активация договора

- Сводка «О компании»: строка «Продвижение» переименована в «Медиа сервис».
- Статус договора «Новый» отображается как «в работе» (дашборд и блок Продвижение;
  значение в данных не менялось).
- Кнопка «+» у строки «Медиа сервис» открывает ту же модалку активации договора,
  что и в разделе Продвижение.
- Если договор найден — вместо «+» показывается цветной бейдж статуса договора.

Файлы: SupplierServicePage. SQL: не требуется. Деплой: сборка фронта → жёсткая
перезагрузка.

## v1.30.89 — ЛК: «Добавить новость» сбрасывает поля

Модалки добавления и редактирования новости делили буферы (nnTitle/nnLink/
nnText/nnImage): после редактирования в форме добавления оставались старые
данные. Кнопка «Добавить новость» теперь очищает поля перед открытием.

Файлы: SupplierServicePage. SQL: не требуется. Деплой: сборка фронта.

## v1.30.88 — ЛК: проценка — text-gray-800 (было неверно заменено на 400)

В разделе проценка весь text-gray-400 заменён на text-gray-800 (как просили —
«наоборот»: предыдущие замены 900/800→400 откатываются в сторону 800).

Файлы: SupplierServicePage. SQL: не требуется. Деплой: сборка фронта.

## v1.30.87 — ЛК: мгновенная загрузка данных, обновление списков без F5

- После входа (обе ветки PIN: авто-загрузка и ручной ввод) loadLkInfo()
  вызывается сразу — менеджер, новости, форматы, договор видны мгновенно,
  без ожидания эффектов и без F5.
- После успешных действий список перезагружается немедленно: заявка на формат
  (размещение в списке), добавление новости («Мои новости»), отправка материала
  (зелёный статус кнопки).
- Проценка: text-gray-800 → text-gray-400 (как в Продвижении).

Файлы: SupplierServicePage. SQL: не требуется. Деплой: сборка фронта → жёсткая
перезагрузка.

## v1.30.86 — ЛК: короткие расшифровки, цвета статусов, DBS без обводок, редактирование новостей, проценка серее

- «Статусы размещений»: короткие формулировки; бейджи в строках теперь семи
  цветов по карте STATUS_STYLE.
- Проценка (DBS): у статусов в таблице убрана обводка — только фон и цвет.
- «Мои новости»: клик по строке — просмотр/редактирование (модалка: заголовок,
  ссылка, текст, картинка); в строке заголовок жирным + текст одной строкой с
  троеточием. Edge function: newsUpdate (только свои новости).
- Проценка: text-gray-900 → text-gray-400 (как в Продвижении).

Файлы: SupplierServicePage, supplier-service/index.ts. SQL: не требуется.
Деплой: supplier-service → сборка фронта → жёсткая перезагрузка.

## v1.30.85 — ЛК: попап «Статусы размещений» — как «Статусы условий»

Кнопка (w-9 h-9, Info 16) и поведение — зеркально кнопке «Статусы условий» в
проценке: клик → absolute-карточка (right-4 top-12, w-96, тень, обводка) с
цветными статусами и расшифровками, stopPropagation. В строках таблицы кнопок
нет.

Файлы: SupplierServicePage. SQL: не требуется. Деплой: сборка фронта.

## v1.30.84 — ЛК: справка статусов в шапке блока, материал-зелёный, шрифты, fix 500

- Исправлена ошибка 500 при заявке из ЛК: start_date/end_date были NOT NULL —
  null из edge function не проходил. Колонки сделаны nullable (SQL ниже).
- «Статусы размещений»: кнопка-иконка Info перенесена из строк таблицы в правый
  угол заголовка блока «Рекламные размещения»; по клику — список всех 7
  расшифровок. Кнопок в строках нет.
- Кнопка «Материал»: добавлен — просто зелёный фон (bg-green-100), без галочки
  и без выделения бордера.
- Шрифт «Тип рекламы» и «Тариф» — чуть больше (text-sm); дата не тронута.

SQL для боевой базы (ПЕРЕД выкладкой edge function):
```sql
ALTER TABLE media_records ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE media_records ALTER COLUMN end_date DROP NOT NULL;
```

Файлы: schema.sql, SupplierServicePage. Деплой: SQL → supplier-service → сборка
фронта → жёсткая перезагрузка.

## v1.30.83 — ЛК: хинт-иконка Info, заявки без дат, кнопка «Материал», шрифты

- Подсказка статуса: круглая иконка Info как кнопка «Статусы условий» в проценке
  (красная в активном состоянии).
- Заявки из ЛК создаются БЕЗ дат (start/end = null) — даты назначает менеджер
  в CRM, в ЛК показывается «дата не назначена»; шрифт дат мельче и тоньше
  (text-[11px], font-normal, gray-400).
- Кнопка «Материал»: hover — только затемнение фона (красная обводка убрана);
  если материал добавлен — кнопка зелёная с галочкой «Материал ✓» (tooltip
  «можно обновить»). Edge: material в select размещений.
- Шрифты «Тип рекламы» и «Тариф» возвращены как в 1.30.80 (жирные значения),
  дата осталась мелкой.

Файлы: SupplierServicePage, supplier-service/index.ts. SQL: не требуется.
Деплой: supplier-service → сборка фронта → жёсткая перезагрузка.

## v1.30.82 — Hotfix: коллизия statusHint в SupplierServicePage

Сборка 1.30.81 падала: подсказка статуса размещений объявила statusHint второй
раз (идентификатор уже занят подсказкой условий DBS). Переименована в
placeHint/setPlaceHint (3 использования). Логика 1.30.81 не изменилась.

Файлы: SupplierServicePage.tsx. SQL: не требуется. Деплой: сборка фронта.

## v1.30.81 — Медиа: переименование статусов, материал из ЛК, хинты статусов

Системные статусы (миграция вне гейта — записи ремапятся автоматически):
Новый заказ→Заявка создана, Отправлен счет→Счёт отправлен, Активен на
платформе→Опубликовано, Ожидает размещения→Запланировано, Аннулирован→Отменено,
Заканчивается срок→Завершается, Заказ выполнен→Выполнено. MEDIA_SYSTEM_STATUSES
починена (была протухшей с 1.30.48). Все ссылки (валидация, цвета, edge) переведены.

ЛК Продвижение:
- Кнопка «Мои» → «Мои новости».
- «Рекламные размещения»: тонкий шрифт text-xs; если даты не назначены — «дата
  не назначена»; новая колонка «Материал» — спокойная кнопка, модалка
  (описание + картинка) → edge materialRequest пишет material + историю.
- Иконка-«?» в строке размещения — расшифровка статуса (7 описаний).

Файлы: store, constants, MediaPage, SupplierServicePage, supplier-service.
SQL: не требуется. Деплой: supplier-service → сборка фронта → жёсткая перезагрузка.

## v1.30.80 — ЛК: «Мои» (мои новости), тариф в стиле CRM, блокировка без договора

- Блок «Рекламные размещения»: колонки с пропорциями (тариф шире, статус уже);
  тариф — как в CRM: «12 мес. · 18 000 ₽/мес.» тонкий шрифт, скидка −N% бейджем
  с фоном, сумма выделена шрифтом (без подложки).
- Блок «Договор»: новая кнопка-тумблер «Мои» (после «Добавить новость») —
  показывает блок «Мои новости» вместо «Медиа сервисы» и «Рекламные
  размещения», повторный клик возвращает. «Мои новости» — дизайн как у
  размещений (серые плашки bg-gray-50 rounded-xl): заголовок | ссылка | статус |
  дата. Данные — edge function (myNews в ответе).
- Без активированного договора недоступны: выбор формата (карточки disabled),
  «Добавить новость», «Мои» — серые, с подсказкой «Активируйте договор».

Файлы: SupplierServicePage, supplier-service/index.ts. SQL: не требуется.
Деплой: supplier-service → сборка фронта → жёсткая перезагрузка.

## v1.30.79 — ЛК: договор без заголовка, размещения — серые плашки без подписей

- Блок «Договор»: заголовок удалён; «Договор не найден — Активируйте Договор на
  размещение рекламы» — одной строкой с кнопками (кнопки в правом углу). При
  найденном договоре — строки №/Дата/Статус в той же строке с кнопками.
- «Рекламные размещения»: подписи колонок убраны; каждая строка — серая плашка
  bg-gray-50 rounded-xl (как условия DBS), 4 равные колонки.

Файлы: SupplierServicePage. SQL: не требуется. Деплой: сборка фронта.

## v1.30.78 — ЛК: «Рекламные размещения» — отдельная подложка, равномерные колонки, полный тариф

- Блок вынесен из карточки «Медиа сервисы» на свою подложку
  (relative bg-white border rounded-2xl p-5 sm:p-6 — как условия DBS).
- Строки — сетка 4 равномерных колонки (grid-cols-2 sm:grid-cols-4).
- Тариф полностью: срок · цена/мес · −N% (если есть) · итоговая сумма.
  Edge function: в select placements добавлены price_per_month, discount, total_price.

Файлы: SupplierServicePage, supplier-service/index.ts. SQL: не требуется.
Деплой: supplier-service → сборка фронта → жёсткая перезагрузка.

## v1.30.77 — ЛК: блок «Рекламные размещения», НДС-строка

- Модалка формата: «Все цены указаны с НДС.» — жирнее и крупнее, зелёная
  подложка (bg-green-100, текст green-800).
- ЛК → Продвижение: после «Медиа сервисы» новый блок «Рекламные размещения»
  (дизайн как условия DBS): строки с Тип рекламы | Тариф | Статус (цветной
  бейдж) | Период (дд.мм.гггг — дд.мм.гггг). Данные — размещения поставщика
  из media_records (edge function, placements в ответе POST).

Файлы: SupplierServicePage, supplier-service/index.ts. SQL: не требуется.
Деплой: supplier-service → сборка фронта → жёсткая перезагрузка.

## v1.30.76 — ЛК: toast/supabase импорты (модалки), НДС, статус договора «Новый», ссылка «Подробнее про форматы»

- Главный фикс: в SupplierServicePage отсутствовали импорты toast (sonner) и
  supabase — обработчики падали с ReferenceError, модалки не закрывались,
  загрузка картинки новости не работала бы. Оба импорта добавлены.
- Модалка формата: строка «Все цены указаны с НДС.» на выделенном фоне после
  выбора тарифа.
- Договор, отправленный из ЛК (активация), получает статус «Новый» (был
  «Активный»); защита от дублей — повтор без изменений.
- Блок «Медиа сервисы»: кнопка-чип «Подробнее про форматы» (правый угол),
  ссылка — новая настройка lkLinks.formats в Настройки → ЛК Поставщик →
  Ссылки офер (третья пара полей).

Файлы: SupplierServicePage, supplier-service, types, store, SettingsPage.
SQL: не требуется. Деплой: ОБЯЗАТЕЛЬНО supplier-service → сборка фронта →
жёсткая перезагрузка браузера.

## v1.30.75 — ЛК Продвижение: кнопки-чипы

Кнопки «Активировать договор» (зелёный фон) и «+ Добавить новость» — в стиле
чипов ЛК (rounded-full, обводка, text-xs px-3 py-1.5), как кнопки тарифов/городов.
Закрытие модалок подтверждено (по успешному ответу сервера) — требуется свежая
edge function supplier-service, иначе кнопки получают ошибку и модалка по факту
не закрывается.

Файлы: SupplierServicePage. SQL: не требуется.
Деплой: ОБЯЗАТЕЛЬНО `supabase functions deploy supplier-service --no-verify-jwt` →
сборка фронта → жёсткая перезагрузка (Ctrl+Shift+R).

## v1.30.74 — ЛК Продвижение: статус договора, кнопки, мелкие правки

- Статус договора — цветной бейдж с фоном без обводки (Новый — янтарный,
  Активный — зелёный, Не активный — серый).
- Кнопки «Активировать договор» (зелёный фон) и «+ Добавить новость» — в стиле
  «+ Добавить склад» (btn-primary, с иконкой Plus).
- Описание формата: серый фон показывается только если описание не пустое.
- Блок внимания в модалке формата — всегда (не только после выбора тарифа).
- Заголовок блока «Форматы» → «Медиа сервисы».
- (Автозакрытие обеих модалок подтверждено — уже работало.)

Файлы: SupplierServicePage. SQL: не требуется. Деплой: сборка фронта.

## v1.30.73 — Hotfix: SupplierServicePage не загружался (JSX-узлы в скобках)

1.30.72 перенёс комментарий из тега, но оставил его первым узлом в скобках колбэка
map: `( {/* */} <button>... )` — два соседних JSX-узла без фрагмента, модуль не
парсился («Failed to fetch dynamically imported module»). Комментарий перенесён
НАД map. Добавлен постоянный чек класса ошибок по всему src (0 вхождений).

Файлы: SupplierServicePage.tsx. SQL: не требуется. Деплой: сборка фронта.

## v1.30.72 — Hotfix: синтаксис SupplierServicePage (кнопки форматов)

Сборка 1.30.71 падала: JSX-комментарий оказался внутри тега кнопки формата
(между атрибутами) — «Expected '</', got '}'». Комментарий перенесён над кнопкой.
Добавлен постоянный чек на класс ошибок. Логика 1.30.71 не изменилась.

Файлы: SupplierServicePage.tsx. SQL: не требуется. Деплой: сборка фронта.

## v1.30.71 — ЛК Продвижение: тексты, подложки, кнопки

- «Договор не найден» → «Договор не найден — Активируйте Договор на размещение
  рекламы.».
- Блок «Форматы»: описание — с выделением подложкой (серая панель), hover —
  только тень (красный бордер убран).
- Модалка активации договора: текст — в контуре с подложкой.
- Модалка заявки на формат: кнопки как в активации договора («Отправить заявку»
  зелёная); после выбора тарифа — текст в контуре с подложкой («Обращаем ваше
  внимание: количество мест...»).
- Кнопка «Активировать договор» скрыта, если договор найден.

Файлы: SupplierServicePage. SQL: не требуется. Деплой: сборка фронта.

## v1.30.70 — ЛК: активация договора, белая подложка форматов

- ЛК → Продвижение: блок «Договор» — кнопка «Активировать договор» → модалка с
  текстом внимания (активация ни к чему не обязывает; подписание через ЭДО;
  добавьте идентификатор ЭДО в кабинете) и кнопками «Активировать»/«Отменить».
  Активация (edge function activateMediaContract) создаёт в Медиа → Договора
  договор БЕЗ номера и даты со статусом «Активный» (№ и дата — позже в CRM);
  повторная активация не дублирует.
- Блок «Форматы»: белая подложка (карточка), блоки со сдержанным стилем
  (тонкая рамка, мягкая тень, разделитель с ценой).
- Выбор договора (размещения, карточки, ЛК, edge): приоритет активному С НОМЕРОМ,
  чтобы пустой активный не подставлялся в размещения.

Файлы: SupplierServicePage, supplier-service/index.ts, MediaPage.
SQL: не требуется. Деплой: supplier-service → сборка фронта.

## v1.30.69 — Медиа: Новости рынка + добавление новости из ЛК

- Медиа сервис: новый вид «Новости» (после «Размещения»): таблица Поставщик |
  Заголовок | Ссылка | Текст | Материал (картинка) | Статус (Новая/Опубликована/
  Аннулирована) | Дата | Редактировать/Удалить. Форма: поставщик (из базы),
  заголовок*, ссылка, текст, загрузка картинки (Storage lk-assets), статус, дата.
  Хранилище settings.marketNews (тип MarketNewsItem), сид-миграция.
- ЛК поставщика → Продвижение → блок «Договор» (правый угол): кнопка «Добавить
  новость» — модалка (заголовок*, ссылка, текст, картинка) → edge function
  marketNewsRequest добавляет новость со статусом «Новая» от текущего поставщика.

Файлы: types, store, MediaPage, SupplierServicePage, supplier-service/index.ts.
SQL: не требуется. Деплой: supplier-service → сборка фронта.

## v1.30.68 — ЛК поставщика: раздел «Продвижение» (договор, форматы, заявка)

- ЛК → Продвижение: блок «Договор» (№, дата, статус — активный/последний договор
  поставщика из раздела «Договора» медиа).
- Блок «Форматы»: грид 3 в ряд, одинаковые кликабельные карточки (название,
  описание, цена от ₽/мес., hover-акцент).
- Клик по формату — модалка: выбор тарифа (срок · итог · скидка) и кнопка
  «Отправить заявку» — создаёт размещение в Медиа сервисе со статусом
  «Новый заказ», договором поставщика и историей «Заявка из ЛК (Продвижение)».
- Edge function supplier-service: ответ POST — mediaContract + adFormats;
  тело — mediaRequest (insert в media_records, без договора заявка отклоняется).

Файлы: SupplierServicePage, supplier-service/index.ts. SQL: не требуется.
Деплой: supplier-service → сборка фронта.

## v1.30.67 — Медиа: скидка в столбце «Тариф», размещение только с договором

- Таблица: в столбце «Тариф» показывается скидка бейджем (−N%), если есть.
  Скидка сохраняется в записи (MediaRecord.discount) при выборе тарифа;
  маппинг обе стороны + колонка media_records.
- Создание/сохранение размещения без договора поставщика невозможно —
  валидация с подсказкой создать договор в разделе «Договора».

SQL для боевой базы (ПЕРЕД выкладкой фронта):
```sql
ALTER TABLE media_records ADD COLUMN IF NOT EXISTS discount INTEGER;
```

Файлы: types, schema.sql, supabase.ts, MediaPage. Деплой: SQL → сборка фронта.

## v1.30.66 — Медиа: карточка без плиток, договор в таблице, единый ряд кнопок

- Карточка размещения: блок плиток (Тип рекламы / Спонсоры платформы / Тариф /
  Сумма / В месяц / Договор) удалён полностью.
- Таблица: под «Тип рекламы» второй строкой (мелкий серый шрифт) — договор
  поставщика: «Договор: № X от ДД.ММ.ГГГГ» (живой поиск из раздела «Договора»).
- Шапка: пять кнопок в порядке — Размещения, Договора, Добавить размещение,
  Добавить договор, Архив — одинаковый дизайн (btn-secondary, активная красной
  обводкой). «Архив» = существующий показ мягко удалённых записей (showArchived).

Файлы: MediaPage. SQL: не требуется. Деплой: сборка фронта.

## v1.30.65 — Медиа: карточка без заголовка, договор из справочника, кнопка договора в шапке, плитка «Тариф»

- Раскрытая карточка размещения: удалён заголовок «Карточка размещения:».
- Плитка «Договор» показывает договор живым поиском из раздела «Договора»
  (совпадение по поставщику/№, иначе активный/последний) — больше не прочерк,
  если договор есть; выводится №, дата и статус.
- Кнопка «Добавить договор» перенесена в шапку сразу после «Добавить размещение»
  (открывает раздел «Договора» и форму); кнопка внутри секции удалена.
- Плитка «Длительность» переименована в «Тариф»: срок · цена/мес.

Файлы: MediaPage. SQL: не требуется. Деплой: сборка фронта.

## v1.30.64 — Медиа: material/история/договор теперь сохраняются (мапперы), описание в правке, карточка грид-2

- Исправлено «материал не сохраняется»: mapMediaRecord/mapMediaRecordToDb не знали
  поля contractNo/contractDate/history/material — синхронизация перезаписывала
  локальные данные серверными. Маппинг обе стороны + колонки media_records.
- Настройки → Медиа → Форматы: поле «Описание» добавлено и в форму редактирования
  формата (раньше — только в создание).
- Карточка размещения: две колонки (грид 2) — сводка слева, блок «Материал»
  справа, по горизонтали.

SQL для боевой базы (ПЕРЕД выкладкой фронта — иначе upsert медиа упадёт целиком):
```sql
ALTER TABLE media_records ADD COLUMN IF NOT EXISTS contract_no TEXT;
ALTER TABLE media_records ADD COLUMN IF NOT EXISTS contract_date TEXT;
ALTER TABLE media_records ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE media_records ADD COLUMN IF NOT EXISTS material JSONB;
```

Файлы: supabase.ts, schema.sql, SettingsPage, MediaPage. Деплой: SQL → сборка фронта.

## v1.30.63 — Медиа: материал размещения, описание формата

- Карточка размещения: блок «Материал» — описание + файлы-картинки. Добавление/
  редактирование: textarea описания, загрузка изображений (Storage lk-assets,
  публичный бакет), превью с удалением, сохранение фиксируется в истории записи
  («Материал обновлён»). MediaRecord.material { description, files }.
- Настройки → Медиа → Форматы и тарифы: у формата размещения появилось поле
  «Описание» (создание и редактирование); в форме размещения описание выбранного
  формата показывается под селектом «Тип рекламы». MediaAdType.description.

Файлы: types, MediaPage, SettingsPage. SQL: не требуется. Деплой: сборка фронта.

## v1.30.62 — Медиа: раздел «Договора», авто-подстановка договора в размещение

- Медиа сервис: после «Добавить размещение» — раздел «Договора» (вкладки
  «Размещения» / «Договора»): таблица Поставщик | № договора | Дата | Статус
  (Новый/Активный/Не активный) | Действия (история / редактировать / удалить).
  Форма договора: поставщик, №, дата, статус; история изменений договора.
- Форма «Новое размещение»: поля «Договор размещения №» и «Дата договора»
  убраны — договор поставщика подставляется автоматически (активный, иначе
  последний по дате) и показывается строкой; № и дата пишутся в запись.
- Тип MediaContract, хранилище settings.mediaContracts, сид-миграция.

Файлы: types, store, MediaPage. SQL: не требуется. Деплой: сборка фронта.

## v1.30.61 — Медиа: столбец «Создан», история записи, договор размещения, тариф одной строкой

- Таблица размещений: новый столбец «Создан» (дата создания записи, компактный);
  перед «Редактировать» — иконка «История изменений» (модалка с записями: действие,
  дата/время, автор; фиксируются создание, изменение, аннулирование).
- Столбец «Тариф» — одной строкой, итоговая сумма выделена (жёлтый бейдж).
- Форма «Новое размещение»: перед «Краткая заметка» — «Договор размещения №» и
  «Дата договора»; поля сохраняются в записи и показываются в карточке (плитка
  «Договор»). MediaRecord: contractNo, contractDate, history.

Файлы: types, MediaPage. SQL: не требуется. Деплой: сборка фронта.

## v1.30.60 — История: оферта больше не пишется как «Склады», подписи задач/поддержки

- Edge function: принятие оферты (acceptOfferEdition) — самостоятельное сохранение
  с ранним выходом; общий логгер самообслуживания больше не дублирует запись
  полем «Склады» с сырым JSON. В общем логгере добавлена ветка serviceAccess.
- HistoryTab: подписи истории задач и поддержки — created «Создание», deleted
  «Удаление», taskStatus «Статус задачи», report «Отчёт».

Файлы: supplier-service/index.ts, HistoryTab.tsx. SQL: не требуется.
Деплой: supplier-service → сборка фронта.

## v1.30.59 — История: читаемое отображение (без сырых JSON)

- HistoryTab (общий для карточек): подписи служебных полей — «Ссылка
  самообслуживания», «Склады», «Условия проценки», «Оферта», «Создание записи».
- Значения истории форматируются по-русски: JSON serviceAccess → «ссылка выдана» /
  «PIN задан», warehouseLocations → «складов: N», serviceSearch → «условий: N»;
  прочие объекты — «данные обновлены». Сырые JSON больше не показываются.
- Edge function: запись о принятии оферты пишется в общем формате HistoryEntry
  (field 'offerAccepted', «Принята (редакция X)») — корректно отображается в
  карточке поставщика.

Файлы: HistoryTab.tsx, supplier-service/index.ts. SQL: не требуется.
Деплой: supplier-service → сборка фронта.

## v1.30.58 — Оферта: макет окна, ссылка в кабинете ЛК, принятие в истории

- Модалка оферты: макет строк — «Прочитать оферту: <Название>» (название ссылкой,
  открывает текст), реквизиты в сдержанной серой панели (редакция, даты).
- ЛК → Кабинет: под «Активные сервисы продаж» — ссылка «Прочитать оферту: <Название>
  (редакция X)» — открывает ту же модалку в режиме чтения (только «Закрыть»).
- Edge function: при acceptOfferEdition в историю поставщика пишется запись
  «Оферта принята (редакция X)» — видна в карточке поставщика → История.

Файлы: SupplierServicePage.tsx, supplier-service/index.ts. SQL: не требуется.
Деплой: supplier-service → сборка фронта.

## v1.30.57 — Оферта: заголовок, «Прочитать оферту», размер окна, кнопка НЕТ = выход

- Заголовок окна: «Согласие с публичной офертой».
- «Прочитать оферту» — текстовой строкой в ряду реквизитов (под датами), открывает
  окно чтения; название договора — ссылкой после неё.
- Окно чтения шире и выше (max-w-lg, область текста max-h-96).
- НЕТ: исправлен пустой экран — data больше не обнуляется (PIN-экрану нужны
  метаданные); кнопка выполняет функцию «Выход» — сессия чистится, возврат
  на страницу ввода PIN.

Файлы: SupplierServicePage.tsx. SQL: не требуется. Деплой: сборка фронта.

## v1.30.56 — Оферта: окно согласия в ЛК поставщика + кнопка «Договор оферты»

- Настройки → Договора и оферты: «Договор оферты» — кнопка в общем стиле разделов
  (как в ЛК Поставщик).
- ЛК поставщика: при первом заходе после ввода PIN (и при каждой новой редакции
  включённой оферты) — модальное окно «Согласен с офертой»: название (клик —
  чтение текста), редакция, дата публикации, дата вступления в силу. ДА (зелёная) —
  принимает оферту, редакция фиксируется; НЕТ (светло-серая) — выход на экран PIN.
- Edge function supplier-service: ответ POST — offer (включённый договор) +
  offerAcceptedEdition; тело — acceptOfferEdition (запись в service_access).
- Тип Supplier.serviceAccess + offerAcceptedEdition.

Файлы: types, SupplierServicePage, SettingsPage, supplier-service/index.ts.
SQL: не требуется. Деплой: supplier-service → сборка фронта.

## v1.30.55 — Настройки: вкладка «Договора и оферты» (договор оферты)

- Новая вкладка Настройки → «Договора и оферты» (после «ЛК Поставщик»), первая
  секция — «Договор оферты».
- CRUD договоров оферты: название, редакция, дата публикации, дата вступления
  в силу, текст (все поля обязательны). Редактирование существующих.
- Только один договор может быть включён («Сделать включённым» снимает флаг
  со всех остальных).
- Хранилище: settings.offerContracts (тип OfferContract), сид-миграция вне гейта.

Файлы: types, store, SettingsPage. SQL: не требуется. Деплой: сборка фронта.

## v1.30.54 — Hotfix: React key warning в MediaPage

records.map возвращал <>-фрагмент без key (key был на внутреннем <tr>) —
предупреждение «Each child in a list should have a unique key». Заменено на
<Fragment key={r.id}>, key с tr снят. Остальные списки проверены — key на месте.

Файлы: MediaPage.tsx. SQL: не требуется. Деплой: сборка фронта.

## v1.30.53 — ЛК: подсказка «Не активирован» — панель без фона (как совет по городам)

1.30.52 добавил затемнённый фон — лишнее. Теперь только anchored-панель: fixed,
под кнопкой по координатам, поверх всего (не обрезается overflow-hidden), без
бэкдропа — как «Совет по городам». Закрытие — повторный клик по кнопке.

Файлы: SupplierServicePage.tsx. SQL: не требуется. Деплой: сборка фронта.

## v1.30.52 — ЛК: порядок строк сводки, подсказка «Не активирован» поверх всего

- Сводка дашборда: строки «Проценка» (Подключено) и «Статус» поменяны местами —
  порядок: Проценка, Статус, Маркет, Продвижение.
- Кнопка «Не активирован»: подсказка теперь открывается fixed-оверлеем поверх всего
  (затемнение + блок под кнопкой по координатам, как «Совет по городам») — больше не
  обрезается overflow-hidden карточки сводки. Клик по фону закрывает.

Файлы: SupplierServicePage.tsx. SQL: не требуется. Деплой: сборка фронта.

## v1.30.51 — Hotfix: миграция статусов медиа падала (ps до инициализации)

1.30.50: блок миграции статусов медиа в store.ts обращался к ps.mediaRecords ДО
объявления const ps → ReferenceError → fail-safe возвращал сырые данные → вся
цепочка миграций обрывалась (статусы не переименовывались, сиды после блока не
выполнялись). Исправление: ремап записей размещений перенесён сразу после
инициализации ps (порядок: миграция статусов → merge-зид → ps → ремап записей).

Файлы: store.ts. SQL: не требуется. Деплой: сборка фронта.

## v1.30.50 — Hotfix: синтаксис SettingsPage (блок статусов медиа)

Сборка 1.30.49 падала: JSX-комментарий, вставленный перед div ветки тернария,
находился на недопустимой позиции (верхний уровень выражения). Комментарий
перенесён внутрь div. Логика 1.30.49 не изменилась.

Файлы: SettingsPage.tsx. SQL: не требуется. Деплой: сборка фронта.

## v1.30.49 — Медиа: реорганизация системных статусов + форма размещения

Системные статусы (Настройки → Медиа → Статусы медиа):
- «Запрос МК» → «Новый заказ»; «Отправлен МК» и «Переговоры» — удалены;
  «Ожидает места (предоплата)» → «Ожидает размещения»; добавлен «Заказ выполнен».
- У «Заканчивается срок» — автоматическое действие; описания статусов показываются
  под чипом в настройках (description).
- Миграция вне гейта (store.ts): переименование/удаление статусов + ремап записей
  размещений (удалённые статусы записей → «Новый заказ»).

Форма «Добавить размещение» (Медиа сервис):
- «Тип рекламы» — в списке только название.
- «Статус *» перенесён после «Тарифы и срок размещения» (перед «Период показа»).
- «Период показа» (дата начала/окончания) обязателен только при статусе
  «Активен на платформе» (required + звёздочки + валидация).

Файлы: types, store, constants, SettingsPage, MediaPage. SQL: не требуется.
Деплой: сборка фронта.

## v1.30.48 — Медиа: тарифы — срок обязателен, итого авторасчёт

Настройки → Медиа → Форматы и тарифы, добавление тарифа:
- Столбец «Срок *» (произвольный текст) убран. «Мес.» — обязательное поле
  «Срок Мес *» (ввод цифрами, валидация при сохранении).
- «Итого ₽» больше не вводится вручную — считается автоматически:
  цена/мес формата × срок в месяцах × (1 − скидка%/100), скидка необязательна.
- Под полем «Скидка %» добавлен комментарий «% скидки от суммы за весь срок».
- Таблица тарифов: колонка «Срок» → «Срок, мес.», значение — число месяцев.

Файлы: SettingsPage.tsx. SQL: не требуется. Деплой: сборка фронта.

## v1.30.47 — ЛК: кнопка «Не активирован» с подсказкой, радиус как у «Подробнее»

- Сводка дашборда, строка «Статус»: «Не активирован» — теперь кнопка, по клику
  открывает подсказку (паттерн «Совет по городам»): «Для активации на платформе
  создайте свой склад в разделе "Склады" и добавьте Условия для сервиса проценки.
  После модерации ваш склад станет активным.» Встроенный текст-подсказка под бейджем
  убран (переехал в popup).
- Скругление обеих кнопок статуса («Активирован»/«Не активирован») — rounded-md,
  размер как у «Подробнее» (px-2.5 py-1).

Файлы: SupplierServicePage.tsx. SQL: не требуется. Деплой: сборка фронта.

## v1.30.46 — ЛК: строка «Статус» (активация на платформе) в сводке дашборда

- Дашборд ЛК, карточка «Сводка по поставщику»: перед строкой «Проценка» добавлена
  строка «Статус» — статус активации НА ПЛАТФОРМЕ (Supplier.status), отдельно от
  статуса условий поставки. «Активный» → бейдж «Активирован» (bg-green-50 /
  text-green-700), остальные → «Не активирован» (bg-red-50 / text-red-700) +
  подсказка про создание склада и условий проценки. Бейдж размером как «Подробнее»,
  без бордера.
- Edge function supplier-service: колонка status в SELECT findSupplierByToken
  (существующая колонка) + поле status в ответе GET; фронт: data.status с мерджем
  при входе.

Файлы: SupplierServicePage.tsx, supplier-service/index.ts. SQL: не требуется.
Деплой: supplier-service → сборка фронта.

## v1.30.45 — ЛК/настройки: тексты, hover, ссылки офер

- ЛК, блок менеджера в ВЗ ЧАТ: плейсхолдер «Персональный менеджер доступен при
  активных услугах платформы.».
- Настройки → ЛК Поставщик → Ссылки офер: восстановлен блок (был утерян при срезах),
  подписи полей — «Маркет Подробнее» и «Продвижение Подробнее» (кнопки в ЛК).
- ЛК → Проценка → Доступные города: hover чипов городов — #64a2ef.
- Кнопки-фильтры «Есть условия» / «Нет условий»: hover красный (hover:border-red-300).

Файлы: SupplierServicePage.tsx, SettingsPage.tsx. SQL: не требуется. Деплой: сборка фронта.

## v1.30.44 — Hotfix: синтаксис SettingsPage, менеджер внутри блока ВЗ ЧАТ

- SettingsPage: исправлена сломанная строка объявления lkTab (состояния оператора
  склеились с декларацией — «Expression expected» при сборке).
- ЛК поставщика: блок «Персональный менеджер» перенесён ВНУТРЬ карточки ВЗ ЧАТ
  (под кнопку «Открыть ЧАТ»), как в v1.30.38: оператор настроен → карточка менеджера,
  не настроен → «Персональный менеджер не настроен».

Файлы: SettingsPage.tsx, SupplierServicePage.tsx. SQL: не требуется. Деплой: сборка фронта.

## v1.30.43 — ЛК поставщика: оператор, карточка менеджера, сетка счётчиков, MARKET

- Настройки → ЛК Поставщик: новая под-вкладка «Оператор» (первая в меню) — создание
  оператора/персонального менеджера как в v1.30.38: имя, телефон, email, аватар
  (Storage lk-assets), связь с пользователем CRM, MAX-ссылка; список с удалением.
  Хранилище — settings.lkOperators (тип LkOperator), сид-миграция вне гейта.
- ЛК поставщика, дашборд: возвращена карточка «Персональный менеджер» — показывает
  оператора (аватар, имя, телефон, email, чат MAX), если не настроен — окно
  «Персональный менеджер не настроен». Данные приходят ключом lkOperator из
  supplier-service (поиск по responsible_id).
- Дашборд, счётчики: сетка 5 в ряд (xl:grid-cols-5 вместо 6).
- Кабинет, «Активные сервисы продаж»: FBS → MARKET.
- Порядок под-вкладок ЛК в настройках: Оператор → Дашборд → Банеры → Новости →
  Приветствия → Ссылки офер (ссылки сразу после Приветствия).

Файлы: types, store, SettingsPage, SupplierServicePage, supplier-service/index.ts.
SQL: не требуется. Деплой: supplier-service → сборка фронта.

## v1.30.42 — ЛК поставщика: дашборд возвращён, доставочный функционал с дашборда убран

Срез фичи доставки ошибочно удалил из ЛК поставщика дашборд, кросс-докинг и продвижение
целиком. Восстановлено (версия 1.30.38): дашборд (приветствие, ВЗ ЧАТ, сводка анкеты,
проценка, МАРКЕТ, продвижение, склады, действия), вкладки «Кросс-докинг» и «Продвижение».

С дашборда удалён только доставочный функционал: карточка менеджера доставки, стат
«Городов доставки», строка «Доставка» со ссылкой «Договор» и кнопкой «Активировать»,
модалка активации. Edge function supplier-service снова не отдаёт delivery/deliveryCities
(edoFields-защита 1.30.40 сохранена).

Файлы: SupplierServicePage.tsx, supplier-service/index.ts. SQL: не требуется.
Деплой: `supabase functions deploy supplier-service --no-verify-jwt` → сборка фронта.

## v1.30.41 — Hotfix: удалена остаточная модалка тарифа в ЛК поставщика

В SupplierServicePage после среза фичи остался JSX-блок tariffModal (состояние было
удалено, блок нет) — сборка падала «tariffModal is not defined». Блок вырезан,
проведён полный аудит: висячих идентификаторов нет, баланс чисто.

Файлы: src/pages/supplier-service/SupplierServicePage.tsx. SQL: не требуется.

## v1.30.40 — Hotfix: устойчивость к миграции ЭДО (404 ЛК и синхрон)

- Edge function supplier-service: колонки edo_operator/edo_token вынесены из основного
  SELECT findSupplierByToken в отдельный запрос с фолбэком (урок ТЗ v1.23.36) — ЛК
  больше не падает с 404, если SQL-миграция ещё не прогнана.
- supabase.ts: защита всех точек записи suppliers/buyers (create/update/пакетный push) —
  при ошибке об отсутствии колонок edo_* пакет вырезается от этих ключей и запрос
  повторяется один раз; синхрон больше не умирает целиком до прогона SQL.
- Таблицы Поставщики/Покупатели: «ответственный» под датой показывается даже если
  серверное responsible_name пустое — фолбэк-lookup имени из users по responsibleId.

SQL: не требуется (миграция ЭДО — из v1.30.39, см. ниже; порядок: SQL → deploy
supplier-service → сборка фронта). Файлы: supplier-service/index.ts, supabase.ts,
SuppliersPage.tsx, BuyersPage.tsx.

# MIGRATION — история версий ВСЕМЗАПЧАСТИ CRM

## v1.30.39 — Удаление сервиса доставки (полный срез фичи)

Фича «Доставка» (DBO) удалена полностью — код, настройки, типы, документация.

Файлы:
- Удалены: src/pages/delivery/ (DeliveryPage.tsx, DeliverySupplierCardPage.tsx).
- Изменены: App.tsx (роуты), navConfig.ts, types/index.ts, store.ts, constants/index.ts,
  supabase.ts, supabase/schema.sql, AnalyticsPage.tsx, SettingsPage.tsx (секция «Доставка»,
  вкладка «Персональный менеджер» ЛК), SupplierCardPage.tsx (вкладка «Доставка (DBO)»),
  SupplierServicePage.tsx (раздел «Доставка» ЛК /s/), supabase/functions/supplier-service/index.ts.

Что перенесено:
- ЭДО: поля edoOperator/edoToken перенесены из delivery_contract на верхний уровень Supplier
  и на колонки suppliers.edo_operator / suppliers.edo_token (маппинг обе стороны).
- Сервис проценки (DBS), склады, условия ТК (deliverySchedule/deliveryTime складов) — без
  изменений, не являются частью удалённой фичи.

SQL для боевой базы (выполнить в указанном порядке):
```sql
-- 1. ЭДО: новые колонки + миграция данных из delivery_contract
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS edo_operator TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS edo_token TEXT;
UPDATE suppliers SET edo_operator = COALESCE(edo_operator, delivery_contract->>'edoOperator')
  WHERE delivery_contract ? 'edoOperator';
UPDATE suppliers SET edo_token = COALESCE(edo_token, delivery_contract->>'edoToken')
  WHERE delivery_contract ? 'edoToken';
-- 2. Удаление колонок доставки
ALTER TABLE suppliers DROP COLUMN IF EXISTS delivery_access;
ALTER TABLE suppliers DROP COLUMN IF EXISTS delivery_contract;
-- 3. Чистка ключей доставки в настройках (app_settings, JSONB)
UPDATE app_settings
SET settings = settings
  - 'deliveryCities' - 'deliveryOperators' - 'deliveryContractStatuses'
  - 'deliveryTaskStatuses' - 'deliveryServiceTariffs' - 'deliveryCityTariffs'
  - 'deliveryRoutes' - 'deliveryCityMinSuppliers' - 'deliveryCityRows'
  - 'deliveryTasks' - 'deliveryCitySchedules'
WHERE id = 'global';
-- 4. Удаление системного сервиса DBO из справочника сервисов
UPDATE app_settings
SET settings = jsonb_set(settings, '{supplierServices}', (
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements(settings->'supplierServices') elem
  WHERE elem->>'name' <> 'DBO'
))
WHERE id = 'global';
```

Деплой: SQL → `supabase functions deploy supplier-service --no-verify-jwt` → сборка фронта → monitor-server (без изменений).

