import { useState, useMemo } from 'react';
import { getStore, updateStore, useStoreVersion } from '@/lib/store';
import { generateId } from '@/lib/utils';
import { getCurrentUser, canSeeAnalyticsCity } from '@/lib/auth';
import { toast } from 'sonner';
import { exportToCSV } from '@/lib/utils';
import MarketVolumeTab from './MarketVolumeTab';
import { canExport } from '@/lib/auth';
import {X, Download, Building, Users, Package, Hash, Video, BarChart2} from 'lucide-react';
import { COMPANY_SCORE_COLORS } from '@/constants';

// Склады/SKU считаются из warehouseLocations (полей warehouseCount/skuCount у поставщика нет)
// Замороженные склады не участвуют в аналитике (считаются несуществующими)
const whCountOf = (s: any) => (s.warehouseLocations || []).filter((w: any) => w.status !== 'Заморожен').length;
const skuTotalOf = (s: any) => (s.warehouseLocations || []).filter((w: any) => w.status !== 'Заморожен').reduce((sum: number, w: any) => sum + (w.skuCount || 0), 0);

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#6B7280', '#14B8A6', '#F97316'];
const PERIODS = [
  { key: 'day', label: 'Текущий день' }, { key: 'week', label: 'Текущая неделя' }, { key: 'month', label: 'Текущий месяц' },
  { key: 'quarter', label: 'Квартал' }, { key: 'half', label: 'Полугодие' }, { key: 'year', label: 'Текущий год' },
  { key: 'custom', label: 'Произвольный' },
];
const ANALYTICS_TABS = ['Скоринг поставщиков', 'Объём рынка', 'Статистика сервисов', 'Категории компаний', 'Статистика медиа', 'Статистика пользователей'];

function getPeriodRange(period: string): { from: Date; to: Date } {
  // Календарные периоды (ТЗ): день=сегодня, неделя=пн–вс, месяц=текущий,
  // квартал/полугодие — как у налоговой, год=текущий календарный.
  const now = new Date();
  const y = now.getFullYear(); const m = now.getMonth();
  let from: Date; let to: Date;
  if (period === 'day') { from = new Date(y, m, now.getDate()); to = new Date(y, m, now.getDate(), 23, 59, 59); }
  else if (period === 'week') { const dow = (now.getDay() + 6) % 7; from = new Date(y, m, now.getDate() - dow); to = new Date(y, m, now.getDate() - dow + 6, 23, 59, 59); }
  else if (period === 'month') { from = new Date(y, m, 1); to = new Date(y, m + 1, 0, 23, 59, 59); }
  else if (period === 'quarter') { const q = Math.floor(m / 3) * 3; from = new Date(y, q, 1); to = new Date(y, q + 3, 0, 23, 59, 59); }
  else if (period === 'half') { const h = m < 6 ? 0 : 6; from = new Date(y, h, 1); to = new Date(y, h + 6, 0, 23, 59, 59); }
  else { from = new Date(y, 0, 1); to = new Date(y, 11, 31, 23, 59, 59); }
  return { from, to };
}

function formatRub(val: number) { return val.toLocaleString('ru-RU') + ' ₽'; }

function ScoreDistribution({ data, title }: { data: { score: number; count: number }[]; title: string }) {
  return (
    <div className="card-base p-4">
      <h3 className="section-title mb-4">{title}</h3>
      <div className="space-y-2">
        {data.map(({ score, count }) => {
          const cfg = COMPANY_SCORE_COLORS[score] || COMPANY_SCORE_COLORS[0];
          const total = data.reduce((s, d) => s + d.count, 0);
          return (
            <div key={score} className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0" style={{ background: cfg.bg, color: cfg.text }}>{cfg.label}</span>
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-0.5"><span>Оценка {score}</span><span className="font-medium">{count}</span></div>
                <div className="h-1.5 bg-brand-gray rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: total > 0 ? `${(count / total) * 100}%` : '0%', background: cfg.text }} />
                </div>
              </div>
            </div>
          );
        })}
        {data.every(d => d.count === 0) && <p className="text-center text-gray-400 text-sm py-4">Нет данных</p>}
      </div>
    </div>
  );
}

