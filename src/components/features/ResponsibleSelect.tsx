import { getStore } from '@/lib/store';

/** Выпадающий список активных пользователей для назначения ответственного (ТЗ). */
export default function ResponsibleSelect({ value, onChange, className = 'form-input' }: {
  value?: string;
  onChange: (id: string | undefined, name: string | undefined) => void;
  className?: string;
}) {
  const users = getStore().settings.users.filter(u => u.status === 'active');
  return (
    <select
      className={className}
      value={value || ''}
      onChange={e => {
        const u = users.find(x => x.id === e.target.value);
        onChange(u?.id, u?.name);
      }}
    >
      <option value="">—</option>
      {users.map(u => (
        <option key={u.id} value={u.id}>
          {u.name}{u.note ? ` (${u.note})` : ''}
        </option>
      ))}
    </select>
  );
}
