import { apiLogWrite } from './api';

/**
 * Пишет запись в таблицу app_logs (см. SECURITY HOTFIX-блок в schema.sql).
 * v1.34.0: через свой API (POST /logs, @Public — иначе ошибка сети сама не записалась бы).
 * Читать логи может только админ (RLS). Никогда не бросает исключений.
 */
export async function logToServer(level: 'error' | 'info', message: string, stack?: string): Promise<void> {
  try {
    let userEmail: string | null = null;
    try {
      const raw = localStorage.getItem('vz_crm_session');
      if (raw) userEmail = (JSON.parse(raw) as { user?: { email?: string } }).user?.email ?? null;
    } catch { /* ignore */ }
    await apiLogWrite({
      level,
      scope: 'client',
      message: String(message).slice(0, 2000),
      meta: { stack: stack ? String(stack).slice(0, 8000) : null, page: window.location.pathname, user_email: userEmail },
    });
  } catch { /* ignore */ }
}
