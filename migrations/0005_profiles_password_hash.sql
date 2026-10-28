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
