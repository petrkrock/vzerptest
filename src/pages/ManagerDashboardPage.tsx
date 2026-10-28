import { Link, useNavigate, Navigate } from 'react-router-dom';
import { getStore, useStoreVersion } from '@/lib/store';
import { getCurrentUser, canAccess, canSeeSupplier, canSeeBuyer, canSeeTicket, canSeeTask, canSeePlanCity, canSeeManagerCity, isMineOrUnassigned } from '@/lib/auth';
import { isToday, isOverdue } from '@/lib/utils';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Truck, ShoppingCart, CheckSquare, HeadphonesIcon, Globe, UserX, ArrowLeft } from 'lucide-react';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#6B7280', '#14B8A6'];

/**
 * Дашборд менеджера (ТЗ v1.21.3). Два типа — только один на пользователя:
 *  · МОП — продажи: контент по покупателям;
 *  · МОЗ — закупки: контент по поставщикам.
 * Видимость: записи, закреплённые за текущим пользователем, и записи без ответственного.
 * Главный дашборд (Dashboard.tsx) — только для администратора.
 * previewType — страница предпросмотра из Настроек (доступна только админу).
 */
export default function ManagerDashboardPage({ previewType }: { previewType?: 'mop' | 'moz' }) {
  useStoreVersion();
  const navigate = useNavigate();
  const store = getStore();
  const me = getCurrentUser();
  // ТЗ v1.22.2: страховка от «мигания» — администратор никогда не должен видеть дашборд менеджера.
  if (!previewType && me?.role === 'admin') return <Navigate to="/dashboard" replace />;
  const type: 'mop' | 'moz' = previewType || (me?.role === 'manager' ? me.dashboardType ?? 'mop' : 'mop');
  const isBuyers = type === 'mop';
  const preview = !!previewType;

  // Ссылки на разделы: в предпросмотре показываем весь контент, в жизни — по правам менеджера.
  const canTasks = preview || canAccess('tasks');
  const canSupport = preview || canAccess('support');
  const canPlan = preview || canAccess('planfact');
  const canEntities = preview || canAccess(isBuyers ? 'buyers' : 'suppliers');

  // ── Данные: закреплённые за мной + без ответственного (+ фильтры типов/городов из прав) ──
  type Ent = { id: string; tradeName: string; status?: string; type?: string; city?: string; source?: string; createdAt?: string; fromApi?: boolean; responsibleId?: string; deletedAt?: string; serviceSearch?: Array<{ city: string; status?: string }> };
  const entities = ((isBuyers ? store.buyers : store.suppliers) as unknown as Ent[]).filter(x => !x.deletedAt
    && (isBuyers
      ? canSeeBuyer(x as { type: string; city: string; responsibleId?: string })
      : canSeeSupplier(x as { type: string; city: string; responsibleId?: string }))
    && (isBuyers ? canSeeManagerCity(x.city) : true) // ТЗ v1.21.6: города МОП
    && isMineOrUnassigned(x));
  const activeCount = entities.filter(x => x.status === 'Активный').length;
  // ТЗ v1.22.3: формы пишут «Новый с сайта» (legacy — «Лид форма»)
  const siteLeads = entities.filter(x => x.fromApi && (x.status === 'Новый с сайта' || x.status === 'Лид форма'));
  const noRespEntities = entities.filter(x => !x.responsibleId).length;

  const tasksAll = store.tasks.filter(t => !t.deletedAt && canSeeTask(t) && isMineOrUnassigned(t));
  const todayTasks = tasksAll.filter(t => !t.completed && (isToday(t.dueDate) || isOverdue(t.dueDate)));
  const noRespTasks = tasksAll.filter(t => !t.responsibleId).length;

  const ticketsAll = store.tickets.filter(t => !t.deletedAt && canSeeTicket(t) && isMineOrUnassigned(t));
  const newTickets = ticketsAll.filter(t => t.status === 'Новый запрос' || t.status === 'Новый запрос с формы');
  const noRespTickets = ticketsAll.filter(t => !t.responsibleId).length;

  // Сервис проценки (МОЗ): условия, ожидающие обработки менеджером
  const ssItems = isBuyers ? [] : entities.flatMap(sup => (sup.serviceSearch || [])
    .filter(c => (c.status || 'Новое') !== 'Загружено')
    .map(c => ({ id: `${sup.id}:${c.city}`, city: c.city, status: c.status || 'Новое' })));
  const ssNew = ssItems.filter(i => i.status === 'Новое').length;
  const ssChanged = ssItems.length - ssNew;

  // План/Факт — активная сводка текущего месяца (мои записи + без ответственного)
  const nowD = new Date();
  const mStart = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-01`;
  const mEnd = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).toISOString().slice(0, 10);
  const pfEntries = (store.settings.planFact || []).filter(e => !e.deletedAt
    && e.kind === (isBuyers ? 'buyers' : 'suppliers')
    && e.startDate <= mEnd && e.endDate >= mStart
    && canSeePlanCity(e.cityName) && isMineOrUnassigned(e));
  const plan = pfEntries.reduce((s, e) => s + (e.plan || 0), 0);
  const factIn = entities.filter(x => { const d = (x.createdAt || '').slice(0, 10); return d >= mStart && d <= mEnd; });
  const act = factIn.filter(x => x.status === 'Активный').length;
  const pot = factIn.filter(x => !!x.status && x.status !== 'Активный' && x.status !== 'АРХИВ' && x.status !== 'Архив дублей').length;
  const pct = plan ? Math.min(100, Math.round(((act + pot) / plan) * 100)) : null;

  const countBy = (key: 'status' | 'source' | 'type') => {
    const acc: Record<string, number> = {};
    entities.forEach(x => { const v = x[key]; if (v) acc[v] = (acc[v] || 0) + 1; });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  };
  const statusRows = countBy('status');
  const sourceRows = countBy('source');
  const typeRows = countBy('type');

  const entLabel = isBuyers ? 'Покупателей' : 'Поставщиков';
  const EntIcon = isBuyers ? ShoppingCart : Truck;
  const noRespRows = [
    { label: entLabel, value: noRespEntities, to: '/buyers', ok: canEntities },
    { label: 'Задач', value: noRespTasks, to: '/tasks', ok: canTasks },
    { label: 'Поддержки', value: noRespTickets, to: '/support', ok: canSupport },
  ];
  const pfStats = [
    { label: 'План', value: String(plan) },
    { label: 'Активные', value: String(act) },
    { label: 'Потенциал', value: String(pot) },
    { label: 'Выполнение', value: pct === null ? '—' : `${pct}%` },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="actions-bar flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {preview && <Link to="/settings" className="action-btn text-xs flex items-center gap-1"><ArrowLeft size={14} /> Назад</Link>}
          {preview && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-200">Предпросмотр</span>}
        </div>
        <span className="text-xs text-gray-400">Сегодня: {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>

      {/* Сводные карточки */}
      <div className="grid grid-cols-2 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{entLabel}</span>
            <div className={`w-8 h-8 rounded-lg ${isBuyers ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'} flex items-center justify-center`}><EntIcon size={16} /></div>
          </div>
          <p className="text-2xl font-bold text-brand-black">{entities.length}</p>
          <p className="mt-1 rounded-lg px-2 py-1 text-sm font-bold" style={{ backgroundColor: 'rgb(220 252 231 / var(--tw-bg-opacity, 1))', color: 'rgb(21 128 61 / var(--tw-text-opacity, 1))' }}>Активных: {activeCount}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Заявок с сайта</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center"><Globe size={16} /></div>
          </div>
          <p className="text-2xl font-bold text-brand-black">{siteLeads.length}</p>
          <p className="mt-1 text-xs text-gray-400">{isBuyers ? 'Покупатели' : 'Поставщики'}: {siteLeads.length}</p>
        </div>
      </div>

      {/* Нет ответственного */}
      <div className="card-base p-4">
        <h2 className="section-title flex items-center gap-2"><UserX size={16} className="text-brand-red" /> Нет ответственного</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          {noRespRows.map(r => (
            <button key={r.label} onClick={() => r.ok && navigate(r.to)} disabled={!r.ok}
              className="flex items-center justify-between rounded-lg border border-brand-gray-mid px-3 py-2.5 hover:shadow-md transition-shadow text-left disabled:opacity-70 disabled:hover:shadow-none">
              <span className="text-xs text-gray-500">{r.label}</span>
              <span className={`text-lg font-bold ${r.value > 0 ? 'text-brand-red' : 'text-brand-black'}`}>{r.value}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Задачи на сегодня + Поддержка */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-base p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="section-title flex items-center gap-2"><CheckSquare size={16} className="text-brand-red" /> Задачи на сегодня</h2>
            {canTasks && <Link to="/tasks" className="text-xs text-brand-red hover:underline">Все →</Link>}
          </div>
          {todayTasks.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Нет задач на сегодня</p> : (
            <div className="space-y-2">
              {todayTasks.slice(0, 5).map(t => (
                <button key={t.id} onClick={() => canTasks && navigate(`/tasks/${t.id}`)} disabled={!canTasks}
                  className="w-full flex items-center gap-2 text-left border border-brand-gray-mid rounded-lg px-3 py-2 hover:shadow-md transition-shadow disabled:hover:shadow-none">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-black truncate">{t.title}{t.entityName ? ` · ${t.entityName}` : ''}</p>
                    <p className="text-xs text-gray-400">{t.responsibleName || 'Без ответственного'}</p>
                  </div>
                  {isOverdue(t.dueDate) && !isToday(t.dueDate) && <span className="text-xs font-bold text-brand-red">просрочена</span>}
                  <span className="text-xs text-gray-400 flex-shrink-0">{t.dueDate}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="card-base p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="section-title flex items-center gap-2"><HeadphonesIcon size={16} className="text-brand-red" /> Поддержка</h2>
            {canSupport && <Link to="/support" className="text-xs text-brand-red hover:underline">Все →</Link>}
          </div>
          {newTickets.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Новых обращений нет</p> : (
            <div className="space-y-2">
              {[...newTickets].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5).map(t => ( // ТЗ v1.22.40: новые сверху
                <button key={t.id} onClick={() => canSupport && navigate(`/support/${t.id}`)} disabled={!canSupport}
                  className="w-full flex items-center gap-2 text-left border border-brand-gray-mid rounded-lg px-3 py-2 hover:shadow-md transition-shadow disabled:hover:shadow-none">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-black truncate">{t.subject}</p>
                    <p className="text-xs text-gray-400">{t.responsibleName || 'Без ответственного'}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 flex-shrink-0">{t.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Сервис проценки (МОЗ) */}
      {!isBuyers && (
        <div className="card-base p-4">
          <h2 className="section-title">Сервис проценки: требует внимания</h2>
          {ssItems.length === 0 ? (
            <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 mt-2">Все условия загружены на платформу</p>
          ) : (
            <div className="flex flex-wrap gap-4 mt-2 text-sm">
              <span>Новое: <b>{ssNew}</b></span>
              <span>Изменения: <b>{ssChanged}</b></span>
            </div>
          )}
        </div>
      )}

      {/* По статусам / Источники / По типам */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-base p-4">
          <h2 className="section-title">{isBuyers ? 'Покупатели' : 'Поставщики'} по статусам</h2>
          {statusRows.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Нет данных</p> : (
            <div className="h-48 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusRows.map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                    {statusRows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <BarsCard title={`Источники ${isBuyers ? 'покупателей' : 'поставщиков'}`} rows={sourceRows} />
        <BarsCard title={`${isBuyers ? 'Покупатели' : 'Поставщики'} по типам`} rows={typeRows} />
      </div>

      {/* План / Факт — активная сводка */}
      <div className="card-base p-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title">План / Факт — активная сводка {isBuyers ? 'покупатели' : 'поставщики'}</h2>
          {canPlan && <Link to="/planfact" className="text-xs text-brand-red hover:underline">Открыть →</Link>}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          {pfStats.map(s => (
            <div key={s.label} className="rounded-lg border border-brand-gray-mid px-3 py-2.5">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="text-lg font-bold text-brand-black">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Мини-график: строки с горизонтальными барами (источники / типы). */
function BarsCard({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return (
    <div className="card-base p-4">
      <h2 className="section-title">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Нет данных</p> : (
        <div className="space-y-2 mt-2">
          {rows.slice(0, 8).map(([name, value]) => (
            <div key={name}>
              <div className="flex justify-between text-xs mb-0.5 gap-2">
                <span className="text-gray-600 truncate">{name}</span>
                <span className="font-bold text-brand-black">{value}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100">
                <div className="h-1.5 rounded-full bg-brand-red" style={{ width: `${Math.round((value / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
