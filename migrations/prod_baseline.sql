-- ═══════════════════════════════════════════════════════════════════════════
-- prod_baseline.sql (v1.35.1) — ЕДИНЫЙ файл схемы для ЧИСТЫХ установок.
--
-- Собран из migrations/0001…0007 в проверенном порядке; все операции идемпотентны
-- (IF NOT EXISTS / DROP … IF EXISTS / DO-блоки). Для СУЩЕСТВУЮЩЕЙ базы с данными
-- этот файл НЕ нужен — применяйте только недостающие 000N (см. MIGRATION.md).
-- Порядок применения: этот файл → seed данных (при необходимости) → готово.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0001_baseline.sql ───
-- ═══════════════════════════════════════════════════════════════════════════
-- 0001_baseline.sql (v1.34.2) — ЧИСТЫЙ baseline для PostgreSQL (без Supabase).
-- Применяется на пустую базу: psql -U postgres -d erp -f 0001_baseline.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- SCHEMAS
-- ============================================================
CREATE SCHEMA IF NOT EXISTS commerce;
COMMENT ON SCHEMA commerce IS 'Торговый домен (parts, offers, orders, shipments) — только сюда. CRM — в public.*';

-- ============================================================
-- ROLES (v1.35.3: миграция создаёт прикладные роли сама; ручной сценарий
-- CREATE ROLE из README не ломается — существующие роли пропускаются)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_pass';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin LOGIN PASSWORD 'admin_pass' BYPASSRLS;
  END IF;
  -- легаси-роль Supabase-эпохи: без неё падают CREATE POLICY/GRANT ... TO authenticated;
  -- под ней никто не подключается (API ходит как app_user/app_admin)
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

-- права прикладных ролей выдаются ПОСЛЕ создания всех таблиц — в конце файла.

-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE public.suppliers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                TEXT NOT NULL,
  trade_name          TEXT NOT NULL,
  city                TEXT NOT NULL,
  address             TEXT,
  website             TEXT,
  inn                 TEXT,
  contact_role        TEXT,
  contact_name        TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'В работе',
  source              TEXT,
  contact_pref        TEXT,
  contact_prefs       JSONB NOT NULL DEFAULT '[]'::jsonb,
  warehouse_count     INTEGER NOT NULL DEFAULT 0,
  sku_count           INTEGER NOT NULL DEFAULT 0,
  warehouse_locations JSONB NOT NULL DEFAULT '[]'::jsonb,
  product_groups      TEXT[] NOT NULL DEFAULT '{}',
  own_brands          TEXT[] NOT NULL DEFAULT '{}',
  services            TEXT[] NOT NULL DEFAULT '{}',
  multi_warehouse     BOOLEAN NOT NULL DEFAULT FALSE,
  company_score       SMALLINT NOT NULL DEFAULT 5 CHECK (company_score BETWEEN 0 AND 10),
  category            TEXT NOT NULL DEFAULT 'C',
  comment             TEXT,
  scoring             JSONB,
  requisites          JSONB,
  multiWarehouse      BOOLEAN NOT NULL DEFAULT FALSE,
  service_search      JSONB NOT NULL DEFAULT '[]'::jsonb,
  service_access      JSONB,
  history             JSONB NOT NULL DEFAULT '[]'::jsonb,
  additional_contacts TEXT,
  additional_comment  TEXT,
  edo_operator        TEXT,
  edo_token           TEXT,
  external_id         TEXT,
  external_source     TEXT,
  public_id           TEXT,
  from_api            BOOLEAN NOT NULL DEFAULT FALSE,
  created_by          UUID,
  responsible_id      UUID,
  responsible_name    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  -- v1.34.2: поля, которые использует LkService/SyncService (были только в Supabase-схеме)
  price_email             TEXT,
  lk_news_json            TEXT,
  lk_news                 JSONB,
  lk_offer_edition        TEXT,
  lk_offer_accepted_at    TIMESTAMPTZ,
  media_warehouse         TEXT,
  media_warehouse_address TEXT,
  media_contract_json     TEXT,
  media_contract          JSONB,
  cab_edo                 TEXT
);

