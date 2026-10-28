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
