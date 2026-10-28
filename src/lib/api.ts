// v1.32.6/1.34.0: транспортный слой к своему API (NestJS). Supabase вырезан — это единственный путь.
export const API_URL: string = import.meta.env.VITE_API_URL || ''; // пусто = same-origin (прокси Coolify)
const TOKEN_KEY = 'vz_api_token';

export function setApiToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  // v1.35.2: Content-Type ставим ТОЛЬКО с телом — иначе Fastify падает
  // «Body cannot be empty when content-type is application/json» на GET.
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let message = `Ошибка ${res.status}`;
    try {
      const data = await res.json();
      message = data.message || message;
    } catch { /* тело не JSON — оставляем статус */ }
    throw new ApiError(res.status, message);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// API отдаёт строки как в БД (snake_case) — приводим к camelCase фронт-типов.
function camelKey(k: string): string {
  return k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}
export function camelize<T>(row: unknown): T {
  if (Array.isArray(row)) return row.map(camelize) as T;
  if (row && typeof row === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      out[camelKey(k)] = v && typeof v === 'object' ? camelize(v) : v;
    }
    return out as T;
  }
  return row as T;
}

interface ApiLoginResult {
  token: string;
  user: { sub: string; email: string; role: string; domain_id: string };
}
export function apiLogin(email: string, password: string): Promise<ApiLoginResult> {
  return apiRequest<ApiLoginResult>('/auth/login', { method: 'POST', body: { email, password } });
}

// ─── Домены-арендаторы (admin; потребитель — SettingsPage) ───
export function apiDomainsList(): Promise<Array<Record<string, unknown>>> {
  return apiRequest<Array<Record<string, unknown>>>('/domains');
}
export function apiDomainsCreate(body: { host: string; name: string }): Promise<unknown> {
  return apiRequest<unknown>('/domains', { method: 'POST', body });
}
export function apiDomainsUpdate(id: string, body: { is_active: boolean }): Promise<unknown> {
  return apiRequest<unknown>(`/domains/${id}`, { method: 'PATCH', body });
}
export function apiDomainsDelete(id: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/domains/${id}`, { method: 'DELETE' });
}

// ─── Пользователи (admin; потребитель — SettingsPage) — замена create/update-manager ───
export function apiUsersCreate(body: { email: string; password: string; name: string }): Promise<{ id: string; email: string }> {
  return apiRequest('/auth/users', { method: 'POST', body });
}
export function apiUsersUpdate(id: string, body: { password?: string; ban_duration?: string }): Promise<unknown> {
  return apiRequest(`/auth/users/${id}`, { method: 'PATCH', body });
}

// ─── Файлы (баннеры ЛК, база знаний) — замена storage-бакетов Supabase ───
export function apiFilesUpload(base64: string, name: string): Promise<{ url: string }> {
  return apiRequest('/files', { method: 'POST', body: { base64, name } });
}
// File → data-url → POST /files → абсолютный URL (при пустом API_URL — same-origin).
export async function apiFilesUploadFile(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
  const { url } = await apiFilesUpload(dataUrl, file.name);
  return `${API_URL}${url}`;
}

// ─── Логи клиента (app_logs) ───
export function apiLogWrite(entry: { level: string; scope: string; message: string; meta?: unknown }): Promise<void> {
  return apiRequest('/logs', { method: 'POST', body: entry }).then(() => undefined);
}