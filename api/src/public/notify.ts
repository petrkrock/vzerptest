import { DatabaseService } from '../database/database.service';

// Уведомления о заявках с публичных форм — порт sendNotifications из supabase/functions/public-form (v1.31.18).
// Конфиг каналов — Настройки → Уведомления (settings.notifications), его сохраняет SettingsPage:
//   telegram: { enabled, globalChatId }, max: { enabled, globalChatId }, email: { enabled, to, from }.
// Токены — только в env API: TELEGRAM_BOT_TOKEN, MAX_BOT_TOKEN (+ MAX_API_BASE, по умолчанию platform-api2.max.ru).
// Email уходит через outbox_events → почтовый воркер (SMTP_URL, EMAIL_FROM).
// Личные уведомления: активным менеджерам с доступом к разделу — в их канал (Настройки → Пользователи).
// Ошибка канала никогда не ломает отправку формы.

const MAX_API_BASE = (process.env.MAX_API_BASE || 'https://platform-api2.max.ru').replace(/\/$/, '');
const TIMEOUT_MS = 8000;

const FORM_LABEL: Record<string, string> = { supplier: 'Поставщик', buyer: 'Покупатель', ticket: 'Обращение' };
const SECTION_PERM: Record<string, string> = { supplier: 'suppliers', buyer: 'buyers', ticket: 'support' };

interface NotifyChannels {
  telegram?: { enabled?: boolean; globalChatId?: string };
  max?: { enabled?: boolean; globalChatId?: string };
  email?: { enabled?: boolean; to?: string };
}

interface NotifyUser {
  status?: string;
  permissions?: Record<string, unknown>;
  notifyChannel?: string;
  notifyChatId?: string;
  notifyEmail?: string;
}

interface NotifyArgs {
  db: DatabaseService;
  formType: string;
  id: string;
  entityStatus: string;
  settings: Record<string, unknown>;
  name: string;
  text: string;
  phone: string;
  email: string;
  inn: string;
  city: string;
  website: string;
  buyerType: string;
  category: string;
  contactPref: string;
  contactName: string;
  contactRole: string;
  dedupHit: string;
  ip: string;
  date: string;
}

function buildText(a: NotifyArgs): string {
  return [
    `🆕 Новая заявка с сайта: ${FORM_LABEL[a.formType] || 'Заявка'}`,
    a.dedupHit ? `⚠️ Дубль: ${a.dedupHit}` : null,
    a.name ? `Название: ${a.name}` : null,
    a.inn ? `ИНН: ${a.inn}` : null,
    a.buyerType ? `Тип: ${a.buyerType}` : null,
    a.category ? `Оборот: ${a.category}` : null,
    a.contactName ? `Контакт: ${a.contactName}${a.contactRole ? ` (${a.contactRole})` : ''}` : null,
    a.phone ? `Телефон: ${a.phone}` : null,
    a.email ? `Email: ${a.email}` : null,
    a.city ? `Город: ${a.city}` : null,
    a.website ? `Сайт: ${a.website}` : null,
    a.contactPref ? `Связь: ${a.contactPref}` : null,
    a.text ? `Текст: ${a.text}` : null,
    a.entityStatus ? `Статус: ${a.entityStatus}` : null,
    `IP: ${a.ip}`,
    a.date,
  ].filter(Boolean).join('\n');
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function notify(a: NotifyArgs): Promise<void> {
  const text = buildText(a);
  const subject = `Новая заявка с сайта: ${FORM_LABEL[a.formType] || 'Заявка'}`;
  const tgToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const maxToken = (process.env.MAX_BOT_TOKEN || '').trim();
  const cfg = ((a.settings.notifications as NotifyChannels | undefined) || {});

  const telegram = (chatId: string) =>
    post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {}, { chat_id: chatId, text, disable_web_page_preview: true });
  // MAX Bot API: токен в Authorization БЕЗ слова Bearer, chat_id — число.
  const max = (chatId: string) =>
    post(`${MAX_API_BASE}/messages`, { Authorization: maxToken }, { recipient: { chat_id: Number(chatId) }, text });
  const email = (to: string) =>
    a.db.withAdmin(c =>
      c.query(
        `INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload) VALUES ('public_form.submitted', $1, $2, $3)`,
        [a.formType, a.id, JSON.stringify({ email: to, subject, text })],
      ),
    );

  const jobs: Array<[string, Promise<unknown>]> = [];
  const add = (label: string, run: () => Promise<unknown>) => jobs.push([label, run()]);

  // Общие каналы
  if (cfg.telegram?.enabled && tgToken && cfg.telegram.globalChatId) add('telegram', () => telegram(cfg.telegram!.globalChatId!));
  if (cfg.max?.enabled && maxToken && cfg.max.globalChatId) add('max', () => max(cfg.max!.globalChatId!));
  if (cfg.email?.enabled && cfg.email.to) add('email', () => email(cfg.email!.to!));

  // Личные: активные менеджеры с доступом к разделу и своим каналом
  const perm = SECTION_PERM[a.formType];
  for (const u of ((a.settings.users as NotifyUser[] | undefined) || [])) {
    if (u.status !== 'active' || u.permissions?.[perm] !== true) continue;
    if (u.notifyChannel === 'telegram' && tgToken && u.notifyChatId) add('telegram user', () => telegram(u.notifyChatId!));
    else if (u.notifyChannel === 'max' && maxToken && u.notifyChatId) add('max user', () => max(u.notifyChatId!));
    else if (u.notifyChannel === 'email' && u.notifyEmail) add('email user', () => email(u.notifyEmail!));
  }

  const results = await Promise.allSettled(jobs.map(([, p]) => p));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(JSON.stringify({ level: 'error', msg: 'public-form notify failed', channel: jobs[i][0], err: String(r.reason) }));
    }
  });
}
