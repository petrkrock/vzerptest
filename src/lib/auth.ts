import type { AppUser, AuthSession, UserAccess } from '@/types';
import { EMPTY_ACCESS } from '@/types';
import { getStore, updateStore, initRemoteSync, clearLocalStoreCache } from './store';
// v1.34.0: Supabase вырезан — вход только через свой API (POST /auth/login → JWT).
import { apiLogin, setApiToken } from './api';
import { startCrmRealtime, stopCrmRealtime } from './realtime';

const SESSION_KEY = 'vz_crm_session';

export function getCurrentUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: AuthSession = JSON.parse(raw);
    if (new Date(session.expiresAt) < new Date()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    // Сессия перепроверяется по актуальному профилю: уволенный или заблокированный
    // пользователь теряет доступ немедленно, а не по истечении срока сессии (ТЗ п.1).
    const fresh = getStore().settings.users.find(
      u => u.id === session.user.id || u.email.toLowerCase() === session.user.email.toLowerCase(),
    );
    if (!fresh || fresh.status !== 'active') {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return fresh;
  } catch {
    return null;
  }
}

function persistSession(user: AppUser) {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  const session: AuthSession = { user, expiresAt: expires.toISOString() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Signs the user in.
 *
 * - Without Supabase configured: local demo mode — checks email/password
 *   against Настройки → Пользователи (settings.users), exactly as before.
 * - With Supabase configured: authenticates for real against Supabase Auth
 *   (so Row Level Security policies that check `auth.role() = 'authenticated'`
 *   actually work), then looks up the matching CRM profile — role and
 *   section permissions — by email in settings.users. A Supabase Auth
 *   account with no matching CRM profile is treated as "not provisioned"
 *   and is signed back out — see README.md § "Первый администратор" for
 *   how to create the first admin.
 */
export async function login(email: string, password: string): Promise<AppUser | null> {
  // v1.34.0: единственный путь — свой API. Профиль берём из стора после синка.
  try {
    const { token } = await apiLogin(email, password);
    setApiToken(token);
  } catch {
    return null;
  }
  await initRemoteSync();
  startCrmRealtime();
  const store = getStore();
  const profile = store.settings.users.find(
    u => u.email.toLowerCase() === email.toLowerCase() && u.status === 'active',
  );
  if (!profile) return null;
  persistSession(profile);
  return profile;
}

export function logout() {
  stopCrmRealtime();
  localStorage.removeItem(SESSION_KEY);
  clearLocalStoreCache();
  setApiToken(null);
}

/**
 * Call once at app startup alongside initRemoteSync(). If Supabase is
 * configured but the browser lost its local session cookie while a
 * Supabase Auth session is still valid (or vice-versa), this keeps the two
 * in sync so the user isn't stuck logged out — or, worse, shown CRM data
 * while no longer authenticated against Supabase (which RLS would reject
 * anyway, surfacing as failed requests instead of a clean login screen).
 */
export async function reconcileSession(): Promise<void> {
  // v1.34.0: Supabase Auth удалён. JWT валидируется по подписи/TTL на каждом запросе,
  // профиль — по стору (см. getCurrentUser). Сверять нечего — функция оставлена
  // как no-op, чтобы не трогать точки вызова в App.tsx.
}

export function isAdmin(): boolean {
  const user = getCurrentUser();
  return user?.role === 'admin';
}

export function canAccess(section: keyof AppUser['permissions']): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  // Аналитика — только администратор (ТЗ v1.21.0): менеджеру не выдаётся,
  // даже если у старого профиля осталась галочка analytics.
  if (section === 'analytics') return false;
  return user.permissions[section] === true;
}

export function canExport(): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  return user.role === 'admin';
}

/**
 * Whether the current user may permanently or soft-delete/archive records
 * (suppliers, buyers, tasks, tickets, media, knowledge base). Managers can
 * create and edit everything they have section access to — only admins can
 * remove data. Named separately from isAdmin() so call sites read as
 * "can this action happen" rather than "is this an admin", even though the
 * two happen to coincide today.
 */
export function canDelete(): boolean {
  return isAdmin();
}

// ── ФИЛЬТРЫ ВИДИМОСТИ МЕНЕДЖЕРА (ТЗ «Управление пользователями», п.2) ──
// Пустой массив внутри access = без ограничений по этому измерению;
// null целиком = текущий пользователь — админ (видит всё).

