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
