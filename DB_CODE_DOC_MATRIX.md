# ВсемЗапчасти CRM v1.18.34 — финальная матрица «код ↔ БД ↔ документация"

Дата проверки: 2026-09-20  
Источник: полный архив `vzcrm_v1.18.34 (1).zip`.

## 1. Итог

**Статус исходного `supabase/schema.sql`: НЕ готов для чистой установки с нуля.**

Основные причины:

1. Схема собрана как история миграций, а не как единый baseline.
2. В `profiles` политика создаётся раньше функции `is_admin()`. На пустом Supabase это может остановить выполнение schema.sql на `CREATE POLICY`.
3. `buyers` имеют конфликт имён `location_count` / `locations_count` между UI, `supabase.ts`, public-form и финальной БД.
4. `suppliers` маппер читает несуществующее для поставщика поле `locations_count`.
5. Документация называет schema.sql идемпотентным и безопасным для существующей БД, хотя задача нового развёртывания требует другого baseline-файла.

Для первой установки подготовлен отдельный файл:

`supabase/schema.clean.sql`

Он содержит финальное состояние таблиц, функций, триггеров, RLS, storage и realtime без исторических ALTER/миграций.

---

## 2. Матрица таблиц

| Объект БД | Код | Документация | Статус | Комментарий |
|---|---|---|---|---|
| `suppliers` | `src/lib/supabase.ts`, страницы suppliers, supplier-service, public-form | README, MIGRATION | ⚠️ | Структура в целом соответствует; исходная схема добавляет часть полей поздними ALTER. Clean schema собирает их сразу. |
| `buyers` | `src/lib/supabase.ts`, BuyersPage, BuyerCardPage, public-form | README, MIGRATION | ❌ | Конфликт `location_count` / `locations_count`. Каноническое имя в clean DB: `locations_count`. Код требует исправления в 3 местах. |
| `tasks` | `src/lib/supabase.ts`, TasksPage, PlanFact | README, MIGRATION | ✅ | Поля `history`, `resolved_at`, `deleted_at`, `responsible_*`, `priority` учтены. |
| `tickets` | `src/lib/supabase.ts`, TicketCardPage, SupportPage, public-form | README, MIGRATION | ✅ | `task_id` канонически UUID + FK на `tasks(id)`. |
| `media_records` | `src/lib/supabase.ts`, MediaPage | README, MIGRATION | ✅ | `responsible_*`, цены и диапазон дат учтены. |
| `app_settings` | `src/lib/supabase.ts`, store, public-form, supplier-service | README, MIGRATION | ⚠️ | JSONB-модель соответствует архитектуре. Clean schema устраняет исторические NOT NULL hotfix'ы. |
| `profiles` | `auth.ts`, create-manager, update-manager | README | ⚠️ | Исходный schema.sql создаёт policy до `is_admin()`. Clean schema исправляет порядок. |
| `user_access` | RLS functions, auth, settings | README/MIGRATION | ✅ | Серверная копия ограничений менеджера сохранена. |
| `app_logs` | `src/lib/log.ts`, Settings/DB | README | ✅ | INSERT authenticated, SELECT admin, ограничения уровня/длины сообщения. |
| Storage `knowledge` | `src/lib/supabase.ts`, Settings | README | ✅ | Bucket public; upload/update active employee; delete admin. |
| Realtime | `src/lib/realtime.ts`, `src/lib/supabase.ts` | schema comments | ✅ | 6 таблиц: suppliers, buyers, tasks, tickets, media_records, app_settings. |

---

## 3. Матрица ключевых полей

### Suppliers

| Кодовое поле | DB | Статус |
|---|---|---|
| `tradeName` | `trade_name` | ✅ |
| `contactRole` | `contact_role` | ✅ |
| `contactPrefs` | `contact_prefs` JSONB | ✅ |
| `warehouseCount` | `warehouse_count` | ✅ |
| `skuCount` | `sku_count` | ✅ |
| `warehouseLocations` | `warehouse_locations` JSONB | ✅ |
| `productGroups` | `product_groups` TEXT[] | ✅ |
| `ownBrands` | `own_brands` TEXT[] | ✅ |
| `services` | `services` TEXT[] | ✅ |
| `multiWarehouse` | `multi_warehouse` | ✅ |
| `companyScore` | `company_score` | ✅ |
| `category` | `category` | ✅ |
| `scoring` | `scoring` JSONB | ✅ |
| `requisites` | `requisites` JSONB | ✅ |
| `serviceSearch` | `service_search` JSONB | ✅ |
| `serviceAccess` | `service_access` JSONB | ✅ |
| `history` | `history` JSONB | ✅ |
| `responsibleId` | `responsible_id` | ✅ |
| `responsibleName` | `responsible_name` | ✅ |
| `createdBy` | `created_by` UUID FK | ✅ |

