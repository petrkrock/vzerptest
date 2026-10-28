import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Save, Edit2, Trash2, X, Store, ShoppingCart, MapPin } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getStore, updateStore, useStoreVersion } from '@/lib/store';
import { generateId } from '@/lib/utils';
import type { MarketVolumeRecord } from '@/types';
import { canSeeAnalyticsCity } from '@/lib/auth';

/** Аналитика → «Объём рынка»: снимки по поставщикам (общие, с ручным «всего на рынке»)
 *  и по покупателям (по городам). Авто-значения фиксируются в момент снимка. */

const dstr = (d: Date) => d.toISOString().slice(0, 10);

function capture(kind: 'suppliers' | 'buyers', city?: string) {
  const store = getStore();
  const all = (kind === 'suppliers' ? store.suppliers : store.buyers)
    .filter(x => !x.deletedAt && (!city || x.city === city));
  return { inBase: all.length, active: all.filter(x => x.status && /актив/i.test(x.status)).length };
}

function Section({ kind, title, icon }: { kind: 'suppliers' | 'buyers'; title: string; icon: React.ReactNode }) {
  useStoreVersion();
  const [, forceUpdate] = useState(0);
  const store = getStore();
  const cities = store.settings.cities || [];
  const records = (store.settings.marketVolumes || []).filter(r => r.kind === kind);

  const [filterCity, setFilterCity] = useState('');                 // только покупатели
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ date: string; city?: string; marketTotal?: number }>({ date: dstr(new Date()) });

  const list = records
    .filter(r => (!filterCity || r.city === filterCity) && canSeeAnalyticsCity(r.city))
    .sort((a, b) => b.date.localeCompare(a.date));
  const [selectedDate, setSelectedDate] = useState('');
  const selected = list.find(r => r.date === selectedDate) || list[0];

  function openCreate() {
    setEditingId(null);
    setForm({ date: dstr(new Date()), city: kind === 'buyers' ? (filterCity || cities[0] || '') : undefined, marketTotal: 0 });
    setShowForm(true);
  }
  function openEdit(r: MarketVolumeRecord) {
    setEditingId(r.id);
    setForm({ date: r.date, city: r.city, marketTotal: r.marketTotal });
    setShowForm(true);
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (kind === 'buyers' && !form.city) { toast.error('Выберите город'); return; }
    const now = new Date().toISOString();
    const snap = capture(kind, form.city);
    updateStore(s => {
      const all = s.settings.marketVolumes || [];
      const rec: MarketVolumeRecord = {
        id: editingId || generateId(), kind, date: form.date, city: form.city,
        marketTotal: form.marketTotal || 0,
        inBase: snap.inBase, active: snap.active, createdAt: now, updatedAt: now,
      };
      return { ...s, settings: { ...s.settings, marketVolumes: editingId ? all.map(x => x.id === editingId ? { ...rec, createdAt: x.createdAt } : x) : [...all, rec] } };
    });
    setShowForm(false); forceUpdate(n => n + 1);
    toast.success(editingId ? 'Снимок обновлён (авто-значения пересчитаны)' : 'Снимок объёма рынка создан');
  }
  function remove(id: string) {
    if (!confirm('Удалить снимок?')) return;
    updateStore(s => ({ ...s, settings: { ...s.settings, marketVolumes: (s.settings.marketVolumes || []).filter(x => x.id !== id) } }));
    forceUpdate(n => n + 1); toast.success('Снимок удалён');
  }

  const penetration = selected?.marketTotal ? Math.round((selected.inBase / selected.marketTotal) * 100) : null;
  const chartData = [...list].sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({ date: r.date, 'Всего на рынке': r.marketTotal || 0, 'В базе': r.inBase, 'Активных': r.active }));

  return (
    <div className="card-base overflow-hidden">
      <div className="p-3 border-b border-brand-gray-mid flex items-center justify-between flex-wrap gap-2">
        <h3 className="section-title flex items-center gap-2">{icon} {title}</h3>
        <div className="flex items-center gap-2">
          {kind === 'buyers' && (
            <select className="form-input py-1.5 text-xs w-auto" value={filterCity} onChange={e => { setFilterCity(e.target.value); setSelectedDate(''); }}>
              <option value="">Все города</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <button onClick={openCreate} className="btn-primary text-xs"><Plus size={14} /> Создать</button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={save} className="p-3 bg-blue-50 border-b border-blue-100 animate-fade-in">
          <div className="flex flex-wrap items-end gap-2">
            <div><label className="form-label">Дата снимка</label><input type="date" required className="form-input py-1.5 text-xs w-auto" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            {kind === 'buyers' && (
              <div><label className="form-label">Город *</label>
                <select required className="form-input py-1.5 text-xs w-auto" value={form.city || ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}>
                  <option value="">— выберите —</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select></div>
            )}
            <div><label className="form-label">{kind === 'suppliers' ? 'Всего поставщиков на рынке *' : 'Всего покупателей на рынке *'}</label><input type="number" min="0" required className="form-input py-1.5 text-xs w-36" value={form.marketTotal || 0} onChange={e => setForm(f => ({ ...f, marketTotal: parseInt(e.target.value) || 0 }))} /></div>
            <button type="submit" className="btn-primary text-xs py-1.5"><Save size={12} /> Сохранить</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-xs py-1.5"><X size={12} /></button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">«В базе» и «Активных» подставятся автоматически из системы на момент сохранения.</p>
        </form>
      )}

      <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Всего на рынке</p><p className="text-2xl font-bold">{selected?.marketTotal ?? '—'}</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Всего в базе</p><p className="text-2xl font-bold">{selected ? selected.inBase : '—'}</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Активных</p><p className="text-2xl font-bold">{selected ? selected.active : '—'}</p>
          {selected && selected.inBase > 0 && <p className="text-[10px] text-gray-400">доля активных: {Math.round((selected.active / selected.inBase) * 100)}%</p>}</div>
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Проникновение в базу</p><p className="text-2xl font-bold">{penetration !== null ? `${penetration}%` : '—'}</p>
          <p className="text-[10px] text-gray-400">в базе / рынок</p></div>
      </div>

      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <label className="text-xs text-gray-500">Снимок на дату:</label>
          <select className="form-input py-1 text-xs w-auto" value={selected?.date || ''} onChange={e => setSelectedDate(e.target.value)}>
            {list.map(r => <option key={r.id} value={r.date}>{r.date}{r.city ? ` · ${r.city}` : ''}</option>)}
            {!list.length && <option value="">— нет снимков —</option>}
          </select>
          {list.length > 0 && (
            <span className="flex gap-1 ml-auto">
              {selected && <button onClick={() => openEdit(selected)} className="p-1 text-gray-400 hover:text-brand-black" title="Редактировать снимок"><Edit2 size={13} /></button>}
              {selected && <button onClick={() => remove(selected.id)} className="p-1 text-gray-400 hover:text-brand-red" title="Удалить снимок"><Trash2 size={13} /></button>}
            </span>
          )}
        </div>
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ bottom: 5 }}>
              <XAxis dataKey="date" fontSize={9} />
              <YAxis fontSize={9} />
              <Tooltip />
              <Legend fontSize={9} />
              <Bar dataKey="Всего на рынке" fill="#C7D2FE" radius={[3, 3, 0, 0]} />
              <Bar dataKey="В базе" fill={kind === 'suppliers' ? '#3B82F6' : '#10B981'} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Активных" fill={kind === 'suppliers' ? '#93C5FD' : '#86EFAC'} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/** Дашборд по городам: покупатели — последний снимок на каждый город
 *  (или живой подсчёт из базы, если снимка нет) + итоговая строка. */
