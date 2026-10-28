import { getStore } from '@/lib/store';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const FALLBACK_COLORS: Record<string, { bg: string; text: string }> = {
  'Лид': { bg: '#F3F4F6', text: '#374151' },
  'Архив': { bg: '#F9FAFB', text: '#6B7280' },
  'В работе': { bg: '#EFF6FF', text: '#1D4ED8' },
  'Зарегистрирован': { bg: '#F5F3FF', text: '#6D28D9' },
  'Активный': { bg: '#ECFDF5', text: '#065F46' },
  'Коммерческое': { bg: '#FFFBEB', text: '#92400E' },
  'Переговоры': { bg: '#EFF6FF', text: '#1E40AF' },
  'Проблемный': { bg: '#FEF2F2', text: '#991B1B' },
  'Не активный': { bg: '#F9FAFB', text: '#374151' },
};

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const store = getStore();
  const config = store.settings.statuses.find(s => s.name === status);
  const colors = config
    ? { bg: config.bgColor, text: config.textColor }
    : FALLBACK_COLORS[status] || { bg: '#F3F4F6', text: '#374151' };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {status}
    </span>
  );
}
