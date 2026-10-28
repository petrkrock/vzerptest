/** Архивные системные статусы: сущности с ними считаются архивными
 * (не участвуют в аналитике/статистике, фактически удалены). */
export const ARCHIVE_STATUSES = ['АРХИВ', 'Архив дублей'];

export function isArchiveStatus(status?: string): boolean {
  return ARCHIVE_STATUSES.includes(status || '');
}

const digits = (v?: string) => (v || '').replace(/\D/g, '');
const lower = (v?: string) => (v || '').toLowerCase().trim();

/** Ищет дубль сущности по любому из трёх полей: ИНН, ТЕЛЕФОН или Email.
 * Архивные и удалённые записи в поиске не участвуют. */
export function findDuplicate<T extends { id: string; inn?: string; phone?: string; email?: string; status?: string; deletedAt?: string }>(
  entity: T,
  list: T[],
): T | undefined {
  const inn = digits(entity.inn);
  const phone = digits(entity.phone);
  const email = lower(entity.email);
  if (!inn && !phone && !email) return undefined;
  return list.find(e => e.id !== entity.id && !e.deletedAt && !isArchiveStatus(e.status) &&
    ((inn && digits(e.inn) === inn) || (phone && digits(e.phone) === phone) || (email && lower(e.email) === email)));
}