CREATE TABLE public.buyers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                TEXT NOT NULL,
  trade_name          TEXT NOT NULL,
  city                TEXT NOT NULL,
  address             TEXT,
  website             TEXT,
  inn                 TEXT,
  contact_role        TEXT,
  contact_name        TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'В работе',
  source              TEXT,
  contact_pref        TEXT,
  contact_prefs       JSONB NOT NULL DEFAULT '[]'::jsonb,
  locations_count     INTEGER NOT NULL DEFAULT 0,
  company_score       SMALLINT NOT NULL DEFAULT 5 CHECK (company_score BETWEEN 0 AND 10),
  category            TEXT NOT NULL DEFAULT 'C',
  comment             TEXT,
  scoring             JSONB,
  requisites          JSONB,
  history             JSONB NOT NULL DEFAULT '[]'::jsonb,
  additional_contacts TEXT,
  additional_comment  TEXT,
  external_id         TEXT,
  external_source     TEXT,
  public_id           TEXT,
  from_api            BOOLEAN NOT NULL DEFAULT FALSE,
  created_by          UUID,
  responsible_id      UUID,
  responsible_name    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE TABLE public.tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     TEXT NOT NULL DEFAULT 'none',
  entity_id       UUID,
  entity_name     TEXT,
  title           TEXT NOT NULL,
  description     TEXT,
  due_date        DATE NOT NULL,
  task_status     TEXT NOT NULL DEFAULT 'Новая',
  completed       BOOLEAN NOT NULL DEFAULT FALSE,
  history         JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolved_at     TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  priority        SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 0 AND 5),
  created_by      UUID,
  responsible_id  UUID,
  responsible_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL DEFAULT 'Вопрос',
  category        TEXT,
  status          TEXT NOT NULL DEFAULT 'Новая',
  contact_pref    TEXT,
  contact_prefs   JSONB NOT NULL DEFAULT '[]'::jsonb,
  task_id         UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  priority        SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 0 AND 5),
  subject         TEXT NOT NULL,
  text            TEXT NOT NULL,
  contact_name    TEXT,
  contact_phone   TEXT,
  contact_email   TEXT,
  entity_type     TEXT,
  entity_id       UUID,
  responsible_id  UUID,
  responsible_name TEXT,
  history         JSONB NOT NULL DEFAULT '[]'::jsonb,
  from_api        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE public.media_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id         UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_name       TEXT NOT NULL,
  ad_type_id          TEXT NOT NULL,
  ad_type_name        TEXT NOT NULL,
  duration_option_id  TEXT,
  duration_label      TEXT,
  price_per_month     INTEGER NOT NULL DEFAULT 0 CHECK (price_per_month >= 0),
  total_price         INTEGER NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  status              TEXT NOT NULL,
  start_date          DATE,
  end_date            DATE CHECK (end_date >= start_date),
  notes               TEXT,
  expanded_notes      TEXT,
  contract_no         TEXT,
  contract_date       TEXT,
  history             JSONB NOT NULL DEFAULT '[]'::jsonb,
  material            JSONB,
  discount            INTEGER,
  responsible_id      UUID,
  responsible_name    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  -- v1.34.2: поля, которые использует LkService
  contract_json       TEXT,
  contract            JSONB
);

