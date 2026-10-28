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
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d erp -c "
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
"
-- ============================================================
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS pin TEXT;
