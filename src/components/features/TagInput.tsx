import { useState, KeyboardEvent } from 'react';
import { X, Plus } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function TagInput({ tags, onChange, placeholder = 'Добавить...', disabled }: TagInputProps) {
  const [input, setInput] = useState('');

  function addTag(value: string) {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter(t => t !== tag));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 border border-brand-gray-mid rounded-md px-3 py-2 bg-white min-h-[40px] focus-within:ring-2 focus-within:ring-brand-red focus-within:border-transparent">
      {tags.map(tag => (
        <span key={tag} className="inline-flex items-center gap-1 bg-brand-gray text-brand-black text-xs px-2 py-0.5 rounded-full">
          {tag}
          {!disabled && (
            <button onClick={() => removeTag(tag)} className="hover:text-brand-red transition-colors">
              <X size={10} />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <div className="flex items-center gap-1 flex-1 min-w-[100px]">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => input && addTag(input)}
            placeholder={tags.length === 0 ? placeholder : ''}
            className="flex-1 text-xs outline-none bg-transparent"
          />
          {input && (
            <button onClick={() => addTag(input)} className="text-brand-red">
              <Plus size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