CREATE TABLE public.app_settings (
  id         TEXT PRIMARY KEY DEFAULT 'global' CHECK (id = 'global'),
  settings   JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY,
  email         TEXT,
  role          TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('admin', 'manager')),
  password_hash TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.user_access (
  user_id         TEXT PRIMARY KEY,
  supplier_types  TEXT[] NOT NULL DEFAULT '{}',
  supplier_cities TEXT[] NOT NULL DEFAULT '{}',
  buyer_types     TEXT[] NOT NULL DEFAULT '{}',
  buyer_cities    TEXT[] NOT NULL DEFAULT '{}',
  ticket_types    TEXT[] NOT NULL DEFAULT '{}',
  plan_cities     TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE public.app_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level      TEXT NOT NULL DEFAULT 'error' CHECK (level IN ('debug','info','warn','error')),
  message    TEXT NOT NULL CHECK (length(message) <= 10000),
  stack      TEXT,
  page       TEXT,
  user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_suppliers_status ON public.suppliers(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_suppliers_city ON public.suppliers(city) WHERE deleted_at IS NULL;
CREATE INDEX idx_suppliers_inn ON public.suppliers(inn) WHERE deleted_at IS NULL;
CREATE INDEX idx_suppliers_type_city_active ON public.suppliers(type, city) WHERE deleted_at IS NULL;
CREATE INDEX idx_suppliers_responsible ON public.suppliers(responsible_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_buyers_status ON public.buyers(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_buyers_city ON public.buyers(city) WHERE deleted_at IS NULL;
CREATE INDEX idx_buyers_type_city_active ON public.buyers(type, city) WHERE deleted_at IS NULL;
CREATE INDEX idx_buyers_responsible ON public.buyers(responsible_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_tasks_status ON public.tasks(task_status);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX idx_tasks_entity ON public.tasks(entity_type, entity_id);

CREATE INDEX idx_tickets_status ON public.tickets(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_type_active ON public.tickets(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_task_id ON public.tickets(task_id);

CREATE INDEX idx_media_status ON public.media_records(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_media_supplier ON public.media_records(supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_media_end_date ON public.media_records(end_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_app_logs_created ON public.app_logs(created_at DESC);
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- ============================================================
-- COMMERCE.DOMAINS (тенанты)
-- ============================================================

CREATE TABLE commerce.domains (
  id           UUID PRIMARY KEY,
  host         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL DEFAULT '',
  title        TEXT DEFAULT '',
  greeting     TEXT DEFAULT '',
  banner_image TEXT DEFAULT '',
  banner_link  TEXT DEFAULT '',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE commerce.domains IS 'Домены-арендаторы. Дефолт: 00000000-0000-4000-8000-000000000001 (host=default).';

CREATE OR REPLACE VIEW public.domains AS
  SELECT * FROM commerce.domains;

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES commerce.domains(id);
ALTER TABLE public.buyers    ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES commerce.domains(id);
CREATE INDEX IF NOT EXISTS idx_suppliers_domain ON public.suppliers(domain_id);
CREATE INDEX IF NOT EXISTS idx_buyers_domain ON public.buyers(domain_id);

-- ============================================================
-- FUNCTIONS (без auth.*)
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_domain_id() RETURNS uuid AS $$
BEGIN
  RETURN '00000000-0000-4000-8000-000000000001'::uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- PERMISSION HELPERS (v1.35.3: восстановлены — в Supabase-эпохе жили вне репозитория;
-- без них CREATE POLICY ... USING((SELECT is_admin())) падал, RLS-политики не создавались)
-- Источник прав — request.jwt.claims (выставляет API, database.service.ts):
--   sub = profiles.id, role = 'admin' | 'user'.
-- user_access наполняет триггер sync_user_access из settings.users (active-менеджеры).
-- Читаем клеймы напрямую (как шим auth.uid()) — политики в файле идут РАНЬШЕ шима.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.is_active_employee() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_access
      WHERE user_id = COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')
    );
$$;

-- Модели «прав на раздел» в БД нет: ограничения — только массивы user_access.
-- Разрешение раздела = активный сотрудник; фильтры по типам/городам — через access_*.
CREATE OR REPLACE FUNCTION public.has_section_permission(section text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT public.is_active_employee();
$$;

CREATE OR REPLACE FUNCTION public.access_supplier_types() RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT supplier_types FROM public.user_access
    WHERE user_id = COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')), '{}');
$$;
CREATE OR REPLACE FUNCTION public.access_supplier_cities() RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT supplier_cities FROM public.user_access
    WHERE user_id = COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')), '{}');
$$;
CREATE OR REPLACE FUNCTION public.access_buyer_types() RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT buyer_types FROM public.user_access
    WHERE user_id = COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')), '{}');
$$;
CREATE OR REPLACE FUNCTION public.access_buyer_cities() RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT buyer_cities FROM public.user_access
    WHERE user_id = COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')), '{}');
$$;

CREATE OR REPLACE FUNCTION public.get_supplier_with_domain(p_token TEXT)
RETURNS TABLE (payload JSONB) AS $$
  SELECT to_jsonb(s) || jsonb_build_object('domain', to_jsonb(d))
  FROM public.suppliers s
  JOIN commerce.domains d ON d.id = s.domain_id
  WHERE s.service_access ->> 'token' = p_token
    AND (s.service_access ->> 'enabled')::boolean = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- ID REGISTRY + PUBLIC IDS
-- ============================================================

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS chk_suppliers_external;
ALTER TABLE public.suppliers ADD CONSTRAINT chk_suppliers_external CHECK (external_id IS NULL OR external_source IS NOT NULL);
ALTER TABLE public.buyers DROP CONSTRAINT IF EXISTS chk_buyers_external;
ALTER TABLE public.buyers ADD CONSTRAINT chk_buyers_external CHECK (external_id IS NULL OR external_source IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.id_registry (
  id          UUID PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_by   TEXT,
  metadata    JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_id_registry_entity ON public.id_registry(entity_type, entity_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_external ON public.suppliers(external_source, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_buyers_external ON public.buyers(external_source, external_id) WHERE external_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_suppliers_id_registry_bi() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.id_registry (id, entity_type, entity_id, issued_by)
  VALUES (NEW.id, 'supplier', NEW.id, 'system')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trg_buyers_id_registry_bi() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.id_registry (id, entity_type, entity_id, issued_by)
  VALUES (NEW.id, 'buyer', NEW.id, 'system')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trg_suppliers_id_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'ID поставщика неизменен (id immutable)'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_buyers_id_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'ID покупателя неизменен (id immutable)'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_suppliers_id_registry_bd() RETURNS trigger AS $$
BEGIN
  UPDATE public.id_registry SET metadata = metadata || jsonb_build_object('deleted_at', now()) WHERE id = OLD.id;
  RETURN OLD;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trg_buyers_id_registry_bd() RETURNS trigger AS $$
BEGIN
  UPDATE public.id_registry SET metadata = metadata || jsonb_build_object('deleted_at', now()) WHERE id = OLD.id;
  RETURN OLD;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE SEQUENCE IF NOT EXISTS supplier_public_seq AS INTEGER NO CYCLE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS buyer_public_seq AS INTEGER NO CYCLE CACHE 1;

CREATE OR REPLACE FUNCTION public.trg_suppliers_public_id_bi() RETURNS trigger AS $$
BEGIN
  IF NEW.public_id IS NULL THEN
    NEW.public_id := 'S' || lpad(nextval('supplier_public_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_buyers_public_id_bi() RETURNS trigger AS $$
BEGIN
  IF NEW.public_id IS NULL THEN
    NEW.public_id := 'B' || lpad(nextval('buyer_public_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_public_id ON public.suppliers(public_id) WHERE public_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_buyers_public_id ON public.buyers(public_id) WHERE public_id IS NOT NULL;

-- ============================================================
-- SETTINGS GUARDS + SYNC
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_app_settings_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.settings IS NULL THEN
    NEW.settings := '{}'::jsonb;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_user_access()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.settings ? 'users' THEN
    IF jsonb_typeof(NEW.settings->'users') <> 'array' THEN
      RAISE EXCEPTION 'settings.users должен быть JSON-массивом — синхронизация прав отклонена';
    END IF;

    DELETE FROM public.user_access;

    INSERT INTO public.user_access (
      user_id, supplier_types, supplier_cities,
      buyer_types, buyer_cities, ticket_types, plan_cities
    )
    SELECT
      u->>'id',
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(u->'access'->'supplierTypes')), '{}'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(u->'access'->'supplierCities')), '{}'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(u->'access'->'buyerTypes')), '{}'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(u->'access'->'buyerCities')), '{}'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(u->'access'->'ticketTypes')), '{}'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(u->'access'->'planCities')), '{}')
    FROM jsonb_array_elements(NEW.settings->'users') AS u
    WHERE NULLIF(u->>'id', '') IS NOT NULL
      AND u->>'role' = 'manager'
      AND COALESCE(u->>'status', 'active') = 'active'
    ON CONFLICT (user_id) DO UPDATE SET
      supplier_types = EXCLUDED.supplier_types,
      supplier_cities = EXCLUDED.supplier_cities,
      buyer_types = EXCLUDED.buyer_types,
      buyer_cities = EXCLUDED.buyer_cities,
      ticket_types = EXCLUDED.ticket_types,
      plan_cities = EXCLUDED.plan_cities;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_settings_not_null_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.settings IS NULL THEN
    NEW.settings := '{}'::jsonb;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS suppliers_id_registry_bi ON public.suppliers;
CREATE TRIGGER suppliers_id_registry_bi BEFORE INSERT ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.trg_suppliers_id_registry_bi();
DROP TRIGGER IF EXISTS buyers_id_registry_bi ON public.buyers;
CREATE TRIGGER buyers_id_registry_bi BEFORE INSERT ON public.buyers FOR EACH ROW EXECUTE FUNCTION public.trg_buyers_id_registry_bi();
DROP TRIGGER IF EXISTS suppliers_id_immutable ON public.suppliers;
CREATE TRIGGER suppliers_id_immutable BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.trg_suppliers_id_immutable();
DROP TRIGGER IF EXISTS buyers_id_immutable ON public.buyers;
CREATE TRIGGER buyers_id_immutable BEFORE UPDATE ON public.buyers FOR EACH ROW EXECUTE FUNCTION public.trg_buyers_id_immutable();
DROP TRIGGER IF EXISTS suppliers_id_registry_bd ON public.suppliers;
CREATE TRIGGER suppliers_id_registry_bd BEFORE DELETE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.trg_suppliers_id_registry_bd();
DROP TRIGGER IF EXISTS buyers_id_registry_bd ON public.buyers;
CREATE TRIGGER buyers_id_registry_bd BEFORE DELETE ON public.buyers FOR EACH ROW EXECUTE FUNCTION public.trg_buyers_id_registry_bd();

DROP TRIGGER IF EXISTS suppliers_public_id_bi ON public.suppliers;
CREATE TRIGGER suppliers_public_id_bi BEFORE INSERT ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.trg_suppliers_public_id_bi();
DROP TRIGGER IF EXISTS buyers_public_id_bi ON public.buyers;
CREATE TRIGGER buyers_public_id_bi BEFORE INSERT ON public.buyers FOR EACH ROW EXECUTE FUNCTION public.trg_buyers_public_id_bi();

CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_buyers_updated_at BEFORE UPDATE ON public.buyers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_media_updated_at BEFORE UPDATE ON public.media_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_guard_app_settings BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.guard_app_settings_update();
CREATE TRIGGER trg_sync_user_access AFTER INSERT OR UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.sync_user_access();
CREATE TRIGGER app_settings_not_null_trigger BEFORE INSERT OR UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.app_settings_not_null_guard();

-- ============================================================
-- INITIAL DATA
-- ============================================================

INSERT INTO public.app_settings (id, settings) VALUES ('global', '{}'::jsonb);

INSERT INTO commerce.domains (id, host, name, title, greeting, is_active)
VALUES ('00000000-0000-4000-8000-000000000001', 'default', 'Default', 'ВсемЗапчасти', 'Добро пожаловать', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- END
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS updated_by_name TEXT;
ALTER TABLE public.buyers ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.buyers ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE public.buyers ADD COLUMN IF NOT EXISTS updated_by_name TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS updated_by_name TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS updated_by_name TEXT;
ALTER TABLE public.media_records ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.media_records ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE public.media_records ADD COLUMN IF NOT EXISTS updated_by_name TEXT;

-- ============================================================
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS pin TEXT;

-- ─── 0002_fix_update_rls.sql ───
-- ═══════════════════════════════════════════════════════════════════════════
-- 0002_fix_update_rls.sql (v1.32.0) — доменный фильтр в UPDATE-политиках
--
-- Для СУЩЕСТВУЮЩИХ баз (Supabase): применить после 0003/0004 в любом порядке.
-- Новые установки: не нужна — baseline (0001) уже содержит исправление.
--
-- Дыра: в USING политик UPDATE не было доменного фильтра (только в WITH CHECK) —
-- менеджер домена A мог изменять записи домена B. Доказательство и тесты:
-- tests/rls_isolation.sql.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authorized update suppliers" ON public.suppliers;
CREATE POLICY "Authorized update suppliers" ON public.suppliers
FOR UPDATE TO authenticated
USING (
  deleted_at IS NULL
  AND (domain_id = (SELECT current_domain_id()) OR (SELECT is_admin()))
  AND (SELECT is_active_employee())
  AND (
    (SELECT is_admin())
    OR (
      (SELECT has_section_permission('suppliers'))
      AND (cardinality((SELECT access_supplier_types())) = 0 OR type = ANY(access_supplier_types()))
      AND (cardinality((SELECT access_supplier_cities())) = 0 OR city = ANY(access_supplier_cities()))
    )
  )
)
WITH CHECK (
  deleted_at IS NULL
  AND (SELECT is_active_employee())
  AND (
    (SELECT is_admin())
    OR (
      (SELECT has_section_permission('suppliers'))
      AND (cardinality((SELECT access_supplier_types())) = 0 OR type = ANY(access_supplier_types()))
      AND (cardinality((SELECT access_supplier_cities())) = 0 OR city = ANY(access_supplier_cities()))
    )
  )
  AND (domain_id = (SELECT current_domain_id()) OR (SELECT is_admin()))
);

DROP POLICY IF EXISTS "Authorized update buyers" ON public.buyers;
CREATE POLICY "Authorized update buyers" ON public.buyers
FOR UPDATE TO authenticated
USING (
  deleted_at IS NULL
  AND (domain_id = (SELECT current_domain_id()) OR (SELECT is_admin()))
  AND (SELECT is_active_employee())
  AND (
    (SELECT is_admin())
    OR (
      (SELECT has_section_permission('buyers'))
      AND (cardinality((SELECT access_buyer_types())) = 0 OR type = ANY(access_buyer_types()))
      AND (cardinality((SELECT access_buyer_cities())) = 0 OR city = ANY(access_buyer_cities()))
    )
  )
)
WITH CHECK (
  deleted_at IS NULL
  AND (SELECT is_active_employee())
  AND (
    (SELECT is_admin())
    OR (
      (SELECT has_section_permission('buyers'))
      AND (cardinality((SELECT access_buyer_types())) = 0 OR type = ANY(access_buyer_types()))
      AND (cardinality((SELECT access_buyer_cities())) = 0 OR city = ANY(access_buyer_cities()))
    )
  )
  AND (domain_id = (SELECT current_domain_id()) OR (SELECT is_admin()))
);

-- ─── 0003_integration_1c.sql ───
-- ═══════════════════════════════════════════════════════════════════════════
-- 0003_integration_1c.sql (v1.32.0) — фундамент интеграции с 1С
--
-- Договорённость (фиксируется в README): обмен с 1С — только через HTTP/вебхуки,
-- НИКОГДА через прямое чтение таблиц. Идемпотентность входящих сообщений —
-- по (source, external_id). Исходящие события — через outbox (воркер шлёт,
-- подтверждает, ретраит).
--
-- Пока consumers нет — триггеры/эмиттеры не создаём (не усложняем заранее).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.integration_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT '1c',
  external_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',        -- new | processed | error
  error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_facts_source_external_id_key UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_integration_facts_status ON public.integration_facts (status, created_at);

CREATE TABLE IF NOT EXISTS public.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,                  -- например: ticket.message.created
  aggregate_type text NOT NULL,              -- ticket | supplier_lk_request | ...
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',    -- pending | sent | failed
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_outbox_events_pending ON public.outbox_events (created_at) WHERE status = 'pending';

-- Доступ — только сотрудники через API (как у остальных таблиц).
ALTER TABLE public.integration_facts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin all integration_facts" ON public.integration_facts;
CREATE POLICY "Admin all integration_facts" ON public.integration_facts FOR ALL TO authenticated
  USING ((SELECT is_admin())) WITH CHECK ((SELECT is_admin()));

ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin all outbox_events" ON public.outbox_events;
CREATE POLICY "Admin all outbox_events" ON public.outbox_events FOR ALL TO authenticated
  USING ((SELECT is_admin())) WITH CHECK ((SELECT is_admin()));

GRANT SELECT, INSERT, UPDATE ON public.integration_facts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outbox_events TO authenticated;

-- ─── GRANTS прикладным ролям (v1.35.3) ───
-- Раньше прав для app_user/app_admin в миграции не было вообще — приложение
-- заводилось только после ручных GRANT (иначе permission denied, в т.ч. на
-- схему commerce — ЛК читает commerce.domains напрямую).
GRANT USAGE ON SCHEMA public TO app_user, app_admin;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_admin;
GRANT USAGE ON SCHEMA commerce TO app_user, app_admin;
GRANT SELECT ON commerce.domains TO app_user, app_admin;

-- ─── 0004_auth_compat.sql ───
-- ═══════════════════════════════════════════════════════════════════════════
-- 0004_auth_compat.sql (v1.32.0) — мост со своего сервера без Supabase
--
-- Вся модель прав (is_admin, is_active_employee, has_section_permission, access_*,
-- current_domain_id) читает auth.uid() и request.jwt.claims. На своём сервере схемы
-- auth нет — создаём минимальный шим: auth.uid() возвращает 'sub' из клеймов,
-- которые выставляет API (guard делает SET LOCAL request.jwt.claims = JWT-payload).
-- Поведение полностью повторяет Supabase — переписывать хелперы НЕ нужно.
--
-- Безопасно и на Supabase: auth.uid() там уже существует — блок пропускается.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE $f$
      CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE
      SET search_path = pg_catalog, public
      AS $i$
        SELECT COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
      $i$;
    $f$;
  END IF;
END $$;

COMMENT ON FUNCTION auth.uid() IS 'Shim: sub из request.jwt.claims (выставляет API). На Supabase штатная auth.uid(). v1.32.0';

-- ─── 0005_profiles_password_hash.sql ───
-- ═══════════════════════════════════════════════════════════════════════════
-- 0005_profiles_password_hash.sql (v1.32.2) — своё хранение паролей
--
-- На Supabase пароли живут в auth.users (вне нашей схемы). На своём сервере
-- хэш храним в profiles — рядом с ролью. Пароль задаётся админом (первый —
-- SQL-скриптом/сидом), смена — через API позже. bcrypt, никогда в открытом виде.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_hash text;

COMMENT ON COLUMN public.profiles.password_hash IS
  'bcrypt-хэш пароля (своя auth, v1.32.2). В режиме Supabase Auth не используется.';

-- ─── 0006_indexes.sql ───
-- ═══════════════════════════════════════════════════════════════════════════
-- 0006_indexes.sql (v1.34.0, аудит #4) — индексы под рост данных.
--
-- До миграции: индексы только по PK. Списки CRM фильтруют deleted_at + сортируют
-- created_at/name; дедуп публичных форм ищет по inn/phone/email — всё это table scan.
-- Применить к существующим и новым базам (идемпотентно).
-- ═══════════════════════════════════════════════════════════════════════════

-- suppliers / buyers: дедуп по ИНН, email, мягкое удаление + списки по имени
CREATE INDEX IF NOT EXISTS idx_suppliers_inn_active ON public.suppliers (inn) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_email_active ON public.suppliers (lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers (trade_name);
CREATE INDEX IF NOT EXISTS idx_suppliers_responsible ON public.suppliers (responsible_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_buyers_inn_active ON public.buyers (inn) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_buyers_email_active ON public.buyers (lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_buyers_name ON public.buyers (trade_name);
CREATE INDEX IF NOT EXISTS idx_buyers_responsible ON public.buyers (responsible_id) WHERE deleted_at IS NULL;

-- tasks: карточки сущностей (entity_id) и списки по статусу/дате
CREATE INDEX IF NOT EXISTS idx_tasks_entity ON public.tasks (entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON public.tasks (task_status, due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_responsible ON public.tasks (responsible_id) WHERE deleted_at IS NULL;

-- tickets: списки поддержки
CREATE INDEX IF NOT EXISTS idx_tickets_status_created ON public.tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_entity ON public.tickets (entity_type, entity_id) WHERE deleted_at IS NULL;

-- media_records: размещения по поставщику
CREATE INDEX IF NOT EXISTS idx_media_records_supplier ON public.media_records (supplier_id) WHERE deleted_at IS NULL;

-- id_registry: поиск по токенам ЛК (uuid = PK есть, индекс под metadata не нужен)
-- outbox: забор пачки воркером
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON public.outbox_events (created_at) WHERE status IN ('pending','failed');

-- profiles: вход по id (PK) покрыт; email-lookup при поиске пользователя
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (lower(email));

-- ─── 0007_prod_columns.sql ───
-- ═══════════════════════════════════════════════════════════════════════════
-- 0007_prod_columns.sql (v1.35.0) — доводка схемы до контракта API (прод).
--
-- Найдено сверкой кода API с боевой схемой: колонки, которые API честно пишет,
-- но которых нет в базе (симптомы: «оферта не работает», «условия не сохраняются»,
-- лиды-поддержки не создаются). Идемпотентно, безопасно на любой базе из 0001.
-- ═══════════════════════════════════════════════════════════════════════════

-- suppliers: принятие оферты/условий (pricing_accepted_at ставит acceptOfferEdition),
-- контакты кабинета и условия поставки.
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS pricing_accepted_at timestamptz;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS cab_contact text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS cab_phone text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS cab_email text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS service_search_conditions jsonb;
-- fallback-хранилище PIN (приоритет — service_access.pin).
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS pin TEXT;
-- v1.35.3: ЛК ставит 'В работе' при сохранении условий проценки (lk.service.ts) —
-- без колонки финальный UPDATE падал с 500.
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS pricing_status TEXT;

-- suppliers / buyers: домен-арендатор (модуль Доменов при удалении перепривязывает
-- арендаторов на дефолтный домен — колонки отсутствовали в боевой схеме).
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS domain_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE public.buyers ADD COLUMN IF NOT EXISTS domain_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
CREATE INDEX IF NOT EXISTS idx_suppliers_domain ON public.suppliers (domain_id);
CREATE INDEX IF NOT EXISTS idx_buyers_domain ON public.buyers (domain_id);

-- ЛК: у поставщиков, созданных до введения service_access, токена нет — ЛК отвечал
-- 404 «Ссылка недействительна». Разовый бэкфилл токенов (только где их нет).
UPDATE public.suppliers
SET service_access = coalesce(service_access, '{}'::jsonb) || jsonb_build_object('token', encode(gen_random_bytes(16), 'hex'))
WHERE service_access IS NULL OR service_access ->> 'token' IS NULL;

-- tickets: источник обращения (публичная форма пишет source='website').
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'website';

-- outbox_events + integration_facts — почтовый воркер и фундамент 1С
-- (в боевой копии схемы таблицы отсутствовали целиком; почта ЛК падала молча).
CREATE TABLE IF NOT EXISTS public.integration_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT '1c',
  external_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',
  error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_facts_source_external_id_key UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_integration_facts_status ON public.integration_facts (status, created_at);

CREATE TABLE IF NOT EXISTS public.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_outbox_events_pending ON public.outbox_events (created_at) WHERE status IN ('pending','failed');

ALTER TABLE public.integration_facts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin all integration_facts" ON public.integration_facts;
CREATE POLICY "Admin all integration_facts" ON public.integration_facts FOR ALL TO authenticated
  USING ((SELECT is_admin())) WITH CHECK ((SELECT is_admin()));
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin all outbox_events" ON public.outbox_events;
CREATE POLICY "Admin all outbox_events" ON public.outbox_events FOR ALL TO authenticated
  USING ((SELECT is_admin())) WITH CHECK ((SELECT is_admin()));
GRANT SELECT, INSERT, UPDATE ON public.integration_facts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outbox_events TO authenticated;

-- ─── GRANTS прикладным ролям (v1.35.3) ───
-- Раньше прав для app_user/app_admin в миграции не было вообще — приложение
-- заводилось только после ручных GRANT (иначе permission denied, в т.ч. на
-- схему commerce — ЛК читает commerce.domains напрямую).
GRANT USAGE ON SCHEMA public TO app_user, app_admin;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_admin;
GRANT USAGE ON SCHEMA commerce TO app_user, app_admin;
GRANT SELECT ON commerce.domains TO app_user, app_admin;
