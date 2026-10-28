import { useState } from 'react';
import { isArchiveStatus } from '@/lib/dedupe';
import { getStore } from '@/lib/store';
import { DEFAULT_STATUSES } from '@/constants';
import { X } from 'lucide-react';
import { toast } from 'sonner';

/** Всплывающее окно смены статуса из таблиц Поставщики/Покупатели:
 *  выбор статуса + комментарий + Сохранить/Отменить; при сохранении — подтверждение. */
export default function StatusChangeModal({
  entityType,
  initial,
  onClose,
  onSave,
}: {
  entityType: 'supplier' | 'buyer';
  initial: string;
  onClose: () => void;
  onSave: (status: string, comment: string, isArchive?: boolean) => void;
}) {
  const store = getStore();
  const list = store.settings.statuses.filter(s => s.entityTypes.includes(entityType))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99)); // порядок этапов воронки
  const statuses = list.length ? list.map(s => s.name) : DEFAULT_STATUSES.filter(s => s.entityTypes.includes(entityType)).map(s => s.name);
  const [status, setStatus] = useState(initial);
  const [phrase, setPhrase] = useState(''); // подтверждение фразой «согласен» для архивных статусов
  const [comment, setComment] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-brand-black">Смена статуса</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-brand-red"><X size={16} /></button>
        </div>
        <label className="form-label">Статус</label>
        <select autoFocus className="form-input mb-3" value={status} onChange={e => setStatus(e.target.value)}>
          {!statuses.includes(initial) && <option value={initial}>{initial}</option>}
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="form-label">Комментарий</label>
        <textarea className="form-input min-h-[70px] resize-none mb-4" placeholder="Причина смены статуса (попадёт в историю)..." value={comment} onChange={e => setComment(e.target.value)} />
        {isArchiveStatus(status) && (
          <div className="mt-2">
            <label className="form-label">Подтверждение архивации — введите фразу «согласен»</label>
            <input className="form-input" value={phrase} onChange={e => setPhrase(e.target.value)} placeholder="согласен" />
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary text-sm">Отменить</button>
          <button onClick={() => {
            if (status === initial && !comment.trim()) { onClose(); return; }
            // Комментарий обязателен при снятии статуса «Активный»
            if (initial === 'Активный' && status !== initial && !comment.trim()) {
              toast.error('При снятии статуса «Активный» комментарий обязателен');
              return;
            }
            // Комментарий обязателен при переводе в «АРХИВ»
            if (status === 'АРХИВ' && !comment.trim()) {
              toast.error('При переводе в «АРХИВ» комментарий обязателен');
              return;
            }
            if (!confirm(`Вы уверены? Статус будет изменён на «${status}».`)) return;
            if (isArchiveStatus(status) && phrase.trim().toLowerCase() !== 'согласен') {
              toast.error('Для перевода в архив введите фразу «согласен»');
              return;
            }
            onSave(status, comment.trim(), isArchiveStatus(status));
          }} className="text-sm px-4 py-2 rounded-xl font-medium bg-brand-black text-white hover:bg-gray-800 transition-colors">Сохранить</button>
        </div>
      </div>
    </div>
  );
}
