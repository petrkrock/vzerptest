import { DatabaseService } from '../database/database.service';

// v1.33.1: уведомления публичных форм — порт supabase/functions/public-form.
// Email: через email-воркер (outbox_events). Telegram/MAX: прямые fetch (как в edge).

interface NotifyUser {
  id?: string;
  name?: string;
  email?: string;
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
  cfg: Record<string, unknown>;
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
  leadType: string;
  dedupHit: string;
  ip: string;
  date: string;
}

export async function notify(a: NotifyArgs): Promise<void> {
  try {
    const nc = (a.settings.notifications as Record<string, unknown>) || {};
    const tgToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const maxApi = (process.env.MAX_API_BASE || '').trim();
    const formTypesRu: Record<string, string> = { supplier: 'поставщика', buyer: 'покупателя', ticket: 'обращения в поддержку' };
    const formTypeRu = formTypesRu[a.formType] || 'заявки';

    const lines = [
      `Заявка с формы ${formTypeRu}`,
      a.dedupHit ? `⚠️ Дубль: ${a.dedupHit}` : null,
      `Имя: ${a.name}`,
      a.inn ? `ИНН: ${a.inn}` : null,
      `Тип: ${a.buyerType}`,
      a.category ? `Оборот: ${a.category}` : null,
      a.phone ? `Телефон: ${a.phone}` : null,
      a.email ? `Email: ${a.email}` : null,
      a.contactName ? `Контакт: ${a.contactName}${a.contactRole ? ` (${a.contactRole})` : ''}` : null,
      a.city ? `Город: ${a.city}` : null,
      a.website ? `Сайт: ${a.website}` : null,
      a.contactPref ? `Связь: ${a.contactPref}` : null,
      a.text ? `Текст: ${a.text}` : null,
      a.entityStatus ? `Статус: ${a.entityStatus}` : null,
      `IP: ${a.ip}`,
      a.date,
    ].filter(Boolean) as string[];
    const tgText = lines.join('\n');

    // Email (global)
    const emailCfg = (nc.email as Record<string, unknown>) || {};
    const to = String(emailCfg.to || '').trim();
    if (to && !a.dedupHit) {
      await a.db.withAdmin(c =>
        c.query(
          `INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
           VALUES ('public_form.submitted', $1, $2, $3)`,
          [a.formType, a.id, JSON.stringify({
            email: to,
            subject: `Заявка с формы ${formTypeRu} (сайт)`,
            text: tgText,
          })],
        ),
      );
    }

    // Telegram (global)
    const tgCfg = (nc.telegram as Record<string, unknown>) || {};
    const chatId = String(tgCfg.chatId || '').trim();
    if (tgToken && chatId) {
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: tgText }),
      }).catch(() => undefined);
    }

    // MAX (global)
    const maxCfg = (nc.max as Record<string, unknown>) || {};
    const maxToken = String(maxCfg.token || '').trim();
    const maxUserId = String(maxCfg.userId || '').trim();
    if (maxApi && maxToken && maxUserId) {
      await fetch(`${maxApi}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: maxToken },
        body: JSON.stringify({ recipient: { user_id: Number(maxUserId) }, text: tgText }),
      }).catch(() => undefined);
    }

    // Персональные маршруты (по ответственному формы / персональному email)
    const users = ((a.settings.users as NotifyUser[]) || []);
    const personalEmail = String(a.cfg.personalEmail || '').trim().toLowerCase();
    if (personalEmail) {
      const ruTypes: Record<string, string> = { supplier: 'поставщика', buyer: 'покупателя', ticket: 'обращения' };
      const ruType = ruTypes[a.formType] || 'заявки';
      const lines2 = [
        `Заявка с формы ${ruType} (личная копия)`,
        a.dedupHit ? `⚠️ Дубль: ${a.dedupHit}` : null,
        ...lines.slice(1),
      ].filter(Boolean) as string[];
      const user = users.find(u => (u.email || '').toLowerCase() === personalEmail);
      const toEmail = user?.notifyEmail || personalEmail;
      await a.db.withAdmin(c =>
        c.query(
          `INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
           VALUES ('public_form.personal', $1, $2, $3)`,
          [a.formType, a.id, JSON.stringify({
            email: toEmail,
            subject: `Личная копия: заявка с формы ${ruType}`,
            text: lines2.join('\n'),
          })],
        ),
      );
    }

    const responsibleId = typeof a.cfg.responsibleId === 'string' ? a.cfg.responsibleId : '';
    if (responsibleId) {
      const user = users.find(u => String(u.id) === responsibleId);
      if (user) {
        const ch = String(user.notifyChannel || '').toLowerCase();
        if (ch === 'telegram' && tgToken && user.notifyChatId) {
          await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: user.notifyChatId, text: tgText }),
          }).catch(() => undefined);
        }
        if (ch === 'max' && maxApi && maxToken && user.notifyChatId) {
          await fetch(`${maxApi}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: maxToken },
            body: JSON.stringify({ recipient: { user_id: Number(user.notifyChatId) }, text: tgText }),
          }).catch(() => undefined);
        }
      }
    }
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', msg: 'public-form notify failed', err: String(e) }));
  }
}
