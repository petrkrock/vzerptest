import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { DatabaseService, RequestUser } from '../database/database.service';

// Фаза 1 (как и на Supabase): все пользователи на дефолтном домене.
const DEFAULT_DOMAIN_ID = '00000000-0000-4000-8000-000000000001';
// v1.34.0 (аудит #7): TTL access-токена 2ч (было 12ч). Refresh — отдельной задачей.
const TOKEN_TTL = '2h';
// Защита /auth/login от брутфорса: счётчики и по email (5 попыток / 5 мин, с любого IP),
// и по IP (20 / 5 мин — запас для офиса за одним NAT). IP — только req.ip (см. trustProxy в main.ts).
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_BY_EMAIL = 5;
const LOGIN_MAX_BY_IP = 20;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

const loginMax = (key: string) => (key.startsWith('ip:') ? LOGIN_MAX_BY_IP : LOGIN_MAX_BY_EMAIL);

function loginBlocked(keys: string[]): boolean {
  return keys.some(key => {
    const rec = loginAttempts.get(key);
    return Boolean(rec && Date.now() < rec.resetAt && rec.count >= loginMax(key));
  });
}
function loginFailed(keys: string[]) {
  const now = Date.now();
  for (const key of keys) {
    const rec = loginAttempts.get(key);
    if (!rec || now > rec.resetAt) loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    else rec.count += 1;
  }
  if (loginAttempts.size > 10_000) {
    for (const [k, v] of loginAttempts) if (now > v.resetAt) loginAttempts.delete(k);
  }
}
function loginOk(email: string) {
  loginAttempts.delete(email); // IP-счётчик не сбрасываем: успешный вход не отменяет перебор с этого адреса
}

interface AppSettingsUser {
  id?: string;
  email?: string;
  status?: string;
  role?: string;
}

@Injectable()
export class AuthService {
  constructor(private db: DatabaseService) {
    this.secret(); // fail-fast: без нормального JWT_SECRET API не стартует
  }

  async login(email: string, password: string, ip = ''): Promise<{ token: string; user: RequestUser }> {
    const normalized = (email || '').trim().toLowerCase();
    if (!normalized || !password) throw new UnauthorizedException('Неверный логин или пароль');
    const keys = [`email:${normalized}`, `ip:${ip}`];
    if (loginBlocked(keys)) throw new UnauthorizedException('Неверный логин или пароль');

    // v1.35.2: вход — по profiles (источник истины для аутентификации). Запись в
    // settings.users больше НЕ обязательна для входа (раньше без неё был 401 ещё до
    // проверки пароля). Читаем сервисным доступом: RLS profiles разрешает SELECT
    // только своему/админу, а токена ещё нет. Rate-limit + bcrypt — защита.
    const profile = await this.db.withAdmin(c =>
      c.query(
        `SELECT id, email, role, password_hash FROM public.profiles WHERE lower(email) = $1`,
        [normalized],
      ),
    );
    const row = profile.rows[0];
    if (!row?.password_hash || !(await bcrypt.compare(password, row.password_hash))) {
      loginFailed(keys);
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    // Статус сотрудника — из settings.users (если запись есть). Нет записи — вход
    // разрешён (профиль создан, CRM-права настроятся позже в Настройки → Пользователи).
    const { rows: s } = await this.db.withAdmin(c =>
      c.query(`SELECT settings -> 'users' AS users FROM public.app_settings WHERE id = 'global'`),
    );
    const me = ((s[0]?.users ?? []) as AppSettingsUser[]).find(u => String(u.id) === String(row.id));
    if (me && me.status !== 'active') {
      loginFailed(keys);
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    loginOk(keys[0]);

    const user: RequestUser = {
      sub: row.id,
      email: row.email,
      role: row.role === 'admin' ? 'admin' : 'user',
      domain_id: DEFAULT_DOMAIN_ID,
    };
    const token = jwt.sign(user, this.secret(), { expiresIn: TOKEN_TTL, algorithm: 'HS256' });
    return { token, user };
  }

  verify(token: string): RequestUser {
    return jwt.verify(token, this.secret(), { algorithms: ['HS256'] }) as RequestUser;
  }

  private secret(): string {
    const s = process.env.JWT_SECRET;
    if (!s || s.length < 32 || s === 'change-me') {
      throw new Error('JWT_SECRET не задан или короче 32 символов (сгенерируйте: openssl rand -hex 32)');
    }
    return s;
  }
}