/** Фильтры текущего менеджера; null = без ограничений. */
export function getAccessFilters(): UserAccess | null {
  const user = getCurrentUser();
  if (!user || user.role === 'admin') return null;
  // Нормализация (v1.20.9): у пользователей, созданных до появления новых измерений,
  // в access нет новых ключей — мержим с EMPTY_ACCESS, чтобы не было undefined.includes().
  return { ...EMPTY_ACCESS, ...(user.access || {}) };
}

export function canSeeSupplier(s: { type: string; city: string; responsibleId?: string }): boolean {
  const f = getAccessFilters();
  if (!f) return true;
  // Запись без ответственного доступна всем менеджерам (ТЗ), помечается ★ в списках
  if (!s.responsibleId) return true;
  return (f.supplierTypes.length === 0 || f.supplierTypes.includes(s.type))
    && (f.supplierCities.length === 0 || f.supplierCities.includes(s.city));
}

export function canSeeBuyer(b: { type: string; city: string; responsibleId?: string }): boolean {
  const f = getAccessFilters();
  if (!f) return true;
  if (!b.responsibleId) return true; // без ответственного — всем (ТЗ)
  return (f.buyerTypes.length === 0 || f.buyerTypes.includes(b.type))
    && (f.buyerCities.length === 0 || f.buyerCities.includes(b.city));
}

export function canSeeTicket(t: { type?: string }): boolean {
  const f = getAccessFilters();
  if (!f) return true;
  return f.ticketTypes.length === 0 || f.ticketTypes.includes(t.type || '');
}

export function canSeePlanCity(cityName?: string): boolean {
  const f = getAccessFilters();
  if (!f) return true;
  return f.planCities.length === 0 || (cityName ? f.planCities.includes(cityName) : false);
}

// ── ФИЛЬТРЫ РАЗДЕЛОВ Дашборд / Задачи / Медиа сервис / Аналитика / База знаний (v1.20.9) ──
// Та же логика, что у canSeeSupplier/canSeeTicket: пустой массив в access = без ограничений.
export function canSeeDashboardCity(cityName?: string): boolean {
  const f = getAccessFilters();
  if (!f) return true;
  return f.dashboardCities.length === 0 || (cityName ? f.dashboardCities.includes(cityName) : false);
}

export function canSeeTask(t: { title: string; entityType?: string }): boolean {
  const f = getAccessFilters();
  if (!f) return true;
  return (f.taskTypes.length === 0 || f.taskTypes.includes(t.title))
    && (f.taskEntityTypes.length === 0 || f.taskEntityTypes.includes(t.entityType || ''));
}

export function canSeeMedia(m: { adTypeName?: string; durationLabel?: string; status?: string }): boolean {
  const f = getAccessFilters();
  if (!f) return true;
  return (f.mediaAdTypes.length === 0 || f.mediaAdTypes.includes(m.adTypeName || ''))
    && (f.mediaDurationOptions.length === 0 || f.mediaDurationOptions.includes(m.durationLabel || ''))
    && (f.mediaStatuses.length === 0 || f.mediaStatuses.includes(m.status || ''));
}

export function canSeeAnalyticsCity(cityName?: string): boolean {
  const f = getAccessFilters();
  if (!f) return true;
  return f.analyticsCities.length === 0 || (cityName ? f.analyticsCities.includes(cityName) : false);
}

export function canSeeKnowledge(a: { categoryName?: string }): boolean {
  const f = getAccessFilters();
  if (!f) return true;
  return f.knowledgeCategories.length === 0 || f.knowledgeCategories.includes(a.categoryName || '');
}

/** Правило дашборда менеджера (ТЗ v1.21.3): запись видна, если закреплена за текущим
 *  пользователем или ответственный не назначен. Администратор видит всё. */
export function isMineOrUnassigned(x: { responsibleId?: string }): boolean {
  const user = getCurrentUser();
  if (!user || user.role === 'admin') return true;
  return !x.responsibleId || x.responsibleId === user.id;
}

/** Города, доступные менеджеру с дашбордом МОП (ТЗ v1.21.6): видит покупателей только в выбранных
 *  городах (названия из «Типы и города»). Пустой список или другой тип дашборда — без ограничений. */
export function canSeeManagerCity(cityName?: string): boolean {
  const user = getCurrentUser();
  if (!user || user.role === 'admin') return true;
  if (user.dashboardType !== 'mop' || !user.allowedCities || user.allowedCities.length === 0) return true;
  return !!cityName && user.allowedCities.includes(cityName);
}

/** Право создавать/редактировать План/Факт: админ или менеджер с planfactEdit (ТЗ). */
export function canEditPlanFact(): boolean {
  // ТЗ v1.22.3: создавать/редактировать записи План/Факт может только администратор.
  const user = getCurrentUser();
  return !!user && user.role === 'admin';
}
