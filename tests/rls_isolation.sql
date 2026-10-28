-- ═══════════════════════════════════════════════════════════════════════════
-- tests/rls_isolation.sql (v1.32.0) — pgTAP: изоляция доменов в RLS
--
-- Запуск (на чистом PG15 в Docker или на сервере):
--   pg_prove -U postgres tests/rls_isolation.sql
-- Требования: применены migrations/0001..0004 (или schema.sql v1.32.0+).
-- Файл транзакционный: данные и роль app_user откатываются после прогона.
-- ═══════════════════════════════════════════════════════════════════════════

-- Bootstrap (вне транзакции pgTAP недопустим CREATE ROLE — делаем в DO, откатится с тестом).
SET ROLE postgres;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE ON public.suppliers, public.buyers TO app_user;

BEGIN;

SELECT plan(7);

-- ─── Фикстуры ────────────────────────────────────────────────────────────────
\set admin_uuid   '11111111-1111-4111-8111-111111111111'
\set emp_uuid     '22222222-2222-4222-8222-222222222222'
\set domain_b     '33333333-3333-4333-8333-333333333333'
\set sup_default  '44444444-4444-4444-8444-444444444444'
\set sup_b        '55555555-5555-4555-8555-555555555555'
\set default_uuid '00000000-0000-4000-8000-000000000001'

INSERT INTO public.profiles (id, email, role)
VALUES (:'admin_uuid', 'admin@test', 'admin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.commerce_domains (id, host, name, is_active)
VALUES (:'domain_b', 'test-b.vz', 'Домен B', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.app_settings (id, settings)
VALUES ('global', '{"users":[]}'::jsonb)
ON CONFLICT (id) DO NOTHING;
UPDATE public.app_settings
SET settings = settings || jsonb_build_object(
  'users', COALESCE(settings -> 'users', '[]'::jsonb) ||
    jsonb_build_object(
      'id',          :'emp_uuid',
      'email',       'emp@test',
      'status',      'active',
      'permissions', '{"suppliers": true, "buyers": true}'::jsonb
    )
)
WHERE id = 'global'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(settings -> 'users') u
    WHERE u ->> 'id' = :'emp_uuid'
  );

-- Поставщики: один на дефолт-домене, один на домене B (insert под владельцем — RLS не мешает).
INSERT INTO public.suppliers (id, name, trade_name, type, city, contact_name, phone, email, domain_id)
VALUES (:'sup_default', 'Поставщик Default', 'ТД Default', 'Поставщик/склад', 'Москва', 'Иван', '79990000001', 'd@test', :'default_uuid')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.suppliers (id, name, trade_name, type, city, contact_name, phone, email, domain_id)
VALUES (:'sup_b', 'Поставщик B', 'ТД B', 'Поставщик/склад', 'Казань', 'Пётр', '79990000002', 'b@test', :'domain_b')
ON CONFLICT (id) DO NOTHING;

-- ─── Проверки ────────────────────────────────────────────────────────────────
-- Работаем глазами менеджера (emp_uuid) — НЕ админа.
SELECT set_config('request.jwt.claims',
  jsonb_build_object('sub', :'emp_uuid')::text, true);
SET ROLE app_user;

-- 1. Без клейма domain_id → не видит ни одного поставщика.
SELECT is(
  (SELECT count(*) FROM public.suppliers)::bigint,
  0::bigint,
  '1. без domain_id в клейме → 0 строк'
);

-- 2. Клейм домена B → default-поставщик невидим.
SELECT set_config('request.jwt.claims',
  jsonb_build_object('sub', :'emp_uuid', 'domain_id', :'domain_b')::text, true);
SELECT is(
  (SELECT count(*) FROM public.suppliers)::bigint,
  1::bigint,
  '2. домен B видит только своего поставщика'
);

-- 3. INSERT поставщика с чужим domain_id → отклонён.
SELECT throws_ok(
  format($q$INSERT INTO public.suppliers (id, name, trade_name, type, city, contact_name, phone, email, domain_id)
          VALUES ('%s', 'X', 'X', 'Поставщик/склад', 'Москва', 'X', '79990000003', 'x@test', '%s')$q$,
          '66666666-6666-4666-8666-666666666666', :'default_uuid'),
  'new row violates row-level security policy for table "suppliers"',
  '3. INSERT с чужим доменом отклонён (WITH CHECK)'
);

-- 4. UPDATE записи чужого домена → строка не изменилась (фильтр USING, фикс 0002).
-- ROW_COUNT из psql-скрипта недоступен — проверяем результат как владелец (вне RLS).
UPDATE public.suppliers SET name = 'Взлом' WHERE id = :'sup_default';
RESET ROLE;
SELECT is(
  (SELECT name FROM public.suppliers WHERE id = :'sup_default'),
  'Поставщик Default',
  '4. UPDATE чужого домена не изменил строку (USING-фильтр)'
);
SET ROLE app_user;

-- 5. UPDATE своего домена с переносом в чужой домен → отклонён (WITH CHECK).
SELECT throws_ok(
  format($q$UPDATE public.suppliers SET domain_id = '%s' WHERE id = '%s'$q$, :'default_uuid', :'sup_b'),
  'new row violates row-level security policy for table "suppliers"',
  '5. UPDATE со сменой домена на чужой отклонён (WITH CHECK)'
);

-- 6. Клейм default-домена → видит своего, B-шного — нет (симметрия).
SELECT set_config('request.jwt.claims',
  jsonb_build_object('sub', :'emp_uuid', 'domain_id', :'default_uuid')::text, true);
SELECT is(
  (SELECT count(*) FROM public.suppliers WHERE id = :'sup_b')::bigint,
  0::bigint,
  '6. default-домен не видит B-домен (симметрия)'
);

RESET ROLE;
-- 7. Дефолтный домен существует и активен (инвариант приложения).
SELECT ok(
  (SELECT is_active FROM public.commerce_domains WHERE id = :'default_uuid'),
  '7. дефолтный домен существует и активен'
);

SELECT * FROM finish();
ROLLBACK;
