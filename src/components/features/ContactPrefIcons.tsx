import { Phone, Mail, MessageSquare } from 'lucide-react';

/** Иконка способа связи: системные типы имеют иконки (телефон, почта, MAX),
 *  прочие отображаются без иконки. Минимализм, единый размер. */
function contactPrefIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('телефон') || n === 'phone') return Phone;
  if (n.includes('почт') || n.includes('email')) return Mail;
  if (n.includes('max')) return MessageSquare;
  return null;
}

export default function ContactPrefIcon({ name, size = 13 }: { name: string; size?: number }) {
  const Icon = contactPrefIcon(name);
  if (!Icon) return <span className="text-[10px] text-gray-400">{name}</span>;
  return <Icon size={size} className="text-gray-500" aria-label={name} />;
}
