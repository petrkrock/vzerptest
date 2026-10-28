import { useState, useRef } from 'react';
import { X, Upload, CheckCircle } from 'lucide-react';
import { parseCSV } from '@/lib/utils';
import { toast } from 'sonner';

interface ImportModalProps {
  onClose: () => void;
  onImport: (rows: Record<string, string>[]) => void;
  entityLabel: string;
  sampleFields: string[];
}

export default function ImportModal({ onClose, onImport, entityLabel, sampleFields }: ImportModalProps) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      setRows(parsed);
    };
    reader.readAsText(file, 'utf-8');
  }

  function handleImport() {
    if (!rows.length) { toast.error('Файл пуст или не выбран'); return; }
    onImport(rows);
    toast.success(`Импортировано ${rows.length} записей`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="card-base w-full max-w-lg p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Импорт {entityLabel}</h2>
          <button onClick={onClose} className="p-1 hover:bg-brand-gray rounded"><X size={18} /></button>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-brand-gray-mid rounded-lg p-8 text-center cursor-pointer hover:border-brand-red transition-colors mb-4"
        >
          {fileName ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle size={32} className="text-green-500" />
              <p className="text-sm font-medium text-brand-black">{fileName}</p>
              <p className="text-xs text-gray-400">{rows.length} записей найдено</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload size={32} className="text-gray-300" />
              <p className="text-sm text-gray-500">Нажмите для выбора CSV файла</p>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />

        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">Ожидаемые колонки (разделитель — точка с запятой):</p>
          <div className="flex flex-wrap gap-1">
            {sampleFields.map(f => (
              <span key={f} className="text-xs bg-brand-gray px-2 py-0.5 rounded">{f}</span>
            ))}
          </div>
        </div>

        {rows.length > 0 && (
          <div className="mb-4 max-h-32 overflow-y-auto border border-brand-gray-mid rounded p-2">
            <p className="text-xs text-gray-500 mb-1">Превью ({Math.min(3, rows.length)} из {rows.length}):</p>
            {rows.slice(0, 3).map((r, i) => (
              <div key={i} className="text-xs text-brand-black py-0.5 border-b border-brand-gray-mid last:border-0">
                {Object.values(r).slice(0, 3).join(' | ')}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">Отмена</button>
          <button onClick={handleImport} disabled={!rows.length} className="btn-primary">
            <Upload size={16} /> Импортировать
          </button>
        </div>
      </div>
    </div>
  );
}
