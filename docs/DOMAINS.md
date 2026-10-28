# Домены (мультитенантность) — как это работает

> v1.31.11 · Схема: `commerce.domains` + tenant-столбец `domain_id` у suppliers/buyers.
> Релизный SQL: `docs/release_1.31.11.sql`. Тесты: `supabase/tests/database/domains_test.sql`.

## 1. Модель

- **Домен — арендатор.** Таблица `commerce.domains`: `id`, `host` (уникальный, напр. `lk.pro`),
  `name`, `title` (титул вкладки ЛК), `greeting`, `banner_image`, `banner_link`, `is_active`.
- **Дефолт-домен** — фиксированный UUID `00000000-0000-4000-8000-000000000001`, host `default`.
  Все существующие данные принадлежат ему.
- **Tenant-столбец.** `suppliers.domain_id` / `buyers.domain_id` → `NOT NULL REFERENCES commerce.domains`.
  **DEFAULT нет намеренно**: INSERT без домена падает с ошибкой — непропатченный код виден сразу,
  а не молча пишет в default.
- **Денормализация решена для будущего торгового домена:** `offers.domain_id` (дублирует suppliers),
  `orders.domain_id` (фиксируется из buyer при создании), `shipments.domain_id` (из order).
  RLS без JOIN'ов.

## 2. Как определяется домен сессии

`public.current_domain_id()` (STABLE, SECURITY DEFINER):

1. Клейм `domain_id` из JWT (`request.jwt.claims`) — основной путь.
2. Клейма нет → **NULL** для обычного пользователя. RLS не пропускает ни одну строку.
   **Молчаливого фолбэка нет** — сбой клейма = явный отказ, а не просмотр чужого домена.
3. Фолбэк на default — только для `admin` (временная привилегия фазы 1, пока CRM однодоменная).

## 3. RLS

Все политики чтения/вставки/обновления suppliers/buyers содержат условие домена
(см. `release_1.31.11.sql`): чужой домен невидим и не записывается; `admin` видит всё.

## 4. ЛК поставщика — отдельный путь

ЛК **не использует** `current_domain_id()`. Изоляция естественная: токен → свой поставщик →
его `domain_id`. Брендинг: RPC `get_supplier_with_domain(token)` возвращает поставщика и его
домен **одной транзакцией**; edge function отдаёт `lkDomain { host, title, greeting }`;
титул вкладки — из домена (приоритет над общим `cabinetTitle`).

Ссылки самообслуживания строятся на `host` домена поставщика: `https://{host}/s/{token}`.

## 5. CRM сегодня (фаза 1)

Все менеджеры — на default-домене (клейм `domain_id` в JWT появится в фазе 2 через Auth Hook).
Мапперы фронта всегда отправляют `domain_id` (fallback `DEFAULT_DOMAIN_ID` в constants).

## 6. Дорожная карта

| Фаза | Что |
|---|---|
| **1 (текущая)** | Домены-таблица, tenant у suppliers/buyers, RLS, RPC, ЛК-брендинг, CRUD доменов в Настройках |
| 2 | Клейм `domain_id` в JWT менеджеров (Custom Access Token Hook), переключатель домена в CRM, изоляция tasks/tickets/media |
| 3 | Маркет на своём домене (тот же механизм), изоляция торгового домена `commerce.*` |

## 7. Выкладка и откат

Порядок: `release_1.31.11.sql` → `supabase functions deploy supplier-service` → сборка фронта.
⚠️ NOT NULL требует обновлённый фронт одновременно (мапперы отправляют domain_id).
Откат: политики — из schema.sql предыдущей версии; `DROP COLUMN domain_id`; таблицу `domains` оставить.
Тесты: `supabase test db` — 4 теста, ключевой: «без клейма → 0 строк».
