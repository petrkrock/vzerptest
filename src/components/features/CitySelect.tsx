import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface CitySelectProps {
  value: string;
  onChange: (value: string) => void;
  cities: string[];
  required?: boolean;
  placeholder?: string;
}

/**
 * Выпадающий список городов с поиском (комбобокс).
 * Рассчитан на большие списки (100+ городов): фильтрация по мере ввода,
 * прокручиваемый список, навигация стрелками.
 * Можно выбрать город из списка или ввести свой (свободный ввод сохраняется).
 * Клавиатура: ↑/↓ — навигация, Enter — выбрать подсвеченный / принять текст,
 * Esc — закрыть список.
 */
export default function CitySelect({ value, onChange, cities, required, placeholder = 'Начните вводить город...' }: CitySelectProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => [...cities].sort((a, b) => a.localeCompare(b, 'ru')), [cities]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(c => c.toLowerCase().includes(q));
  }, [sorted, query]);

  // Внешнее значение (открытие карточки) подтягиваем в поле
  useEffect(() => { setQuery(value); }, [value]);

  // Клик вне компонента закрывает список
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function select(city: string) {
    onChange(city);
    setQuery(city);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) select(filtered[highlight]);
      else if (query.trim()) { onChange(query.trim()); setOpen(false); }
    }
    else if (e.key === 'Escape') setOpen(false);
  }

  const exactMatch = filtered.some(c => c.toLowerCase() === query.trim().toLowerCase());

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          className="form-input w-full pr-8"
          value={query}
          required={required}
          placeholder={placeholder}
          autoComplete="off"
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); setHighlight(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <button type="button" tabIndex={-1} onClick={() => setOpen(o => !o)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          <ChevronDown size={16} />
        </button>
      </div>
      {open && (
        <ul className="absolute z-30 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-brand-gray-mid rounded-lg shadow-lg text-sm">
          {filtered.length === 0 && !query.trim() && (
            <li className="px-3 py-2 text-gray-400">Список городов пуст — добавьте города в Настройки → Типы и города</li>
          )}
          {filtered.length === 0 && query.trim() && (
            <li className="px-3 py-2 text-gray-400">Нет совпадений</li>
          )}
          {filtered.map((c, i) => (
            <li key={c}>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => select(c)}
                className={`w-full text-left px-3 py-2 hover:bg-brand-gray ${i === highlight ? 'bg-brand-gray' : ''}`}>
                {c}
              </button>
            </li>
          ))}
          {query.trim() && !exactMatch && (
            <li>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onChange(query.trim()); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-blue-600 hover:bg-brand-gray border-t border-brand-gray-mid">
                Использовать «{query.trim()}»
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
