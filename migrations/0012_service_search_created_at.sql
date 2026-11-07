-- v1.35.10: дата создания условий проценки терялась (ЛК-валидатор отбрасывал createdAt при каждом сохранении).
-- Добиваем createdAt у существующих условий: из updatedAt условия, иначе — дата создания поставщика. Идемпотентно.
UPDATE public.suppliers s
SET service_search = (
  SELECT jsonb_agg(
    CASE WHEN coalesce(e->>'createdAt', '') <> '' THEN e
         ELSE e || jsonb_build_object('createdAt', coalesce(
           nullif(e->>'updatedAt', ''),
           to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    END ORDER BY ord)
  FROM jsonb_array_elements(s.service_search) WITH ORDINALITY AS t(e, ord)
)
WHERE jsonb_typeof(s.service_search) = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.service_search) x WHERE coalesce(x->>'createdAt', '') = '');
