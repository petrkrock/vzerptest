-- v1.35.9: заявки с публичных форм (1.35.6–1.35.8) создавались без domain_id → NULL на БД, где колонка
-- не имеет DEFAULT/NOT NULL. Из-за этого падала выдача SSE-тикета ЛК (sse_tickets.domain_id NOT NULL).
-- Чиним данные и фиксируем схему. Идемпотентно.
UPDATE public.suppliers SET domain_id = '00000000-0000-4000-8000-000000000001' WHERE domain_id IS NULL;
UPDATE public.buyers    SET domain_id = '00000000-0000-4000-8000-000000000001' WHERE domain_id IS NULL;

ALTER TABLE public.suppliers ALTER COLUMN domain_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE public.buyers    ALTER COLUMN domain_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE public.suppliers ALTER COLUMN domain_id SET NOT NULL;
ALTER TABLE public.buyers    ALTER COLUMN domain_id SET NOT NULL;
