import { useState } from 'react';
import type { RequisitesData } from '@/types';
import { Edit2, Save, X } from 'lucide-react';
import { toast } from 'sonner';

interface RequisitesTabProps {
  requisites: RequisitesData;
  onSave: (data: RequisitesData) => void;
}

const FIELDS = [
  { key: 'legalName', label: 'Юридическое название' },
  { key: 'legalAddress', label: 'Юридический адрес' },
  { key: 'ogrn', label: 'ОГРН / ОГРНИП' },
  { key: 'kpp', label: 'КПП' },
  { key: 'director', label: 'Руководитель' },
  { key: 'bank', label: 'Банк' },
  { key: 'bik', label: 'БИК' },
  { key: 'accountNumber', label: 'Расчётный счёт' },
  { key: 'corrAccount', label: 'Корр. счёт' },
];

export default function RequisitesTab({ requisites, onSave }: RequisitesTabProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<RequisitesData>({ ...requisites });

  function handleSave() {
    onSave(form);
    setEditing(false);
    toast.success('Реквизиты сохранены');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="section-title">Реквизиты</h3>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="btn-secondary text-xs">
            <Edit2 size={14} /> Редактировать
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleSave} className="btn-primary text-xs">
              <Save size={14} /> Сохранить
            </button>
            <button onClick={() => { setForm({ ...requisites }); setEditing(false); }} className="btn-secondary text-xs">
              <X size={14} /> Отмена
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FIELDS.map(field => (
          <div key={field.key}>
            <label className="form-label">{field.label}</label>
            {editing ? (
              <input
                className="form-input"
                value={(form as Record<string, string | undefined>)[field.key] || ''}
                onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
              />
            ) : (
              <p className="text-sm text-brand-black py-2">
                {(requisites as Record<string, string | undefined>)[field.key] || <span className="text-gray-300">—</span>}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
