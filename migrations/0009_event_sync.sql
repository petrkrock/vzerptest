-- v1.35.4: событийная синхронизация CRM ↔ ЛК (PostgreSQL event log + LISTEN/NOTIFY + SSE)
CREATE TABLE IF NOT EXISTS sync_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  domain_id uuid NOT NULL,
  supplier_id uuid NULL,
  entity text NOT NULL,
  op text NOT NULL,
  entity_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_events_created_at_idx ON sync_events (created_at);
CREATE INDEX IF NOT EXISTS sync_events_domain_id_id_idx ON sync_events (domain_id, id);
CREATE INDEX IF NOT EXISTS sync_events_supplier_id_id_idx ON sync_events (supplier_id, id) WHERE supplier_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sse_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id uuid NOT NULL,
  supplier_id uuid NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sse_tickets_expires_at_idx ON sse_tickets (expires_at) WHERE used_at IS NULL;
