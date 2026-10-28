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
