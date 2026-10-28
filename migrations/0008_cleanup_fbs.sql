-- ═══════════════════════════════════════════════════════════════════════════
-- 0008_cleanup_fbs.sql (v1.35.3) — одноразовая очистка данных (НЕ схема).
-- Удаляет сервис «FBS» из настроек (сервис выведен из продукта; дефолты уже
-- очищены в коде, это добор уже засиженных данных). Идемпотентно.
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.app_settings
SET settings = jsonb_set(
  settings,
  '{supplierServices}',
  COALESCE((
    SELECT jsonb_agg(el)
    FROM jsonb_array_elements(COALESCE(settings -> 'supplierServices', '[]'::jsonb)) el
    WHERE upper(el ->> 'name') <> 'FBS'
  ), '[]'::jsonb)
)
WHERE id = 'global';