function BuyerCitiesDashboard() {
  useStoreVersion();
  const store = getStore();
  const cities = store.settings.cities || [];
  const records = (store.settings.marketVolumes || []).filter(r => r.kind === 'buyers');
  const buyers = store.buyers.filter(b => !b.deletedAt);

  const rows = cities.filter(canSeeAnalyticsCity).map(city => {
    const cityBuyers = buyers.filter(b => b.city === city);
    const snaps = records.filter(r => r.city === city).sort((a, b) => b.date.localeCompare(a.date));
    const latest = snaps[0];
    const inBase = latest ? latest.inBase : cityBuyers.length;
    const active = latest ? latest.active : cityBuyers.filter(b => b.status && /актив/i.test(b.status)).length;
    const marketTotal = latest?.marketTotal ?? null;
    const penetration = marketTotal ? Math.round((inBase / marketTotal) * 100) : null;
    return { city, date: latest?.date || null, inBase, active, marketTotal, penetration };
  }).filter(r => r.inBase > 0 || r.marketTotal !== null);

  const totals = rows.reduce((acc, r) => ({
    inBase: acc.inBase + r.inBase,
    active: acc.active + r.active,
    marketTotal: acc.marketTotal + (r.marketTotal ?? 0),
    hasMarket: acc.hasMarket || r.marketTotal !== null,
  }), { inBase: 0, active: 0, marketTotal: 0, hasMarket: false });

  return (
    <div className="card-base overflow-hidden">
      <div className="p-3 border-b border-brand-gray-mid">
        <h3 className="section-title flex items-center gap-2"><MapPin size={15} className="text-brand-red" /> Дашборд по городам: покупатели</h3>
        <p className="text-[10px] text-gray-400 mt-0.5">Последний снимок на город; без снимка — живой подсчёт из базы. Проникновение = в базе / всего на рынке.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400 border-b border-brand-gray-mid">
              <th className="p-2">Город</th>
              <th className="p-2">Снимок</th>
              <th className="p-2 text-right">Всего на рынке</th>
              <th className="p-2 text-right">В базе</th>
              <th className="p-2 text-right">Активных</th>
              <th className="p-2 text-right">Доля активных</th>
              <th className="p-2 text-right">Проникновение</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.city} className="border-b border-brand-gray">
                <td className="p-2 font-medium text-brand-black">{r.city}</td>
                <td className="p-2 text-gray-400">{r.date || '—'}</td>
                <td className="p-2 text-right">{r.marketTotal ?? '—'}</td>
                <td className="p-2 text-right font-semibold">{r.inBase}</td>
                <td className="p-2 text-right">{r.active}</td>
                <td className="p-2 text-right">{r.inBase ? `${Math.round((r.active / r.inBase) * 100)}%` : '—'}</td>
                <td className="p-2 text-right font-semibold text-brand-red">{r.penetration !== null ? `${r.penetration}%` : '—'}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={7} className="p-6 text-center text-gray-400">Нет данных по городам — добавьте покупателей или создайте снимки</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-semibold bg-brand-gray text-brand-black">
                <td className="p-2">Итого</td>
                <td className="p-2" />
                <td className="p-2 text-right">{totals.hasMarket ? totals.marketTotal : '—'}</td>
                <td className="p-2 text-right">{totals.inBase}</td>
                <td className="p-2 text-right">{totals.active}</td>
                <td className="p-2 text-right">{totals.inBase ? `${Math.round((totals.active / totals.inBase) * 100)}%` : '—'}</td>
                <td className="p-2 text-right">{totals.hasMarket && totals.marketTotal ? `${Math.round((totals.inBase / totals.marketTotal) * 100)}%` : '—'}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export default function MarketVolumeTab() {
  return (
    <div className="space-y-6">
      <h2 className="section-title flex items-center gap-2"><Store size={16} className="text-brand-red" /> Объём рынка пользователей</h2>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section kind="suppliers" title="Сводный анализ: поставщики" icon={<Store size={15} className="text-brand-red" />} />
        <Section kind="buyers" title="Сводный анализ: покупатели" icon={<ShoppingCart size={15} className="text-brand-red" />} />
      </div>
      <BuyerCitiesDashboard />
    </div>
  );
}