// Period filter for media/services tabs
function PeriodFilter({ period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo }: {
  period: string; setPeriod: (v: string) => void;
  customFrom: string; setCustomFrom: (v: string) => void;
  customTo: string; setCustomTo: (v: string) => void;
}) {
  const MEDIA_PERIODS = [
    { key: 'half', label: 'Полугодие' }, { key: 'year', label: 'Год' }, { key: 'custom', label: 'Произвольный' },
  ];
  return (
    <div className="actions-bar flex flex-wrap gap-2 items-center mb-4">
      {/* v1.31.8: первая вкладка */}
      <button type="button" className="action-btn action-btn-active">Аналитика CRM</button>
      {MEDIA_PERIODS.map(p => (
        <button key={p.key} onClick={() => setPeriod(p.key)}
          className={`action-btn ${period === p.key ? 'action-btn-active' : ''}`}>
          {p.label}
        </button>
      ))}
      {period === 'custom' && (
        <>
          <input type="date" className="form-input py-1.5 text-xs w-auto" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
          <span className="text-xs text-gray-400">—</span>
          <input type="date" className="form-input py-1.5 text-xs w-auto" value={customTo} onChange={e => setCustomTo(e.target.value)} />
        </>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  useStoreVersion(); // re-render on real-time changes from other users (see src/lib/realtime.ts)
  const store = getStore();
  const [period, setPeriod] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [analyticsTab, setAnalyticsTab] = useState('Скоринг поставщиков'); // v_1.9: по умолчанию — скоринг
  // v_1.9: сортировка детализации «Оборот»
  const [revSort, setRevSort] = useState<{ key: 'revenue' | 'inventory' | 'margin' | 'gross'; dir: 1 | -1 } | null>(null);
  // v_1.9: выбор строк «Оборот» + создание задачи (по образцу «База лидов»)
  const [revSelected, setRevSelected] = useState<string[]>([]);
  const [revTaskForm, setRevTaskForm] = useState({ show: false, type: '', respId: '', dueDate: '', desc: '' });
  const [scoringDetail, setScoringDetail] = useState<'inventory' | 'warehouse' | 'stm' | 'revenue'>('warehouse'); // v_1.9: какую детализацию показывать
  const [scoringFilterStatus, setScoringFilterStatus] = useState('');
  const [scoringFilterCity, setScoringFilterCity] = useState('');
  const [scoringFilterSupplier, setScoringFilterSupplier] = useState('');
  const [mediaPeriod, setMediaPeriod] = useState('year');
  const [mediaCustomFrom, setMediaCustomFrom] = useState('');
  const [mediaCustomTo, setMediaCustomTo] = useState('');

  const { from, to } = useMemo(() => {
    if (period === 'custom' && customFrom && customTo) return { from: new Date(customFrom), to: new Date(customTo + 'T23:59:59') };
    return getPeriodRange(period);
  }, [period, customFrom, customTo]);

  const { from: mediaFrom, to: mediaTo } = useMemo(() => {
    if (mediaPeriod === 'custom' && mediaCustomFrom && mediaCustomTo) return { from: new Date(mediaCustomFrom), to: new Date(mediaCustomTo + 'T23:59:59') };
    return getPeriodRange(mediaPeriod);
  }, [mediaPeriod, mediaCustomFrom, mediaCustomTo]);

  const inRange = (dateStr: string) => { const d = new Date(dateStr); return d >= from && d <= to; };
  const suppliers = store.suppliers.filter(s => !s.deletedAt && inRange(s.createdAt));
  const buyers = store.buyers.filter(b => !b.deletedAt && inRange(b.createdAt));
  const allActiveSuppliers = store.suppliers.filter(s => !s.deletedAt);
  const allActiveBuyers = store.buyers.filter(b => !b.deletedAt);

  const suppliersByStatus = suppliers.reduce<Record<string, number>>((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {});
  const buyersByStatus = buyers.reduce<Record<string, number>>((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});
  const buyersByCity = buyers.reduce<Record<string, number>>((acc, b) => { if (b.city && canSeeAnalyticsCity(b.city)) acc[b.city] = (acc[b.city] || 0) + 1; return acc; }, {});
  const buyerCityData = Object.entries(buyersByCity).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));
  const buyersByType = buyers.reduce<Record<string, number>>((acc, b) => { acc[b.type] = (acc[b.type] || 0) + 1; return acc; }, {});
  const suppliersByType = suppliers.reduce<Record<string, number>>((acc, s) => { acc[s.type] = (acc[s.type] || 0) + 1; return acc; }, {});
  const supplierSources = suppliers.reduce<Record<string, number>>((acc, s) => { if (s.source) acc[s.source] = (acc[s.source] || 0) + 1; return acc; }, {});
  const buyerSources = buyers.reduce<Record<string, number>>((acc, b) => { if (b.source) acc[b.source] = (acc[b.source] || 0) + 1; return acc; }, {});
  const sourceData = [...new Set([...Object.keys(supplierSources), ...Object.keys(buyerSources)])].map(src => ({ name: src, suppliers: supplierSources[src] || 0, buyers: buyerSources[src] || 0 }));

  const scoringCities = useMemo(() => [...new Set(allActiveSuppliers.map(s => s.city).filter(Boolean))].filter(canSeeAnalyticsCity).sort(), [allActiveSuppliers]);
  const SUPPLIER_STATUSES_LIST = useMemo(() => store.settings.statuses.filter(s => s.entityTypes.includes('supplier')).map(s => s.name), [store.settings.statuses]);

  const scoringSuppliers = useMemo(() => {
    let list = allActiveSuppliers;
    if (scoringFilterStatus) list = list.filter(s => s.status === scoringFilterStatus);
    if (scoringFilterCity) list = list.filter(s => s.city === scoringFilterCity);
    return list;
  }, [allActiveSuppliers, scoringFilterStatus, scoringFilterCity]);

  const scoringStats = useMemo(() => {
    let totalRevenue = 0, totalInventory = 0, totalWarehouses = 0, totalSKU = 0, withScoring = 0, withoutScoring = 0, revenueCount = 0, totalSTM = 0, totalGross = 0;
    scoringSuppliers.forEach(s => {
      const hasAny = s.scoring?.annualRevenue || s.scoring?.employees || whCountOf(s) || skuTotalOf(s);
      if (hasAny) withScoring++; else withoutScoring++;
      if (s.scoring?.revenue) { totalRevenue += s.scoring.revenue; revenueCount++; } // v_1.9: общий оборот = Выручка · стр. 2110
      if ((s.ownBrands || []).length > 0) totalSTM++; // v_1.9: поставщики с СТМ
      if (s.scoring?.grossProfit) totalGross += s.scoring.grossProfit; // v_1.9
      if (s.scoring?.inventory) totalInventory += s.scoring.inventory; // v_1.9: Всего запасов (стр. 1210 по всем)
      if (whCountOf(s)) totalWarehouses += whCountOf(s);
      if (skuTotalOf(s)) totalSKU += skuTotalOf(s);
    });
    return { totalRevenue, totalInventory, totalWarehouses, totalSKU, withScoring, withoutScoring, revenueCount, totalSTM, totalGross, avgRevenue: revenueCount > 0 ? totalRevenue / revenueCount : 0 };
  }, [scoringSuppliers]);

  const scoringTableData = scoringSuppliers
    .filter(s => !scoringFilterSupplier || (s.tradeName || '').toLowerCase().includes(scoringFilterSupplier.toLowerCase()))
    .filter(s => s.scoring?.annualRevenue || s.scoring?.employees || s.scoring?.revenue || s.scoring?.inventory || s.scoring?.grossProfit || whCountOf(s) || skuTotalOf(s)); // v_1.9: поставщики с новым скорингом тоже в таблицах

  function exportScoringData() {
    exportToCSV(scoringTableData.flatMap(s => (s.warehouseLocations || []).filter((w: any) => w.status !== 'Заморожен').map(w => ({
      'Поставщик (название)': s.tradeName,
      'Город (название) склада': w.city,
      'SKU': w.skuCount || 0,
    }))), `scoring_${Date.now()}.csv`);
  }

  const supplierScoreData = useMemo(() => Array.from({ length: 11 }, (_, i) => 10 - i).map(score => ({ score, count: allActiveSuppliers.filter(s => Math.round(s.companyScore || 0) === score).length })), [allActiveSuppliers]);
  const buyerScoreData = useMemo(() => Array.from({ length: 11 }, (_, i) => 10 - i).map(score => ({ score, count: allActiveBuyers.filter(b => Math.round(b.companyScore || 0) === score).length })), [allActiveBuyers]);
  const avgSupplierScore = allActiveSuppliers.length > 0 ? (allActiveSuppliers.reduce((s, sup) => s + (sup.companyScore || 0), 0) / allActiveSuppliers.length).toFixed(1) : '—';
  const avgBuyerScore = allActiveBuyers.length > 0 ? (allActiveBuyers.reduce((s, b) => s + (b.companyScore || 0), 0) / allActiveBuyers.length).toFixed(1) : '—';

  // ── MEDIA STATS ──────────────────────────────────────────
  // ── СТАТИСТИКА ПОЛЬЗОВАТЕЛЕЙ (ТЗ) ──
  const usersRange = useMemo(() => {
    if (period === 'custom' && customFrom && customTo) return { from: new Date(customFrom), to: new Date(customTo) };
    return getPeriodRange(period);
  }, [period, customFrom, customTo]);
  // v_1.9: отсортированные данные «Оборот» (для таблицы и «выбрать все»)
  const sortedRevData = (revSort
    ? [...scoringTableData].sort((a, b) => {
        const val = (x: typeof a) => {
          if (revSort.key === 'margin') { const r = x.scoring?.revenue, g = x.scoring?.grossProfit; return r && g ? g / r : 0; }
          if (revSort.key === 'revenue') return x.scoring?.revenue || 0;
          if (revSort.key === 'inventory') return x.scoring?.inventory || 0;
          return x.scoring?.grossProfit || 0;
        };
        return (val(a) - val(b)) * revSort.dir;
      })
    : scoringTableData);
  const uFrom = usersRange.from.toISOString().slice(0, 10);
  const uTo = usersRange.to.toISOString().slice(0, 10);

  const [mgrView, setMgrView] = useState<'mop' | 'moz'>('mop'); // ТЗ v1.21.8: таблицы менеджеров МОП/МОЗ
  const usersStats = useMemo(() => {
    const users = store.settings.users.filter(u => u.status === 'active');
    const rows = users.map(u => {
      const inRange = (d?: string) => !!d && d.slice(0, 10) >= uFrom && d.slice(0, 10) <= uTo;
      const suppliers = store.suppliers.filter(s => !s.deletedAt && s.responsibleId === u.id && inRange(s.createdAt)).length;
      const buyers = store.buyers.filter(b => !b.deletedAt && b.responsibleId === u.id && inRange(b.createdAt)).length;
      // План/факт: по записям План/Факт, где пользователь назначен ответственным
      const plans = (store.settings.planFact || []).filter(e =>
        !e.deletedAt && e.responsibleId === u.id && e.startDate <= uTo && e.endDate >= uFrom);
      // План/факт: записи planFact уже мигрированы на kind + plan (см. store.ts)
      const planTotal = plans.reduce((s, e) => s + (e.plan || 0), 0);
      let factTotal = 0;
      for (const e of plans) {
        const list = e.kind === 'buyers' ? store.buyers : store.suppliers;
        factTotal += list.filter(x => !x.deletedAt && (!e.cityName || x.city === e.cityName)
          && !!x.createdAt && x.createdAt.slice(0, 10) >= e.startDate && x.createdAt.slice(0, 10) <= e.endDate).length;
      }
      const pct = planTotal ? Math.round((factTotal / planTotal) * 100) : null;
      return {
        id: u.id,
        name: u.name + (u.note ? ` (${u.note})` : ''),
        roleLabel: u.role === 'admin' ? 'Администратор' : 'Менеджер',
        suppliers, buyers, total: suppliers + buyers, pct,
      };
    });
    return {
      rows,
      total: users.length,
      admins: users.filter(u => u.role === 'admin').length,
      managers: users.filter(u => u.role === 'manager').length,
    };
  }, [store.settings.users, store.suppliers, store.buyers, store.settings.planFact, uFrom, uTo]);




  /** Выгрузка отчёта в Excel (CSV с BOM — открывается в Excel как есть). */
  function exportUsersStats() {
    exportToCSV(usersStats.rows.map(r => ({
      'Пользователь': r.name,
      'Роль': r.roleLabel,
      'Поставщики (ответственный)': r.suppliers,
      'Покупатели (ответственный)': r.buyers,
      'Всего объектов': r.total,
      'План/Факт %': r.pct !== null ? r.pct : '',
    })), `users_stats_${uFrom}_${uTo}.csv`);
  }

  const mediaRecords = useMemo(() => {
    return (store.mediaRecords || []).filter(r => !r.deletedAt && r.status !== 'Анулирован');
  }, [store.mediaRecords]);

  const mediaInRange = useMemo(() => {
    return mediaRecords.filter(r => {
      const d = new Date(r.createdAt);
      return d >= mediaFrom && d <= mediaTo;
    });
  }, [mediaRecords, mediaFrom, mediaTo]);

  const activeMediaRecords = useMemo(() => mediaRecords.filter(r => r.status === 'Активен на платформе'), [mediaRecords]);

  // Potential monthly revenue: sum(adType.spotsCount * adType.pricePerMonth) for all ad types
  const potentialMonthlyRevenue = useMemo(() => {
    return (store.settings.mediaAdTypes || []).reduce((sum, at) => sum + at.spotsCount * at.pricePerMonth, 0);
  }, [store.settings.mediaAdTypes]);

  // Actual revenue: active records
  const actualMonthlyRevenue = useMemo(() => activeMediaRecords.reduce((sum, r) => sum + (r.pricePerMonth || 0), 0), [activeMediaRecords]);
  const actualTotalRevenue = useMemo(() => activeMediaRecords.reduce((sum, r) => sum + (r.totalPrice || 0), 0), [activeMediaRecords]);

  // All placed revenue (not cancelled, all time)
  const placedTotalRevenue = useMemo(() => mediaRecords.reduce((sum, r) => sum + (r.totalPrice || 0), 0), [mediaRecords]);

  // By status
  const mediaByStatus = useMemo(() => {
    return mediaRecords.reduce<Record<string, number>>((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  }, [mediaRecords]);

  // By ad type
  const mediaByAdType = useMemo(() => {
    return mediaRecords.reduce<Record<string, { count: number; revenue: number }>>((acc, r) => {
      if (!acc[r.adTypeName]) acc[r.adTypeName] = { count: 0, revenue: 0 };
      acc[r.adTypeName].count++;
      acc[r.adTypeName].revenue += r.totalPrice || 0;
      return acc;
    }, {});
  }, [mediaRecords]);

  // Spots usage per ad type
  const spotsUsage = useMemo(() => {
    return (store.settings.mediaAdTypes || []).map(at => {
      const activeCount = mediaRecords.filter(r => r.adTypeId === at.id && r.status === 'Активен на платформе').length;
      return { name: at.name, total: at.spotsCount, used: activeCount, available: at.spotsCount - activeCount };
    });
  }, [store.settings.mediaAdTypes, mediaRecords]);

  // ── SERVICES STATS ───────────────────────────────────────
  const BASE_SERVICES = ['DBS', 'MARKET', 'MEDIA'];
  const allServices = useMemo(() => {
    const fromSettings = (store.settings.supplierServices || []).map(s => s.name);
    return [...new Set([...BASE_SERVICES, ...fromSettings])];
  }, [store.settings.supplierServices]);

  const serviceStats = useMemo(() => {
    return allServices.map(svc => {
      const count = allActiveSuppliers.filter(s => (s.services || []).includes(svc)).length;
      const pct = allActiveSuppliers.length > 0 ? ((count / allActiveSuppliers.length) * 100).toFixed(1) : '0';
      return { name: svc, count, pct };
    }).sort((a, b) => b.count - a.count);
  }, [allServices, allActiveSuppliers]);

  const serviceChartData = serviceStats.map(s => ({ name: s.name, Поставщиков: s.count }));

  // Suppliers with multiple services
  const multiServiceSuppliers = allActiveSuppliers.filter(s => (s.services || []).length >= 2);
  const noServiceSuppliers = allActiveSuppliers.filter(s => !s.services || s.services.length === 0);

  return (
    <div className="space-y-6 animate-fade-in">

      <div className="card-base overflow-hidden">
        <div className="flex overflow-x-auto border-b border-brand-gray-mid">
          {ANALYTICS_TABS.map(t => (
            <button key={t} onClick={() => setAnalyticsTab(t)}
              className={`tab-button flex-shrink-0 ${analyticsTab === t ? 'tab-active' : 'tab-inactive'}`}>{t}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6">

          {/* ── ОБЩАЯ СТАТИСТИКА ── */}
          {analyticsTab === 'Скоринг поставщиков' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="section-title flex-1">Данные скоринга поставщиков</h2>
                <select className="form-input py-1.5 text-xs w-auto" value={scoringFilterSupplier} onChange={e => setScoringFilterSupplier(e.target.value)}><option value="">Все поставщики</option>{scoringSuppliers.map(s => <option key={s.id} value={s.tradeName}>{s.tradeName}</option>)}</select>
          <select className="form-input py-1.5 text-xs w-auto" value={scoringFilterStatus} onChange={e => setScoringFilterStatus(e.target.value)}><option value="">Все статусы</option>{SUPPLIER_STATUSES_LIST.map(s => <option key={s}>{s}</option>)}</select>
                <select className="form-input py-1.5 text-xs w-auto" value={scoringFilterCity} onChange={e => setScoringFilterCity(e.target.value)}><option value="">Все города</option>{scoringCities.map(c => <option key={c}>{c}</option>)}</select>
                {canExport() && scoringTableData.length > 0 && <button onClick={exportScoringData} className="btn-secondary text-xs"><Download size={14} /> Выгрузить</button>}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <button onClick={() => setScoringDetail('revenue')} className={`stat-card border-blue-200 text-left transition-shadow ${scoringDetail === 'revenue' ? 'ring-2 ring-blue-400' : 'hover:shadow-md'}`}><div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center"><Building size={16} className="text-blue-600" /></div><p className="text-xs text-gray-500">Общий оборот</p></div>{scoringStats.totalRevenue > 0 ? <p className="text-lg font-bold text-brand-black">{formatRub(scoringStats.totalRevenue)}</p> : <p className="text-sm text-gray-300">Нет данных</p>}</button>
                {/* v_1.9: каждый блок — кнопка, открывает свою детализацию */}
                
                <button onClick={() => setScoringDetail('warehouse')} className={`stat-card border-yellow-200 text-left transition-shadow ${scoringDetail === 'warehouse' ? 'ring-2 ring-yellow-400' : 'hover:shadow-md'}`}><div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center"><Package size={16} className="text-yellow-600" /></div><p className="text-xs text-gray-500">Всего складов и SKU</p></div>{scoringStats.totalWarehouses > 0 || scoringStats.totalSKU > 0 ? <p className="text-lg font-bold text-brand-black">{scoringStats.totalWarehouses} · {scoringStats.totalSKU.toLocaleString('ru')} <span className="text-xs font-normal text-gray-400">SKU</span></p> : <p className="text-sm text-gray-300">Нет данных</p>}</button>
                <button onClick={() => setScoringDetail('stm')} className={`stat-card border-purple-200 text-left transition-shadow ${scoringDetail === 'stm' ? 'ring-2 ring-purple-400' : 'hover:shadow-md'}`}><div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center"><Hash size={16} className="text-purple-600" /></div><p className="text-xs text-gray-500">Поставщики с СТМ</p></div><p className="text-lg font-bold text-brand-black">{scoringStats.totalSTM}</p></button>
                  <div className="stat-card border-green-200"><div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center"><Package size={16} className="text-green-600" /></div><p className="text-xs text-gray-500">Всего запасов</p></div>{scoringStats.totalInventory > 0 ? <p className="text-lg font-bold text-brand-black">{scoringStats.totalInventory.toLocaleString('ru')}</p> : <p className="text-sm text-gray-300">Нет данных</p>}<p className="text-[11px] text-gray-500 mt-1">Всего валовой прибыли (стр. 2100): <b className="text-brand-black">{scoringStats.totalGross > 0 ? scoringStats.totalGross.toLocaleString('ru') : '—'}</b></p></div>
              </div>
              {scoringDetail === 'inventory' ? (
                <div className="card-base overflow-hidden">
                  <div className="p-3 border-b border-brand-gray-mid"><h3 className="section-title">Детализация — Запасы ({scoringTableData.filter(s => s.scoring?.inventory).length})</h3></div>
                  <div className="table-scroll"><table className="w-full"><thead><tr className="border-b border-brand-gray-mid"><th className="table-header">Поставщик</th><th className="table-header">Запасы · стр. 1210</th></tr></thead><tbody>{scoringTableData.filter(s => s.scoring?.inventory).map(s => <tr key={s.id} className="border-b border-brand-gray-mid hover:bg-brand-gray"><td className="table-cell font-medium text-sm">{s.tradeName}</td><td className="table-cell text-xs">{s.scoring!.inventory!.toLocaleString('ru')}</td></tr>)}{scoringTableData.filter(s => s.scoring?.inventory).length === 0 && <tr><td colSpan={2} className="text-center py-6 text-gray-400 text-xs">Нет данных по запасам</td></tr>}</tbody></table></div>
                </div>
              ) : scoringDetail === 'warehouse' ? (
                scoringTableData.length === 0 ? <p className="text-center text-gray-400 py-8 text-sm">Нет данных скоринга.</p> : (
                <div className="card-base overflow-hidden">
                  <div className="p-3 border-b border-brand-gray-mid"><h3 className="section-title">Детализация — Склады ({scoringTableData.reduce((n, s) => n + whCountOf(s), 0)})</h3></div>
                  <div className="table-scroll"><table className="w-full"><thead><tr className="border-b border-brand-gray-mid"><th className="table-header">Поставщик (название)</th><th className="table-header">Город (название) склада</th><th className="table-header">SKU</th></tr></thead><tbody>{scoringTableData.flatMap(s => (s.warehouseLocations || []).map(w => <tr key={w.id} className="border-b border-brand-gray-mid hover:bg-brand-gray"><td className="table-cell font-medium text-sm">{s.tradeName}</td><td className="table-cell text-xs">{w.city}</td><td className="table-cell text-xs">{(w.skuCount || 0).toLocaleString('ru')}</td></tr>))}{scoringTableData.reduce((n, s) => n + whCountOf(s), 0) === 0 && <tr><td colSpan={3} className="text-center py-6 text-gray-400 text-xs">Нет созданных складов у выбранных поставщиков</td></tr>}</tbody></table></div>
                </div>
              )
              ) : scoringDetail === 'revenue' ? (
                <div className="card-base overflow-hidden">
                  <div className="p-3 border-b border-brand-gray-mid"><h3 className="section-title">Детализация — Оборот (Выручка · стр. 2110)</h3></div>
                  {/* v_1.9: скрытое меню выбранных — как в «База лидов» */}
                  {revSelected.length > 0 && !revTaskForm.show && (
                    <div className="p-3 flex flex-wrap items-center gap-2 bg-blue-50 border-t border-blue-200 animate-fade-in">
                      <span className="text-xs font-medium text-blue-700">Выбрано: {revSelected.length}</span>
                      <button onClick={() => setRevTaskForm(f => ({ ...f, show: true }))} className="btn-primary text-xs">Создать задачу</button>
                      <button onClick={() => setRevSelected([])} className="btn-secondary text-xs">Снять выбор</button>
                    </div>
                  )}
                  {/* v_1.9: форма создания задачи — как в «База лидов» */}
                  {revTaskForm.show && (
                    <div className="card-base p-4 animate-fade-in">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="section-title">Создать задачу ({revSelected.length} поставщиков)</h3>
                        <button onClick={() => setRevTaskForm(f => ({ ...f, show: false }))} className="text-gray-400 hover:text-brand-red"><X size={18} /></button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="form-label">Тип задачи</label>
                          <select className="form-input" value={revTaskForm.type} onChange={e => setRevTaskForm(f => ({ ...f, type: e.target.value }))}>
                            <option value="">Выберите тип…</option>
                            {(getStore().settings.taskTypes || []).map(tt => <option key={tt} value={tt}>{tt}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="form-label">Исполнитель</label>
                          <select className="form-input" value={revTaskForm.respId} onChange={e => setRevTaskForm(f => ({ ...f, respId: e.target.value }))}>
                            <option value="">{getCurrentUser()?.name || 'Я'}</option>
                            {(getStore().settings.users || []).filter(ux => ux.status === 'active').map(ux => <option key={ux.id} value={ux.id}>{ux.name}</option>)}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="form-label">Описание — что будем делать со списком</label>
                          <textarea className="form-input min-h-[90px]" placeholder="Например: обзвонить, отправить КП..." value={revTaskForm.desc} onChange={e => setRevTaskForm(f => ({ ...f, desc: e.target.value }))} />
                          <p className="text-xs text-gray-400 mt-1">В описание будет добавлена ссылка на Excel со списком (открывается только из панели CRM).</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button onClick={() => {
                          if (!revTaskForm.type) { toast.error('Выберите тип задачи'); return; } // v_1.9: срок — сегодня по умолчанию
                          const u = getCurrentUser();
                          const resp = (getStore().settings.users || []).find(x => x.id === revTaskForm.respId);
                          const taskId = generateId();
                          const names = sortedRevData.filter(s => revSelected.includes(s.id)).map(s => s.tradeName);
                          const now = new Date().toISOString();
                          updateStore(s => ({ ...s, tasks: [...s.tasks, {
                            id: taskId, entityKind: 'suppliers', entityIds: [...revSelected], exportKind: 'suppliers',
                            entityName: names.slice(0, 3).join(', ') + (names.length > 3 ? ` и ещё ${names.length - 3}` : ''),
                            title: `Аналитика скоринга: ${revSelected.length} поставщиков`, entityType: revTaskForm.type,
                            description: `${revTaskForm.desc ? revTaskForm.desc + '\n' : ''}Список поставщиков (Excel): ${window.location.origin}/entity-export/${taskId}\n${names.join(', ')}`,
                            dueDate: revTaskForm.dueDate || new Date().toISOString().slice(0, 10), taskStatus: 'Новая', responsibleId: revTaskForm.respId || u?.id, // v_1.9
                            responsibleName: resp?.name || u?.name, createdBy: u?.id, history: [], createdAt: now, updatedAt: now,
                          }] }));
                          toast.success(`Задача создана по ${revSelected.length} поставщикам`);
                          setRevSelected([]); setRevTaskForm({ show: false, type: '', respId: '', dueDate: '', desc: '' });
                        }} className="btn-primary text-xs">Создать задачу</button>
                        <button onClick={() => setRevTaskForm(f => ({ ...f, show: false }))} className="btn-secondary text-xs">Отмена</button>
                      </div>
                    </div>
                  )}
                                    <div className="table-scroll"><table className="w-full"><thead><tr className="border-b border-brand-gray-mid">
                    <th className="table-header w-8"><input type="checkbox" className="accent-blue-600" title="Выбрать все"
                        checked={revSelected.length > 0 && sortedRevData.every(s => revSelected.includes(s.id))}
                        onChange={() => setRevSelected(sel => sortedRevData.every(s => sel.includes(s.id)) ? [] : sortedRevData.map(s => s.id))} /></th>
                    <th className="table-header">Поставщик</th>
                    {([['revenue', 'Выручка · стр. 2110'], ['inventory', 'Запасы · стр. 1210'], ['margin', 'Маржа · 2100/2110 × 100%'], ['gross', 'Валовая прибыль · стр. 2100']] as const).map(([key, label]) => (
                      <th key={key} className="table-header cursor-pointer select-none hover:text-brand-black" title="Сортировка больше/меньше"
                        onClick={() => setRevSort(s => s && s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 })}>
                        {label} {revSort?.key === key ? (revSort.dir === -1 ? '↓' : '↑') : '↕'}
                      </th>
                    ))}
                  </tr></thead><tbody>
                    {sortedRevData.map(s => {
                      const rev = s.scoring?.revenue;
                      const inv = s.scoring?.inventory;
                      const gp = s.scoring?.grossProfit;
                      const margin = rev && gp ? Math.round((gp / rev) * 10000) / 100 : null;
                      return (<tr key={s.id} className="border-b border-brand-gray-mid hover:bg-brand-gray">
                        <td className="table-cell"><input type="checkbox" className="accent-blue-600" checked={revSelected.includes(s.id)}
                          onChange={() => setRevSelected(sel => sel.includes(s.id) ? sel.filter(x => x !== s.id) : [...sel, s.id])} /></td>
                        <td className="table-cell font-medium text-sm">{s.tradeName}</td>
                        <td className="table-cell text-xs">{rev != null ? rev.toLocaleString('ru') : '—'}</td>
                        <td className="table-cell text-xs">{inv != null ? inv.toLocaleString('ru') : '—'}</td>
                        <td className="table-cell text-xs">{margin != null ? margin + '%' : '—'}</td>
                        <td className="table-cell text-xs">{gp != null ? gp.toLocaleString('ru') : '—'}</td>
                      </tr>);
                    })}
                    {scoringTableData.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-gray-400 text-xs">Нет данных скоринга</td></tr>}
                  </tbody></table></div>
                </div>
              ) : scoringDetail === 'stm' ? (
                <div className="card-base overflow-hidden">
                  <div className="p-3 border-b border-brand-gray-mid"><h3 className="section-title">Детализация — Поставщики с СТМ ({scoringTableData.filter(s => (s.ownBrands || []).length > 0).length})</h3></div>
                  <div className="table-scroll"><table className="w-full"><thead><tr className="border-b border-brand-gray-mid">
                    <th className="table-header">Поставщик</th><th className="table-header">Бренды СТМ</th>
                  </tr></thead><tbody>
                    {scoringTableData.filter(s => (s.ownBrands || []).length > 0).map(s => (
                      <tr key={s.id} className="border-b border-brand-gray-mid hover:bg-brand-gray">
                        <td className="table-cell font-medium text-sm">{s.tradeName}</td>
                        <td className="table-cell text-xs">{(s.ownBrands || []).join(', ')}</td>
                      </tr>
                    ))}
                    {scoringTableData.filter(s => (s.ownBrands || []).length > 0).length === 0 && <tr><td colSpan={2} className="text-center py-6 text-gray-400 text-xs">Нет поставщиков с СТМ</td></tr>}
                  </tbody></table></div>
                </div>
                  
                  
              ) : null}
            </div>
          )}

          {/* ── ОЦЕНКА КОМПАНИЙ ── */}
          {analyticsTab === 'Категории компаний' && (
          <div className="card-base p-4">
            <h2 className="section-title mb-4">Категории компаний</h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="stat-card border-green-200"><p className="text-xs text-gray-500">Всего поставщиков в оценке</p><p className="text-3xl font-bold text-green-600">{allActiveSuppliers.length}</p></div>
              <div className="stat-card border-blue-200"><p className="text-xs text-gray-500">Всего покупателей в оценке</p><p className="text-3xl font-bold text-blue-600">{allActiveBuyers.length}</p></div>
            </div>
            <h3 className="text-sm font-semibold mb-3">Поставщики по категориям</h3>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {(['A', 'B', 'C'] as const).map(c => {
                const n = allActiveSuppliers.filter(s => (s.category ?? 'C') === c).length;
                const pct = allActiveSuppliers.length ? Math.round((n / allActiveSuppliers.length) * 100) : 0;
                return (
                  <div key={c} className="stat-card text-center">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold mb-2" style={{ A: { background: 'rgb(209, 250, 229)', color: 'rgb(6, 95, 70)' }, B: { background: 'rgb(239, 246, 255)', color: 'rgb(30, 64, 175)' }, C: { background: 'rgb(254, 243, 199)', color: 'rgb(180, 83, 9)' } }[c]}>{c}</span>
                    <p className="text-xs text-gray-500">Категория – {c}</p>
                    <p className="text-2xl font-bold text-brand-black">{n} <span className="text-xs font-normal text-gray-400">({pct}%)</span></p>
                  </div>
                );
              })}
            </div>
            <h3 className="text-sm font-semibold mb-3">Покупатели по категориям</h3>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {(['A', 'B', 'C'] as const).map(c => {
                const n = allActiveBuyers.filter(x => (x.category ?? 'C') === c).length;
                const pct = allActiveBuyers.length ? Math.round((n / allActiveBuyers.length) * 100) : 0;
                return (
                  <div key={c} className="stat-card text-center">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold mb-2" style={{ A: { background: 'rgb(209, 250, 229)', color: 'rgb(6, 95, 70)' }, B: { background: 'rgb(239, 246, 255)', color: 'rgb(30, 64, 175)' }, C: { background: 'rgb(254, 243, 199)', color: 'rgb(180, 83, 9)' } }[c]}>{c}</span>
                    <p className="text-xs text-gray-500">Категория – {c}</p>
                    <p className="text-2xl font-bold text-brand-black">{n} <span className="text-xs font-normal text-gray-400">({pct}%)</span></p>
                  </div>
                );
              })}
            </div>
            <div className="stat-card">
              <h3 className="text-sm font-semibold mb-3">Группы товаров поставщиков</h3>
              {(() => {
                const groups: Record<string, number> = {};
                allActiveSuppliers.forEach(s => (s.productGroups || []).forEach(g => { groups[g] = (groups[g] || 0) + 1; }));
                const entries = Object.entries(groups).sort((x, y) => y[1] - x[1]);
                const max = Math.max(1, ...entries.map(e => e[1]));
                if (!entries.length) return <p className="text-sm text-gray-400 py-4 text-center">Нет данных</p>;
                return (
                  <div className="space-y-2">
                    {entries.map(([name, value], i) => (
                      <div key={name} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-600">{name}</span><span className="font-medium">{value} <span className="text-gray-400">({Math.round((value / allActiveSuppliers.length) * 100)}%)</span></span></div>
                          <div className="h-1.5 bg-brand-gray rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, background: COLORS[i % COLORS.length] }} /></div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
          )}

          {/* ── СТАТИСТИКА МЕДИА ── */}
          {analyticsTab === 'Статистика медиа' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="section-title flex items-center gap-2"><Video size={16} className="text-brand-red" /> Статистика медиа сервиса</h2>
              </div>

              <PeriodFilter period={mediaPeriod} setPeriod={setMediaPeriod} customFrom={mediaCustomFrom} setCustomFrom={setMediaCustomFrom} customTo={mediaCustomTo} setCustomTo={setMediaCustomTo} />

              {/* Key metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="stat-card border-purple-200">
                  <p className="text-xs text-gray-500">Рекламодателей</p>
                  <p className="text-3xl font-bold text-purple-600">{new Set(mediaRecords.map(r => r.supplierId)).size}</p>
                  <p className="text-xs text-gray-400 mt-1">уникальных поставщиков</p>
                </div>
                <div className="stat-card border-green-200">
                  <p className="text-xs text-gray-500">Активных размещений</p>
                  <p className="text-3xl font-bold text-green-600">{activeMediaRecords.length}</p>
                  <p className="text-xs text-gray-400 mt-1">в статусе «Активен»</p>
                </div>
                <div className="stat-card border-blue-200">
                  <p className="text-xs text-gray-500">Потенциал в месяц</p>
                  <p className="text-lg font-bold text-blue-600">{formatRub(potentialMonthlyRevenue)}</p>
                  <p className="text-xs text-gray-400 mt-1">все места × тариф</p>
                </div>
                <div className="stat-card border-red-200">
                  <p className="text-xs text-gray-500">Факт в месяц</p>
                  <p className="text-lg font-bold text-brand-red">{formatRub(actualMonthlyRevenue)}</p>
                  <p className="text-xs text-gray-400 mt-1">активные размещения</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="stat-card">
                  <p className="text-xs text-gray-500">Выручка (активные, итого)</p>
                  <p className="text-xl font-bold text-brand-black">{formatRub(actualTotalRevenue)}</p>
                </div>
                <div className="stat-card">
                  <p className="text-xs text-gray-500">Всего размещено (не аннул.)</p>
                  <p className="text-xl font-bold text-brand-black">{formatRub(placedTotalRevenue)}</p>
                </div>
                <div className="stat-card">
                  <p className="text-xs text-gray-500">Заполняемость мест</p>
                  <p className="text-xl font-bold text-brand-black">
                    {potentialMonthlyRevenue > 0 ? ((actualMonthlyRevenue / potentialMonthlyRevenue) * 100).toFixed(0) + '%' : '—'}
                  </p>
                </div>
              </div>

              {/* By status */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card-base p-4">
                  <h3 className="section-title mb-4">Размещения по статусам</h3>
                  {Object.keys(mediaByStatus).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(mediaByStatus).map(([status, count], i) => {
                        const ms = (store.settings.mediaStatuses || []).find(s => s.name === status);
                        const style = ms ? { background: ms.bgColor, color: ms.textColor } : { background: '#F3F4F6', color: '#374151' };
                        return (
                          <div key={status} className="flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={style}>{status}</span>
                            <span className="text-sm font-semibold">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="text-center text-gray-400 py-4 text-sm">Нет данных</p>}
                </div>

                <div className="card-base p-4">
                  <h3 className="section-title mb-4">По типу рекламы</h3>
                  {Object.keys(mediaByAdType).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(mediaByAdType).map(([name, { count, revenue }]) => (
                        <div key={name} className="flex items-center justify-between border-b border-brand-gray-mid pb-1.5 last:border-0">
                          <div>
                            <p className="text-xs font-medium">{name}</p>
                            <p className="text-xs text-gray-400">{count} размещ.</p>
                          </div>
                          <p className="text-xs font-semibold text-brand-red">{formatRub(revenue)}</p>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-center text-gray-400 py-4 text-sm">Нет данных</p>}
                </div>
              </div>

              {/* Spots usage */}
              <div className="card-base p-4">
                <h3 className="section-title mb-4">Загрузка мест по форматам</h3>
                <div className="space-y-3">
                  {spotsUsage.map(item => {
                    const pct = item.total > 0 ? (item.used / item.total) * 100 : 0;
                    return (
                      <div key={item.name}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium">{item.name}</span>
                          <span className="text-gray-500">{item.used} / {item.total} мест ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-2 bg-brand-gray rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-brand-red transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── СТАТИСТИКА СЕРВИСОВ ── */}
          {analyticsTab === 'Статистика сервисов' && (
            <div className="space-y-6">
              <h2 className="section-title flex items-center gap-2"><BarChart2 size={16} className="text-brand-red" /> Статистика сервисов продаж</h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* v_1.9: левая колонка — вертикальные блоки: всего + DBS/FBS/MEDIA */}
                <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                  <div className="stat-card border-brand-black">
                    <p className="text-xs text-gray-500">Всего поставщиков в оценке</p>
                    <p className="text-2xl font-bold text-brand-black">{allActiveSuppliers.length}</p>
                  </div>
                  {serviceStats.map((svc, ix) => (
                    <div key={svc.name} className="stat-card">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold" style={{ color: COLORS[ix % COLORS.length] }}>{svc.name}</p>
                        <p className="text-xs text-gray-400">{svc.pct}% поставщиков</p>
                      </div>
                      <p className="text-xl font-bold text-brand-black">{svc.count}</p>
                    </div>
                  ))}
                </div>

                <div className="card-base p-4">
                  <h3 className="section-title mb-4">Детализация</h3>
                  <div className="space-y-2">
                    {serviceStats.map((svc, i) => (
                      <div key={svc.name} className="flex items-center gap-2">
                        <span className="text-xs font-bold w-14 shrink-0 px-2 py-0.5 rounded text-center" style={{ background: COLORS[i % COLORS.length] + '20', color: COLORS[i % COLORS.length] }}>{svc.name}</span>
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-0.5">
                            <span>{svc.count} поставщиков</span>
                            <span className="font-medium">{svc.pct}%</span>
                          </div>
                          <div className="h-1.5 bg-brand-gray rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${svc.pct}%`, background: COLORS[i % COLORS.length] }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-brand-gray-mid space-y-1">
                    <div className="flex justify-between text-xs"><span className="text-gray-500">Подключено 2+ сервисов</span><span className="font-semibold">{multiServiceSuppliers.length}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-gray-500">Без сервисов</span><span className="font-semibold text-gray-400">{noServiceSuppliers.length}</span></div>
                  </div>
                </div>
              </div>

                            {/* Per service detail */}
              <div className="card-base overflow-hidden">
                <div className="p-3 border-b border-brand-gray-mid"><h3 className="section-title">Поставщики по каждому сервису</h3></div>
                <div className="table-scroll">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-brand-gray-mid">
                        <th className="table-header">Поставщик</th>
                        {serviceStats.map(s => <th key={s.name} className="table-header text-center">{s.name}</th>)}
                        <th className="table-header">Всего</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allActiveSuppliers.filter(s => (s.services || []).length > 0).slice(0, 20).map(s => (
                        <tr key={s.id} className="border-b border-brand-gray-mid hover:bg-brand-gray">
                          <td className="table-cell text-sm font-medium">{s.tradeName}</td>
                          {serviceStats.map(svc => (
                            <td key={svc.name} className="table-cell text-center">
                              {(s.services || []).includes(svc.name)
                                ? <span className="text-green-600 font-bold">✓</span>
                                : <span className="text-gray-200">—</span>}
                            </td>
                          ))}
                          <td className="table-cell text-xs font-semibold">{(s.services || []).length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── ОБЪЁМ РЫНКА ── */}
          {analyticsTab === 'Объём рынка' && (
            <MarketVolumeTab />
          )}

          {/* ── СТАТИСТИКА ПОЛЬЗОВАТЕЛЕЙ ── */}
          {analyticsTab === 'Статистика пользователей' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="section-title flex items-center gap-2"><Users size={16} className="text-brand-red" /> Статистика пользователей</h2>
                {canExport() && <button onClick={exportUsersStats} className="btn-secondary text-xs"><Download size={14} /> Выгрузить в Excel</button>}
              </div>

              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="stat-card"><p className="text-2xl font-bold">{usersStats.total}</p><p className="text-xs text-gray-500">Всего пользователей</p></div>
                <div className="stat-card"><p className="text-2xl font-bold">{usersStats.admins}</p><p className="text-xs text-gray-500">Администраторов</p></div>
                <div className="stat-card"><p className="text-2xl font-bold">{usersStats.managers}</p><p className="text-xs text-gray-500">Менеджеров</p></div>
              </div>

              {/* ТЗ v1.21.8: общая таблица пользователей */}
              <div className="card-base overflow-hidden">
                <div className="table-scroll">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-brand-gray-mid">
                        <th className="table-header">Дата создания</th>
                        <th className="table-header">Имя</th>
                        <th className="table-header">Роль</th>
                        <th className="table-header">Назначение</th>
                        <th className="table-header">Статус</th>
                        <th className="table-header">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {store.settings.users.map(u => (
                        <tr key={u.id} className="border-b border-brand-gray-mid hover:bg-brand-gray">
                          <td className="table-cell whitespace-nowrap">{(u.createdAt || '').slice(0, 10) || '—'}</td>
                          <td className="table-cell font-medium">{u.name}</td>
                          <td className="table-cell">{u.role === 'admin' ? 'Администратор' : 'Менеджер'}</td>
                          <td className="table-cell">
                            {u.dashboardType === 'mop' && <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">МОП</span>}
                            {u.dashboardType === 'moz' && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">МОЗ</span>}
                            {!u.dashboardType && <span className="text-xs text-gray-400">—</span>}
                          </td>
                          <td className="table-cell">
                            <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${u.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                              {u.status === 'active' ? 'Работает' : 'Уволен'}
                            </span>
                          </td>
                          <td className="table-cell">{u.email || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ТЗ v1.21.8: две кнопки — каждая со своей таблицей менеджеров */}
              <div className="flex flex-wrap gap-2 mt-6 mb-3">
                <button onClick={() => setMgrView('mop')} className={`btn-secondary text-xs py-1.5 px-3 ${mgrView === 'mop' ? 'bg-gray-200' : ''}`}>Менеджеры МОП</button>
                <button onClick={() => setMgrView('moz')} className={`btn-secondary text-xs py-1.5 px-3 ${mgrView === 'moz' ? 'bg-gray-200' : ''}`}>Менеджеры МОЗ</button>
              </div>
              <div className="card-base overflow-hidden">
                <div className="table-scroll">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-brand-gray-mid">
                        <th className="table-header">Имя</th>
                        {mgrView === 'mop' ? <th className="table-header">Покупатели (закреплено)</th> : <th className="table-header">Поставщики (закреплено)</th>}
                        {mgrView === 'mop' && <th className="table-header">Города</th>}
                        <th className="table-header">Активные планы</th>
                      </tr>
                    </thead>
                    <tbody>
                      {store.settings.users
                        .filter(u => u.role === 'manager' && u.dashboardType === mgrView)
                        .map(u => {
                          const isMop = mgrView === 'mop';
                          const objects = isMop
                            ? store.buyers.filter(b => !b.deletedAt && b.responsibleId === u.id).length
                            : store.suppliers.filter(x => !x.deletedAt && x.responsibleId === u.id).length;
                          const today = new Date().toISOString().slice(0, 10);
                          const plans = (store.settings.planFact || []).filter(p => !p.deletedAt
                            && p.kind === (isMop ? 'buyers' : 'suppliers')
                            && p.responsibleId === u.id
                            && p.startDate <= today && p.endDate >= today).length;
                          return (
                            <tr key={u.id} className="border-b border-brand-gray-mid hover:bg-brand-gray">
                              <td className="table-cell font-medium">{u.name}</td>
                              <td className="table-cell">{objects}</td>
                              {isMop && (
                                <td className="table-cell">
                                  {(u.allowedCities && u.allowedCities.length > 0)
                                    ? <div className="flex flex-wrap gap-1">{u.allowedCities.map(c => <span key={c} className="text-xs px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200 text-gray-500">{c}</span>)}</div>
                                    : <span className="text-xs text-gray-400">Все города</span>}
                                </td>
                              )}
                              <td className="table-cell">{plans}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
