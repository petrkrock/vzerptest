-- v1.35.4-fix1: минимальные права и RLS для событийной синхронизации.
-- Не переписывает 0009: этот шаг безопасно применяется поверх уже созданных таблиц.

-- app_user должен только читать события своего домена и писать новые события/tickets.
REVOKE UPDATE ON public.sync_events FROM app_user;
REVOKE UPDATE ON public.sse_tickets FROM app_user;
GRANT SELECT, INSERT ON public.sync_events TO app_user;
GRANT SELECT, INSERT ON public.sse_tickets TO app_user;

-- app_admin — служебная роль ЛК (BYPASSRLS), нужен полный доступ.
GRANT ALL ON public.sync_events TO app_admin;
GRANT ALL ON public.sse_tickets TO app_admin;

-- IDENTITY-колонка sync_events.id: INSERT ... RETURNING требует доступа к sequence.
GRANT USAGE, SELECT ON SEQUENCE public.sync_events_id_seq TO app_user, app_admin;

-- Изоляция доменов для CRM-пула app_user. app_admin BYPASSRLS и политикам не подчиняется.
ALTER TABLE public.sync_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CRM domain sync_events" ON public.sync_events;
CREATE POLICY "CRM domain sync_events" ON public.sync_events TO app_user
  USING (domain_id = current_setting('app.domain_id', true)::uuid)
  WITH CHECK (domain_id = current_setting('app.domain_id', true)::uuid);

ALTER TABLE public.sse_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CRM domain sse_tickets" ON public.sse_tickets;
CREATE POLICY "CRM domain sse_tickets" ON public.sse_tickets TO app_user
  USING (domain_id = current_setting('app.domain_id', true)::uuid)
  WITH CHECK (domain_id = current_setting('app.domain_id', true)::uuid);
