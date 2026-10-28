import { useState } from 'react';
import type { ScoreData } from '@/types';
import { calcMargin } from '@/services/checko';
import { Edit2, Save, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface ScoringTabProps {
  scoring: ScoreData;
  inn?: string;
  onSave: (data: ScoreData) => void;
  onRescore?: () => void; // этап 1.8: повторный запрос скоринга по ИНН
}

export default function ScoringTab({ scoring, inn, onSave, onRescore }: ScoringTabProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ScoreData>({ ...scoring });
  // этап 1.8: Маржа всегда пересчитывается из 1210/2110
  const margin = calcMargin(form.grossProfit, form.revenue);

  function handleSave() {
    const saved: ScoreData = { ...form, marginPct: calcMargin(form.grossProfit, form.revenue) };
    onSave(saved);
    setEditing(false);
    toast.success('Данные скоринга сохранены');
  }

  return (
    <div className="space-y-4">
      {/* Заголовок по ТЗ: название + ИНН, год отчёта */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="section-title">Данные скоринга {scoring.companyName || ''}{inn ? ` ${inn}` : ''}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Финансовые показатели за {form.year || '—'} год</p>
        </div>
        <div className="flex gap-2">
          {!editing ? (
            <>
              <button onClick={onRescore} disabled={!inn} className="btn-primary text-xs" title={inn ? `Повторный скоринг по ИНН ${inn}` : 'ИНН не заполнен'}>
                <RefreshCw size={14} /> Скоринг
              </button>
              <button onClick={() => { setForm({ ...scoring }); setEditing(true); }} className="btn-secondary text-xs">
                <Edit2 size={14} /> Редактировать
              </button>
            </>
          ) : (
            <>
              <button onClick={handleSave} className="btn-primary text-xs">
                <Save size={14} /> Сохранить
              </button>
              <button onClick={() => { setForm({ ...scoring }); setEditing(false); }} className="btn-secondary text-xs">
                <X size={14} /> Отмена
              </button>
            </>
          )}
        </div>
      </div>

      {/* Выручка (2110) и Запасы (1210) — отдельные блоки */}
      <div className="grid grid-cols-2 gap-3">
        <div className="stat-card px-3.5 py-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Выручка · стр. 2110</p>
          {editing ? (
            <input type="number" className="form-input mt-1 text-sm font-bold" placeholder="—"
              value={form.revenue ?? ''} onChange={e => setForm(f => ({ ...f, revenue: e.target.value ? Number(e.target.value) : undefined }))} />
          ) : (
            <p className="text-2xl font-bold mt-0.5">{scoring.revenue != null ? scoring.revenue.toLocaleString('ru-RU') : <span className="text-gray-300">—</span>}</p>
          )}
        </div>
        <div className="stat-card px-3.5 py-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Запасы · стр. 1210</p>
          {editing ? (
            <input type="number" className="form-input mt-1 text-sm font-bold" placeholder="—"
              value={form.inventory ?? ''} onChange={e => setForm(f => ({ ...f, inventory: e.target.value ? Number(e.target.value) : undefined }))} />
          ) : (
            <p className="text-2xl font-bold mt-0.5">{scoring.inventory != null ? scoring.inventory.toLocaleString('ru-RU') : <span className="text-gray-300">—</span>}</p>
          )}
        </div>
      </div>

      {/* Общий блок: Маржа (автоформула) + Валовая прибыль (2100) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="stat-card px-3.5 py-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Маржа · 2100/2110 × 100%</p>
          <p className="text-2xl font-bold mt-0.5">{margin != null ? `${margin}%` : <span className="text-gray-300">—</span>}</p>
        </div>
        <div className="stat-card px-3.5 py-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Валовая прибыль · стр. 2100</p>
          {editing ? (
            <input type="number" className="form-input mt-1 text-sm font-bold" placeholder="—"
              value={form.grossProfit ?? ''} onChange={e => setForm(f => ({ ...f, grossProfit: e.target.value ? Number(e.target.value) : undefined }))} />
          ) : (
            <p className="text-2xl font-bold mt-0.5">{scoring.grossProfit != null ? scoring.grossProfit.toLocaleString('ru-RU') : <span className="text-gray-300">—</span>}</p>
          )}
        </div>
      </div>

      {scoring.apiLoaded && (
        <p className="text-xs text-gray-400">Загружено через API Checko: {scoring.apiLoadedAt}</p>
      )}
    </div>
  );
}
