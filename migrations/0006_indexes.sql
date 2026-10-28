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
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers (name);
CREATE INDEX IF NOT EXISTS idx_suppliers_responsible ON public.suppliers (responsible_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_buyers_inn_active ON public.buyers (inn) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_buyers_email_active ON public.buyers (lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_buyers_name ON public.buyers (name);
CREATE INDEX IF NOT EXISTS idx_buyers_responsible ON public.buyers (responsible_id) WHERE deleted_at IS NULL;

-- tasks: карточки сущностей (entity_id) и списки по статусу/дате
CREATE INDEX IF NOT EXISTS idx_tasks_entity ON public.tasks (entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON public.tasks (status, due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_responsible ON public.tasks (responsible_id) WHERE deleted_at IS NULL;

-- tickets: списки поддержки
CREATE INDEX IF NOT EXISTS idx_tickets_status_created ON public.tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_buyer ON public.tickets (buyer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_supplier ON public.tickets (supplier_id) WHERE deleted_at IS NULL;

-- media_records: размещения по поставщику
CREATE INDEX IF NOT EXISTS idx_media_records_supplier ON public.media_records (supplier_id) WHERE deleted_at IS NULL;

-- id_registry: поиск по токенам ЛК (uuid = PK есть, индекс под metadata не нужен)
-- outbox: забор пачки воркером
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON public.outbox_events (created_at) WHERE status IN ('pending','failed');

-- profiles: вход по id (PK) покрыт; email-lookup при поиске пользователя
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (lower(email));
