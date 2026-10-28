import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getStore, useStoreVersion } from '@/lib/store';
import { formatDateTime, formatDate, isToday, isOverdue } from '@/lib/utils';
import { canAccess, canSeeSupplier, canSeeBuyer, canSeeTicket, canSeeDashboardCity, canSeeTask } from '@/lib/auth';
import StatusBadge from '@/components/features/StatusBadge';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Globe, Truck, ShoppingCart, CheckSquare, HeadphonesIcon, TrendingUp, Plus, AlertCircle, Clock, Video, AlertTriangle, FileEdit, UserX } from 'lucide-react';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#6B7280', '#14B8A6'];

function isEndingSoon(endDate: string): boolean {
  const diff = (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 14;
}
function isUpcomingStart(startDate: string, status: string): boolean {
  const diff = (new Date(startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 7 && status.toLowerCase().includes('ожидает');
}
function daysLeft(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function Dashboard() {
  useStoreVersion(); // re-render on real-time changes from other users (see src/lib/realtime.ts)
  const navigate = useNavigate();
  const store = getStore();
  // Дашборд менеджера показывает только разрешённые ему данные (ТЗ)
  const okSup = canAccess('suppliers');
  const okBuy = canAccess('buyers');
  const okTasks = canAccess('tasks');
  const okSupport = canAccess('support');
  const okMedia = canAccess('media');
  // Сервис поиска: условия, ожидающие обработки менеджером (всё, что не «Загружено»)
  const ssItems = (okSup ? store.suppliers.filter(s => !s.deletedAt && canSeeSupplier(s)) : []).flatMap(sup => [
    ...(sup.serviceSearch || [])
      .filter(c => (c.status || 'Новое') !== 'Загружено')
      .map(c => ({ supplierId: sup.id, supplierName: sup.tradeName, city: c.city, status: c.status || 'Новое' })).filter(c => canSeeDashboardCity(c.city)),
    // Косяки ч.4: в общую ленту добавляем склады в статусе «Новый»
    ...(sup.warehouseLocations || [])
      .filter(w => (w.status || (w.verified ? 'Проверен' : 'Новый')) === 'Новый')
      .map(w => ({ supplierId: sup.id, supplierName: sup.tradeName, city: w.city, status: 'Новый' as const }))
      .filter(w => canSeeDashboardCity(w.city)),
  ]);
  const ssNew = ssItems.filter(i => i.status === 'Новое').length;
  const ssWh = ssItems.filter(i => i.status === 'Новый').length;
  const ssChanged = ssItems.length - ssNew - ssWh;

  const activeSuppliers = okSup ? store.suppliers.filter(s => !s.deletedAt && canSeeSupplier(s)) : [];
  const activeBuyers = okBuy ? store.buyers.filter(b => !b.deletedAt && canSeeBuyer(b)) : [];
  const mediaRecords = okMedia ? (store.mediaRecords || []).filter(r => !r.deletedAt) : [];

  const endingSoonRecords = mediaRecords.filter(r => r.status !== 'Анулирован' && isEndingSoon(r.endDate));
  const upcomingStartRecords = mediaRecords.filter(r => isUpcomingStart(r.startDate, r.status));

  const supplierStatuses = activeSuppliers.reduce<Record<string, number>>((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {});
  const buyerStatuses = activeBuyers.reduce<Record<string, number>>((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});

  const supplierPieData = Object.entries(supplierStatuses).map(([name, value]) => ({ name, value }));
  const buyerPieData = Object.entries(buyerStatuses).map(([name, value]) => ({ name, value }));

  const supplierSources = activeSuppliers.reduce<Record<string, number>>((acc, s) => { if (s.source) acc[s.source] = (acc[s.source] || 0) + 1; return acc; }, {});
  const buyerSources = activeBuyers.reduce<Record<string, number>>((acc, b) => { if (b.source) acc[b.source] = (acc[b.source] || 0) + 1; return acc; }, {});
  // v_1.9: типы (для блоков «По типам») и динамика добавленных за 6 месяцев (график)
  const suppliersByType = activeSuppliers.reduce<Record<string, number>>((acc, s) => { acc[s.type] = (acc[s.type] || 0) + 1; return acc; }, {});
  const buyersByType = activeBuyers.reduce<Record<string, number>>((acc, b) => { acc[b.type] = (acc[b.type] || 0) + 1; return acc; }, {});
  const MONTHS_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  const [addedPeriod, setAddedPeriod] = useState<'quarter' | 'half' | 'year' | 'custom'>('year'); // v_1.9: по умолчанию «Текущий год»
  const [addedCustomMonth, setAddedCustomMonth] = useState(new Date().toISOString().slice(0, 7));
  const addedByMonth = (() => {
    const now = new Date();
    const keys: string[] = [];
    if (addedPeriod === 'custom') {
      keys.push(addedCustomMonth || new Date().toISOString().slice(0, 7));
    } else {
      const count = addedPeriod === 'quarter' ? 3 : addedPeriod === 'half' ? 6 : now.getMonth() + 1;
      for (let i = count - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
    }
    return keys.map(key => ({
      label: MONTHS_RU[Number(key.slice(5, 7)) - 1],
      sup: activeSuppliers.filter(s => (s.createdAt || '').slice(0, 7) === key).length,
      buy: activeBuyers.filter(b => (b.createdAt || '').slice(0, 7) === key).length,
    }));
  })();
  const maxAdded = Math.max(1, ...addedByMonth.flatMap(m => [m.sup, m.buy]));
  const nowKey = new Date().toISOString().slice(0, 7);
  const curStart = `${nowKey}-01`;
  const curEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

  const todayTasks = (okTasks ? store.tasks : []).filter(t => !t.completed && (isToday(t.dueDate) || isOverdue(t.dueDate)));

  // v1.21.1: информационный блок «Нет ответственного» — сколько записей без ответственного
  // в каждом доступном менеджеру разделе (с учётом его фильтров видимости).
  const noRespRows = [
    { label: 'Поставщиков', value: activeSuppliers.filter(s => !s.responsibleId).length, to: '/suppliers', visible: okSup },
    { label: 'Покупателей', value: activeBuyers.filter(b => !b.responsibleId).length, to: '/buyers', visible: okBuy },
    { label: 'Задач', value: (okTasks ? store.tasks : []).filter(t => !t.deletedAt && !t.responsibleId && canSeeTask(t)).length, to: '/tasks', visible: okTasks },
    { label: 'Поддержки', value: (okSupport ? store.tickets.filter(t => canSeeTicket(t)) : []).filter(t => !t.deletedAt && !t.responsibleId).length, to: '/support', visible: okSupport },
  ].filter(r => r.visible);
  // v_1.9: заявки Маркетинг-кит из форм сайта (статусы «Запрос МК» / «Отправлен МК»)
  const mkRequests = store.mediaRecords.filter(r => r.status === 'Запрос МК' || r.status === 'Отправлен МК');
  const newTickets = (okSupport ? store.tickets.filter(t => canSeeTicket(t)) : []).filter(t => (t.status === 'Новый запрос' || t.status === 'Новый запрос с формы') && !t.deletedAt); // v_1.9: «Новый запрос» / «Новый запрос с формы»

  // Формы: заявки, пришедшие с публичных форм (Настройки → Формы) и ещё не
  // обработанные менеджером — статус "Новый с сайта" служит тем же
  // индикатором "требует внимания", что и "Новая" для обращений.
  type FormSubmission = { id: string; kind: 'supplier' | 'buyer' | 'ticket'; title: string; date: string; to: string };
  // v1.22.3: заявки с сайта — формы пишут статус «Новый с сайта» (legacy — «Лид форма»)
  const SITE_STATUSES = ['Новый с сайта', 'Лид форма'];
  const siteLeadsSup = activeSuppliers.filter(s => s.fromApi && !!s.status && SITE_STATUSES.includes(s.status));
  const siteLeadsBuy = activeBuyers.filter(b => b.fromApi && !!b.status && SITE_STATUSES.includes(b.status));
  const siteLeads = [...siteLeadsSup, ...siteLeadsBuy];
  const formSubmissions: FormSubmission[] = [
    ...activeSuppliers.filter(s => s.fromApi && s.status === 'Новый с сайта').map(s => ({ id: s.id, kind: 'supplier' as const, title: s.tradeName, date: s.createdAt, to: `/suppliers/${s.id}` })),
    ...activeBuyers.filter(b => b.fromApi && b.status === 'Новый с сайта').map(b => ({ id: b.id, kind: 'buyer' as const, title: b.tradeName, date: b.createdAt, to: `/buyers/${b.id}` })),
    ...store.tickets.filter(t => t.fromApi && t.status === 'Новый с сайта' && !t.deletedAt).map(t => ({ id: t.id, kind: 'ticket' as const, title: t.subject, date: t.createdAt, to: `/support/${t.id}` })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const FORM_KIND_ICON: Record<FormSubmission['kind'], typeof Truck> = { supplier: Truck, buyer: ShoppingCart, ticket: HeadphonesIcon };
  const FORM_KIND_LABEL: Record<FormSubmission['kind'], string> = { supplier: 'Поставщик', buyer: 'Покупатель', ticket: 'Обращение' };

  const stats = [
    { label: 'Поставщиков', value: activeSuppliers.length, active: activeSuppliers.filter(s => s.status === 'Активный').length, icon: Truck, to: '/suppliers', color: 'bg-blue-50 text-blue-600' },
    { label: 'Покупателей', value: activeBuyers.length, active: activeBuyers.filter(b => b.status === 'Активный').length, icon: ShoppingCart, to: '/buyers', color: 'bg-green-50 text-green-600' },
    { label: 'Заявок с сайта', value: siteLeads.length, icon: Globe, color: 'bg-purple-50 text-purple-600' }, // v_1.9: карточка не кликабельна, ссылки внутри
    { label: 'Медиа сервис', value: mkRequests.length, icon: FileEdit, to: '/media', color: 'bg-red-50 text-red-600' }, // v_1.9: Маркетинг-кит (Запрос МК/Отправлен МК)
  ];

  const showMediaAlerts = endingSoonRecords.length > 0 || upcomingStartRecords.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(() => {
        function StatCardBody({ stat }: { stat: (typeof stats)[number] }) {
          return (<>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{stat.label}</span>
              <div className={`w-8 h-8 rounded-lg ${stat.color} flex items-center justify-center`}><stat.icon size={16} /></div>
            </div>
            <p className="text-2xl font-bold text-brand-black">{stat.value}</p>
            {stat.label === 'Заявок с сайта' ? (
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5 mt-1.5">
                <Link to="/suppliers?status=Новый с сайта" onClick={e => e.stopPropagation()}
                  className="text-[11px] font-medium px-2 py-1 rounded-md transition-opacity hover:opacity-80 w-full sm:w-auto text-center"
                  style={{ backgroundColor: 'rgb(239, 246, 255)', color: 'rgb(29, 78, 216)' }}>Поставщики: {siteLeadsSup.length}</Link>
                <Link to="/buyers?status=Новый с сайта" onClick={e => e.stopPropagation()}
                  className="text-[11px] font-medium px-2 py-1 rounded-md transition-opacity hover:opacity-80 w-full sm:w-auto text-center"
                  style={{ backgroundColor: 'rgb(239, 246, 255)', color: 'rgb(29, 78, 216)' }}>Покупатели: {siteLeadsBuy.length}</Link>
              </div>
            ) : null}
            {stat.active !== undefined && (
              <p className="mt-1 rounded-lg px-2 py-1 text-sm font-bold" style={{ backgroundColor: 'rgb(220 252 231 / var(--tw-bg-opacity, 1))', color: 'rgb(21 128 61 / var(--tw-text-opacity, 1))' }}>Активных: {stat.active}</p>
            )}
          
          </>);
        }
        return stats.map(stat => (
          stat.to
            ? <button key={stat.label} onClick={() => navigate(stat.to)} className="stat-card hover:shadow-md transition-shadow text-left">
                <StatCardBody stat={stat} />
              </button>
            : <div key={stat.label} className="stat-card text-left">
                <StatCardBody stat={stat} />
              </div>
        ));
        })()}
      </div>

      {/* Нет ответственного (v1.21.1) */}
      {noRespRows.length > 0 && (
        <div className="card-base p-4">
          <h2 className="section-title flex items-center gap-2"><UserX size={16} className="text-brand-red" /> Нет ответственного</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            {noRespRows.map(r => (
              <button key={r.label} onClick={() => navigate(r.to)}
                className="flex items-center justify-between rounded-lg border border-brand-gray-mid px-3 py-2.5 hover:shadow-md transition-shadow text-left">
                <span className="text-xs text-gray-500">{r.label}</span>
                <span className={`text-lg font-bold ${r.value > 0 ? 'text-brand-red' : 'text-brand-black'}`}>{r.value}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Media alerts */}
      {showMediaAlerts && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {endingSoonRecords.length > 0 && (
            <div className="card-base p-4 border-red-200 bg-red-50">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-red-700 flex items-center gap-2"><AlertTriangle size={16} className="text-red-500" />Заканчивается размещение ({endingSoonRecords.length})</h2>
                <button onClick={() => navigate('/media')} className="text-xs text-red-600 hover:underline">Всё →</button>
              </div>
              <div className="space-y-2">
                {endingSoonRecords.slice(0, 3).map(r => {
                  const dl = daysLeft(r.endDate);
                  return (
                    <div key={r.id} onClick={() => navigate('/media')} className="flex items-center justify-between p-2 bg-white rounded-lg border border-red-100 cursor-pointer hover:bg-red-50 transition-colors">
                      <div><p className="text-xs font-semibold text-brand-black">{r.supplierName}</p><p className="text-xs text-gray-500">{r.adTypeName}</p></div>
                      <div className="text-right">
                        <div className="flex items-center gap-1"><Clock size={10} className="text-red-500" /><span className="text-xs font-bold text-red-600">{dl <= 0 ? 'Истёк!' : `${dl} дн.`}</span></div>
                        <p className="text-xs text-gray-400">{formatDate(r.endDate)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {upcomingStartRecords.length > 0 && (
            <div className="card-base p-4 border-yellow-200 bg-yellow-50">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-yellow-700 flex items-center gap-2"><Video size={16} className="text-yellow-500" />Скоро начало (ожидает места) ({upcomingStartRecords.length})</h2>
                <button onClick={() => navigate('/media')} className="text-xs text-yellow-600 hover:underline">Всё →</button>
              </div>
              <div className="space-y-2">
                {upcomingStartRecords.slice(0, 3).map(r => {
                  const dl = daysLeft(r.startDate);
                  return (
                    <div key={r.id} onClick={() => navigate('/media')} className="flex items-center justify-between p-2 bg-white rounded-lg border border-yellow-100 cursor-pointer hover:bg-yellow-50 transition-colors">
                      <div><p className="text-xs font-semibold text-brand-black">{r.supplierName}</p><p className="text-xs text-gray-500">{r.adTypeName}</p></div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-yellow-700">{dl <= 0 ? 'Сегодня!' : `через ${dl} дн.`}</span>
                        <p className="text-xs text-gray-400">{formatDate(r.startDate)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today tasks */}
        <div className="card-base p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title flex items-center gap-2"><CheckSquare size={16} className="text-brand-red" /> Задачи на сегодня</h2>
            <button onClick={() => navigate('/tasks')} className="text-xs text-brand-red hover:underline">Все →</button>
          </div>
          {todayTasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Нет задач на сегодня</p>
          ) : (
            <div className="space-y-2">
              {todayTasks.slice(0, 5).map(task => (
                <div key={task.id} onClick={() => navigate('/tasks')} className="p-2 bg-brand-gray rounded-md cursor-pointer hover:bg-brand-gray-mid transition-colors">
                  {/* v_1.9: одна горизонтальная строка: название (…) · мета · просрочка */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-brand-black truncate min-w-0" title={task.title}>{task.title}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      {task.entityName && <span className="text-xs text-gray-400 whitespace-nowrap">{task.entityName}</span>}
                      {isOverdue(task.dueDate) && !isToday(task.dueDate) && (
                        <span className="text-xs text-red-500 flex items-center gap-1 whitespace-nowrap"><AlertCircle size={10} /> Просрочена</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => navigate('/tasks')} className="btn-primary w-full justify-center mt-3 text-xs"><Plus size={14} /> Новая задача</button>
        </div>

        {/* New tickets */}
        <div className="card-base p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title flex items-center gap-2"><HeadphonesIcon size={16} className="text-brand-red" /> Поддержка</h2>
            <button onClick={() => navigate('/support')} className="text-xs text-brand-red hover:underline">Все →</button>
          </div>
          {newTickets.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Новых обращений нет</p>
          ) : (
            <div className="space-y-2">
              {[...newTickets].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5).map(t => ( // ТЗ v1.22.40: новые сверху
                <div key={t.id} onClick={() => navigate(`/support/${t.id}`)} className="p-2 bg-brand-gray rounded-md cursor-pointer hover:bg-brand-gray-mid transition-colors">
                  {/* v_1.9: слева тема+мета, статус — в правый угол */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-brand-black truncate" title={t.subject}>{t.subject}</p>
                      <p className="text-xs text-gray-400 truncate">{t.contactName && <span className="font-medium text-gray-600">{t.contactName} · </span>}{t.type} · {formatDateTime(t.createdAt)}</p>
                    </div>
                    <div className="shrink-0"><StatusBadge status={t.status} /></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Формы: заявки с сайта */}
      {formSubmissions.length > 0 && (
        <div className="card-base p-4 border-purple-200 bg-purple-50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-purple-700 flex items-center gap-2"><FileEdit size={16} className="text-purple-500" /> Новые заявки с сайта ({formSubmissions.length})</h2>
          </div>
          <div className="space-y-2">
            {formSubmissions.slice(0, 5).map(f => {
              const Icon = FORM_KIND_ICON[f.kind];
              return (
                <div key={f.id} onClick={() => navigate(f.to)} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-purple-100 cursor-pointer hover:bg-purple-50 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0"><Icon size={14} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-black truncate">{f.title}</p>
                    <p className="text-xs text-gray-400">{FORM_KIND_LABEL[f.kind]} · {formatDateTime(f.date)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

            <div className="card-base p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-brand-black">Сервис проценки: требует внимания</h3>
          <span className="text-xs text-gray-400">Новое: <b className="text-brand-black">{ssNew}</b> · Склады: <b className="text-brand-black">{ssWh}</b> · Изменения: <b className="text-brand-black">{ssChanged}</b></span>
        </div>
        {ssItems.length === 0 ? (
          <p className="text-sm text-gray-400">Все условия загружены на платформу</p>
        ) : (
          <div className="space-y-1.5">
            {ssItems.slice(0, 10).map((item, i) => (
              <button key={i} onClick={() => navigate(`/suppliers/${item.supplierId}`)}
                className="w-full flex items-center gap-2 text-left px-3 py-1.5 rounded-xl hover:bg-brand-gray transition-colors">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${item.status === 'Новое' ? 'bg-red-50 text-red-700 border border-red-200' : item.status === 'Новый' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>{item.status}</span>
                <span className="text-sm text-brand-black font-medium truncate">{item.supplierName}</span>
                <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{item.city}</span>
              </button>
            ))}
            {ssItems.length > 10 && <p className="text-xs text-gray-400 text-center">и ещё {ssItems.length - 10}…</p>}
          </div>
        )}
      </div>

{/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-base p-4">
          <h2 className="section-title mb-4">Поставщики по статусам</h2>
          {supplierPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={supplierPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {supplierPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400 text-center py-8">Нет данных</p>}
        </div>

        <div className="card-base p-4">
          <h2 className="section-title mb-4">Покупатели по статусам</h2>
          {buyerPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={buyerPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {buyerPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400 text-center py-8">Нет данных</p>}
        </div>

        <div className="card-base p-4">
          <h2 className="section-title mb-4">Источники поставщиков</h2>
          {Object.keys(supplierSources).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(supplierSources).map(([src, cnt], i) => (
                <div key={src} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-600">{src}</span><span className="font-medium">{cnt}</span></div>
                    <div className="h-1.5 bg-brand-gray rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(cnt / activeSuppliers.length) * 100}%`, background: COLORS[i % COLORS.length] }} /></div>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-4">Нет данных</p>}
        </div>

        <div className="card-base p-4">
          <h2 className="section-title mb-4">Источники покупателей</h2>
          {Object.keys(buyerSources).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(buyerSources).map(([src, cnt], i) => (
                <div key={src} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-600">{src}</span><span className="font-medium">{cnt}</span></div>
                    <div className="h-1.5 bg-brand-gray rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(cnt / activeBuyers.length) * 100}%`, background: COLORS[i % COLORS.length] }} /></div>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-4">Нет данных</p>}
        </div>
      </div>

      {/* v_1.9: типы под источниками */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-base p-4">
          <h2 className="section-title mb-4">Поставщики по типам</h2>
          {Object.keys(suppliersByType).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(suppliersByType).map(([name, value], i) => (
                <div key={name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-600">{name}</span><span className="font-medium">{value}</span></div>
                    <div className="h-1.5 bg-brand-gray rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${activeSuppliers.length ? (value / activeSuppliers.length) * 100 : 0}%`, background: COLORS[i % COLORS.length] }} /></div>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-4">Нет данных</p>}
        </div>
        <div className="card-base p-4">
          <h2 className="section-title mb-4">Покупатели по типам</h2>
          {Object.keys(buyersByType).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(buyersByType).map(([name, value], i) => (
                <div key={name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-600">{name}</span><span className="font-medium">{value}</span></div>
                    <div className="h-1.5 bg-brand-gray rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${activeBuyers.length ? (value / activeBuyers.length) * 100 : 0}%`, background: COLORS[i % COLORS.length] }} /></div>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-4">Нет данных</p>}
        </div>
      </div>

            {/* Plan/fact link */}
      <div className="card-base p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><TrendingUp size={18} className="text-brand-red" /><h2 className="section-title">План / Факт</h2></div>
          <button onClick={() => navigate('/planfact')} className="btn-secondary text-xs">Открыть →</button>
        </div>
        {/* v_1.9: сводки план-факт по текущему месяцу */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          {(['suppliers', 'buyers'] as const).map(kind => {
            const label = kind === 'suppliers' ? 'Активная сводка поставщики' : 'Активная сводка покупатели';
            const list = kind === 'suppliers' ? activeSuppliers : activeBuyers;
            const key = nowKey;
            const plan = (store.settings.planFact || []).filter(e => !e.deletedAt && e.kind === kind && e.startDate <= curEnd && e.endDate >= curStart).reduce((s, e) => s + (e.plan || 0), 0);
            const act = list.filter(x => x.status === 'Активный' && (x.createdAt || '').slice(0, 7) === key).length;
            const pct = plan ? Math.min(100, Math.round((act / plan) * 100)) : null;
            return (
              <div key={kind} className="rounded-xl border border-brand-gray-mid px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-gray-700">{label}</p>
                  <span className="text-[10px] text-gray-400">Период: текущий месяц</span>
                </div>
                <div className="flex items-end gap-3">
                  <p className="text-2xl font-bold text-brand-black leading-none">{pct === null ? '—' : `${pct}%`}</p>
                  <span className="text-[11px] text-gray-400 pb-0.5">выполнения общего плана</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-semibold"
                    style={{ backgroundColor: '#e5e7ebcc', color: 'rgb(55 65 81 / var(--tw-text-opacity, 1))' }}>План: {plan}</span>
                  <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-semibold"
                    style={{ backgroundColor: 'rgb(220 252 231 / var(--tw-bg-opacity, 1))', color: 'rgb(21 128 61 / var(--tw-text-opacity, 1))' }}>Активный факт: {act}</span>
                </div>
                {plan > 0 && <div className="mt-2 h-2 rounded-full bg-brand-gray overflow-hidden"><div className="h-full bg-brand-black rounded-full transition-all" style={{ width: `${pct}%` }} /></div>}
              </div>
            );
          })}
        </div>
      </div>
{/* v_1.9: график «Добавлено» — 6 месяцев, поставщики/покупатели */}
      <div className="card-base p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="section-title">Добавлено</h2>
          <div className="flex flex-wrap items-center gap-1">
            {(['quarter', 'half', 'year', 'custom'] as const).map(p => (
              <button key={p} onClick={() => setAddedPeriod(p)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${addedPeriod === p ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500 hover:bg-brand-gray'}`}>
                {p === 'quarter' ? 'За квартал' : p === 'half' ? 'Полугодие' : p === 'year' ? 'Текущий год' : 'Произвольный'}
              </button>
            ))}
            {addedPeriod === 'custom' && (
              <input type="month" className="form-input text-[11px] py-0.5 px-2 w-auto" value={addedCustomMonth} onChange={e => setAddedCustomMonth(e.target.value)} />
            )}
          </div>
        </div>
        <div className="flex gap-4 text-[11px] text-gray-500 mb-3">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#3B82F6' }} /> Поставщиков</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#10B981' }} /> Покупателей</span>
        </div>
        <div className="flex items-end gap-3 h-36">
          {addedByMonth.map(m => (
            <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end justify-center gap-1 h-28">
                <div className="w-1/3 rounded-t" style={{ height: `${(m.sup / maxAdded) * 100}%`, background: '#3B82F6', minHeight: m.sup ? 3 : 0 }} title={`Поставщиков: ${m.sup}`} />
                <div className="w-1/3 rounded-t" style={{ height: `${(m.buy / maxAdded) * 100}%`, background: '#10B981', minHeight: m.buy ? 3 : 0 }} title={`Покупателей: ${m.buy}`} />
              </div>
              <span className="text-[10px] text-gray-400">{m.label}</span>
              <span className="text-[10px] font-medium text-gray-600">{m.sup}/{m.buy}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