**Отдельное замечание:** `mapSupplier()` читает `row.locations_count`, но у `suppliers` такого поля нет и оно не используется моделью `Supplier`. Это лишний mapping, который следует убрать из кода.

### Buyers

| Кодовое поле | DB | Статус |
|---|---|---|
| `tradeName` | `trade_name` | ✅ |
| `contactPrefs` | `contact_prefs` JSONB | ✅ |
| `locationCount` | **должно маппиться в `locations_count`** | ❌ |
| `locationsCount` | `locations_count` | ✅ |
| `companyScore` | `company_score` | ✅ |
| `category` | `category` | ✅ |
| `scoring` | `scoring` JSONB | ✅ |
| `requisites` | `requisites` JSONB | ✅ |
| `history` | `history` JSONB | ✅ |
| `responsibleId` | `responsible_id` | ✅ |
| `responsibleName` | `responsible_name` | ✅ |
| `createdBy` | `created_by` UUID FK | ✅ |

### Tasks

| Код | DB | Статус |
|---|---|---|
| `entityType` | `entity_type` | ✅ |
| `entityId` | `entity_id` UUID | ✅ |
| `entityName` | `entity_name` | ✅ |
| `dueDate` | `due_date` | ✅ |
| `taskStatus` | `task_status` | ✅ |
| `completed` | `completed` | ✅ |
| `resolvedAt` | `resolved_at` | ✅ |
| `deletedAt` | `deleted_at` | ✅ |
| `priority` | `priority` | ✅ |
| `history` | `history` JSONB | ✅ |
| `responsibleId/Name` | `responsible_id/name` | ✅ |
| `leadIds/entityIds` | не отдельные DB-поля | ⚠️ | Это поля экспорта/задачи в клиентской модели; не должны попадать в DB mapper. |

### Tickets

| Код | DB | Статус |
|---|---|---|
| `type` | `type` | ✅ |
| `category` | `category` | ✅ |
| `status` | `status` | ✅ |
| `contactPref` | `contact_pref` | ✅ |
| `contactPrefs` | `contact_prefs` JSONB | ✅ |
| `taskId` | `task_id` UUID FK | ✅ |
| `priority` | `priority` | ✅ |
| `subject` | `subject` | ✅ |
| `text` | `text` | ✅ |
| `contactName/Phone/Email` | snake_case columns | ✅ |
| `entityType/Id` | snake_case columns | ✅ |
| `responsibleId/Name` | snake_case columns | ✅ |
| `history` | `history` JSONB | ✅ |
| `fromApi` | `from_api` | ✅ |

### Media

| Код | DB | Статус |
|---|---|---|
| `supplierId` | `supplier_id` FK | ✅ |
| `supplierName` | `supplier_name` | ✅ |
| `adTypeId/Name` | `ad_type_id/name` | ✅ |
| `durationOptionId/Label` | `duration_option_id/label` | ✅ |
| `pricePerMonth` | `price_per_month` | ✅ |
| `totalPrice` | `total_price` | ✅ |
| `startDate/endDate` | `start_date/end_date` | ✅ |
| `responsibleId/Name` | snake_case | ✅ |
| `deletedAt` | `deleted_at` | ✅ |

---

## 4. Критический конфликт `locations_count`

Фактические места в проекте:

- `src/lib/supabase.ts:229` читает `row.location_count`.
- `src/lib/supabase.ts:264` пишет `location_count`.
- `src/lib/supabase.ts:267` уже умеет писать `locations_count`.
- `src/pages/buyers/BuyersPage.tsx` использует `locationsCount`.
- `src/pages/buyers/BuyerCardPage.tsx` использует `locationCount`.
- `supabase/functions/public-form/index.ts:427` пишет `location_count`.
- исходный `schema.sql` сначала создаёт `location_count`, затем переименовывает его в `locations_count`.

### Канон для новой базы

`public.buyers.locations_count INTEGER NOT NULL DEFAULT 0`

### Необходимый code fix перед production

1. `mapBuyer()` → читать `row.locations_count` и отдавать `locationCount` либо перейти полностью на `locationsCount`.
2. `mapBuyerToDb()` → убрать запись `db.location_count`; маппить обе camelCase формы только в `db.locations_count`, если обратная совместимость UI нужна.
3. `public-form` → заменить `location_count` на `locations_count`.
4. `types/index.ts` желательно оставить одно каноническое поле `locationsCount`, либо сделать явный compatibility alias без второго DB mapping.
5. `BuyerCardPage.tsx` привести к тому же каноническому имени.

---

## 5. Edge Functions ↔ DB

