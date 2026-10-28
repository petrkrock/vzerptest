import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { getStore, useStoreVersion } from '@/lib/store';

/** Страница-экспорт списка лидов из задачи.
 * Доступна ТОЛЬКО авторизованным пользователям CRM (роут обёрнут в RequireAccess):
 * без входа — редирект на логин, по прямой ссылке посторонним — пусто. */
export default function LeadsExportPage() {
  useStoreVersion();
  const { taskId } = useParams();
  const [done, setDone] = useState(false);

  const store = getStore();
  const task = store.tasks.find(t => t.id === taskId);
  const leads = (task && task.exportKind === 'leads' && task.leadIds)
    ? (store.settings.leads || []).filter(l => task.leadIds!.includes(l.id))
    : [];

  function download() {
    const rows = [['Тип', 'Торговое название', 'Город', 'ФИО', 'Статус', 'Телефон', 'Email', 'Комментарий']];
    for (const l of leads) rows.push([l.type === 'supplier' ? 'Поставщик' : 'Покупатель', l.tradeName, l.city, l.contactName, l.status, l.phone, l.email, l.comment]);
    const csv = rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    a.download = `leads-${taskId}.csv`; a.click();
    setDone(true);
  }

  useEffect(() => { if (leads.length) download(); }, []);

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="card-base p-6 text-center">
        <h1 className="text-lg font-bold mb-2">Экспорт списка лидов</h1>
        {task && task.exportKind === 'leads' ? (
          <>
            <p className="text-sm text-gray-500 mb-4">В списке: {leads.length} лидов (по задаче «{task.title}»).</p>
            <button onClick={download} className="btn-primary text-xs inline-flex items-center gap-1.5">
              <Download size={13} /> {done ? 'Скачать ещё раз' : 'Скачать Excel (CSV)'}
            </button>
          </>
        ) : (
          <p className="text-sm text-gray-400">Нет данных для экспорта.</p>
        )}
      </div>
    </div>
  );
}
