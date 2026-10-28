-- ═══════════════════════════════════════════════════════════════════════════
-- 0002_fix_update_rls.sql (v1.32.0) — доменный фильтр в UPDATE-политиках
--
-- Для СУЩЕСТВУЮЩИХ баз (Supabase): применить после 0003/0004 в любом порядке.
-- Новые установки: не нужна — baseline (0001) уже содержит исправление.
--
-- Дыра: в USING политик UPDATE не было доменного фильтра (только в WITH CHECK) —
-- менеджер домена A мог изменять записи домена B. Доказательство и тесты:
-- tests/rls_isolation.sql.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authorized update suppliers" ON public.suppliers;
CREATE POLICY "Authorized update suppliers" ON public.suppliers
FOR UPDATE TO authenticated
USING (
  deleted_at IS NULL
  AND (domain_id = (SELECT current_domain_id()) OR (SELECT is_admin()))
  AND (SELECT is_active_employee())
  AND (
    (SELECT is_admin())
    OR (
      (SELECT has_section_permission('suppliers'))
      AND (cardinality((SELECT access_supplier_types())) = 0 OR type = ANY((SELECT access_supplier_types())))
      AND (cardinality((SELECT access_supplier_cities())) = 0 OR city = ANY((SELECT access_supplier_cities())))
    )
  )
)
WITH CHECK (
  deleted_at IS NULL
  AND (SELECT is_active_employee())
  AND (
    (SELECT is_admin())
    OR (
      (SELECT has_section_permission('suppliers'))
      AND (cardinality((SELECT access_supplier_types())) = 0 OR type = ANY((SELECT access_supplier_types())))
      AND (cardinality((SELECT access_supplier_cities())) = 0 OR city = ANY((SELECT access_supplier_cities())))
    )
  )
  AND (domain_id = (SELECT current_domain_id()) OR (SELECT is_admin()))
);

DROP POLICY IF EXISTS "Authorized update buyers" ON public.buyers;
CREATE POLICY "Authorized update buyers" ON public.buyers
FOR UPDATE TO authenticated
USING (
  deleted_at IS NULL
  AND (domain_id = (SELECT current_domain_id()) OR (SELECT is_admin()))
  AND (SELECT is_active_employee())
  AND (
    (SELECT is_admin())
    OR (
      (SELECT has_section_permission('buyers'))
      AND (cardinality((SELECT access_buyer_types())) = 0 OR type = ANY((SELECT access_buyer_types())))
      AND (cardinality((SELECT access_buyer_cities())) = 0 OR city = ANY((SELECT access_buyer_cities())))
    )
  )
)
WITH CHECK (
  deleted_at IS NULL
  AND (SELECT is_active_employee())
  AND (
    (SELECT is_admin())
    OR (
      (SELECT has_section_permission('buyers'))
      AND (cardinality((SELECT access_buyer_types())) = 0 OR type = ANY((SELECT access_buyer_types())))
      AND (cardinality((SELECT access_buyer_cities())) = 0 OR city = ANY((SELECT access_buyer_cities())))
    )
  )
  AND (domain_id = (SELECT current_domain_id()) OR (SELECT is_admin()))
);