| Edge Function | DB dependencies | Статус |
|---|---|---|
| `create-manager` | `auth.users`, `profiles` | ✅ |
| `update-manager` | `auth.users`, `profiles` | ✅ |
| `public-form` | `app_settings`, `suppliers`, `buyers`, `tickets` | ⚠️ | `buyers.location_count` требует исправления на `locations_count`. |
| `supplier-service` | `suppliers`, `app_settings` | ✅ |
| `checko` | внешний Checko API; DB через вызывающий код | ✅/вне DB baseline |

`public-form` и `supplier-service` используют service-role сервером; клиентский RLS для этих операций не является частью их write path.

---

## 6. RLS / security matrix

| Контур | Ожидание проекта | Clean schema | Статус |
|---|---|---|---|
| Profiles | user сам / admin | Да | ✅ |
| Suppliers SELECT | active + section + type/city | Да | ✅ |
| Buyers SELECT | active + section + type/city | Да | ✅ |
| Tasks SELECT | active + tasks permission | Да | ✅ |
| Tickets SELECT | active + support + type | Да | ✅ |
| Media SELECT | active + media permission | Да | ✅ |
| Settings SELECT | active employee | Да | ✅ |
| Supplier/Buyer INSERT | active + section + `created_by=auth.uid()` | Да | ✅ |
| Task/Ticket/Media INSERT | active + section | Да | ✅ |
| Main UPDATE | active employee | Да | ✅ |
| Main DELETE | admin + active | Да | ✅ |
| app_logs INSERT | authenticated | Да | ✅ |
| app_logs SELECT | admin | Да | ✅ |
| settings UPDATE | active employee + global | Да | ✅ |
| settings sensitive keys | non-admin cannot alter users/dbLogs/forms | Да | ✅ |
| Knowledge upload/update | active employee | Да | ✅ |
| Knowledge delete | admin | Да | ✅ |

---

## 7. Документация ↔ фактическая реализация

| Документ | Проверка | Статус | Что нужно сделать |
|---|---|---|---|
| `README.md` | установка Supabase | ⚠️ | Для нового baseline ссылаться на `supabase/schema.clean.sql`, а не на исторический `schema.sql`. |
| `README.md` | первый admin | ⚠️ | Сохранить ручное назначение `profiles.role='admin'`; это соответствует текущей архитектуре. |
| `README.md` | Vercel/Supabase | ✅ | Соответствует. |
| `READMEstart.md` | SQL установка | ⚠️ | Указать clean schema. |
| `MIGRATION.md` | история v1.x | ℹ️ | Оставить как исторический журнал; не использовать как baseline новой БД. |
| `PRODUCTION_RELEASE.md` | security fixes | ✅/ℹ️ | Фактически clean schema уже включает соответствующие security fixes. |
| `README.SERVER.md` | server/domain | ✅ | Не влияет на структуру Supabase. |

---

## 8. Что намеренно НЕ вынесено в отдельные таблицы

Следующие данные по архитектуре проекта остаются внутри `app_settings.settings` JSONB:

- users / roles / permissions;
- supplierTypes;
- buyerTypes;
- ticketTypes;
- cities;
- productGroups;
- sources;
- supplierServices;
- dbLogs;
- forms;
- taskEntityTypes;
- taskTypes;
- contactPrefs;
- greetings;
- mediaAdTypes;
- mediaStatuses;
- knowledgeItems;
- knowledgeCategories;
- leads;
- planFact;
- planCities.

Это соответствует текущему `AppSettings`/store-подходу. Отдельные таблицы для этих объектов в clean schema **не добавлялись**, чтобы не менять архитектуру приложения.

---

## 9. Финальный статус

### Готово

- финальное состояние DB-таблиц собрано в одном baseline;
- исторические `ALTER TABLE` и условные миграции убраны;
- `app_settings.settings` сразу `NOT NULL DEFAULT '{}'`;
- `buyers.locations_count` сразу создаётся с финальным именем;
- `tickets.task_id` сразу UUID + FK;
- `responsible_*` сразу присутствуют во всех пяти основных сущностях;
- `multi_warehouse` сразу присутствует у suppliers;
- RLS/security functions расположены в корректном порядке;
- storage/realtime включены в baseline;
- исправлен порядок создания `is_admin()` до политики `profiles`.

### Осталось перед production

**Обязательно:** исправить `location_count` → `locations_count` в frontend mapper/public-form.

**Желательно:** убрать из `Supplier`/`mapSupplier()` несуществующий `locationsCount`.

**Документация:** заменить ссылки на исторический `schema.sql` на clean baseline и явно отделить его от `MIGRATION.md`.

---

## 10. Файлы результата

- `supabase/schema.clean.sql` — чистая схема для первой установки.
- `DB_CODE_DOC_MATRIX.md` — эта матрица.
