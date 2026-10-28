import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { getStore, useStoreVersion } from '@/lib/store';

/** Скачивание файла выбранных записей из задачи (поставщики/покупатели/лиды).
 * Доступно только авторизованным пользователям CRM (роут в RequireAccess). */
export default function EntityExportPage() {
  useStoreVersion();
  const { taskId } = useParams();
  const [done, setDone] = useState(false);

  const store = getStore();
  const task = store.tasks.find(t => t.id === taskId);
  const kind = task?.exportKind === 'leads' ? 'leads' : task?.entityKind;
  const ids = task?.leadIds || task?.entityIds || [];

  let rows: string[][] = [];
  let filename = 'export.csv';
  if (kind === 'suppliers') {
    const list = store.suppliers.filter(s => ids.includes(s.id));
    rows = [['Торговое название', 'Город', 'ФИО', 'Статус', 'Телефон', 'Email', 'ИНН']];
    for (const s of list) rows.push([s.tradeName, s.city, s.contactName, s.status, s.phone, s.email, s.inn || '']);
    filename = `suppliers-${taskId}.csv`;
  } else if (kind === 'buyers') {
    const list = store.buyers.filter(b => ids.includes(b.id));
    rows = [['Торговое название', 'Город', 'ФИО', 'Статус', 'Телефон', 'Email', 'ИНН']];
    for (const b of list) rows.push([b.tradeName, b.city, b.contactName, b.status, b.phone, b.email, b.inn || '']);
    filename = `buyers-${taskId}.csv`;
  } else if (kind === 'leads') {
    const list = (store.settings.leads || []).filter(l => ids.includes(l.id));
    rows = [['Тип', 'Подтип', 'ИНН', 'Торговое название', 'Город', 'ФИО', 'Статус', 'Телефон', 'Email', 'Комментарий']];
    for (const l of list) rows.push([l.type === 'supplier' ? 'Поставщик' : 'Покупатель', l.subType || '', l.inn || '', l.tradeName, l.city, l.contactName, l.status, l.phone, l.email, l.comment]);
    filename = `leads-${taskId}.csv`;
  }
  const count = Math.max(rows.length - 1, 0);

  function download() {
    const csv = rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    a.download = filename; a.click();
    setDone(true);
  }

  useEffect(() => { if (count) download(); }, []);

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="card-base p-6 text-center">
        <h1 className="text-lg font-bold mb-2">Экспорт выбранных записей</h1>
        {task && count > 0 ? (
          <>
            <p className="text-sm text-gray-500 mb-4">В файле: {count} записей (задача «{task.title}»).</p>
            <button onClick={download} className="btn-primary text-xs inline-flex items-center gap-1.5">
              <Download size={13} /> {done ? 'Скачать ещё раз' : 'Скачать файл (CSV)'}
            </button>
          </>
        ) : (
          <p className="text-sm text-gray-400">Нет данных для экспорта.</p>
        )}
      </div>
    </div>
  );
}
