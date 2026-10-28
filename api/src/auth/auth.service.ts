import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { DatabaseService, RequestUser } from '../database/database.service';

// Фаза 1 (как и на Supabase): все пользователи на дефолтном домене.
const DEFAULT_DOMAIN_ID = '00000000-0000-4000-8000-000000000001';
// v1.34.0 (аудит #7): TTL access-токена 2ч (было 12ч). Refresh — отдельной задачей.
const TOKEN_TTL = '2h';
// v1.34.0 (аудит #3): защита /auth/login от брутфорса — 5 попыток на 5 минут (email+ip).
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function loginBlocked(key: string): boolean {
  const rec = loginAttempts.get(key);
  return Boolean(rec && Date.now() < rec.resetAt && rec.count >= LOGIN_MAX_ATTEMPTS);
}
function loginFailed(key: string) {
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || now > rec.resetAt) loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  else rec.count += 1;
}
function loginOk(key: string) {
  loginAttempts.delete(key);
}

interface AppSettingsUser {
  id?: string;
  email?: string;
  status?: string;
  role?: string;
}

@Injectable()
export class AuthService {
  constructor(private db: DatabaseService) {}

  async login(email: string, password: string, ip = ''): Promise<{ token: string; user: RequestUser }> {
    const normalized = (email || '').trim().toLowerCase();
    if (!normalized || !password) throw new UnauthorizedException('Неверный логин или пароль');
    const key = `${normalized}|${ip}`;
    if (loginBlocked(key)) throw new UnauthorizedException('Неверный логин или пароль');

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
      loginFailed(key);
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    // Статус сотрудника — из settings.users (если запись есть). Нет записи — вход
    // разрешён (профиль создан, CRM-права настроятся позже в Настройки → Пользователи).
    const { rows: s } = await this.db.withAdmin(c =>
      c.query(`SELECT settings -> 'users' AS users FROM public.app_settings WHERE id = 'global'`),
    );
    const me = ((s[0]?.users ?? []) as AppSettingsUser[]).find(u => String(u.id) === String(row.id));
    if (me && me.status !== 'active') {
      loginFailed(key);
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    loginOk(key);

    const user: RequestUser = {
      sub: row.id,
      email: row.email,
      role: row.role === 'admin' ? 'admin' : 'user',
      domain_id: DEFAULT_DOMAIN_ID,
    };
    const token = jwt.sign(user, this.secret(), { expiresIn: TOKEN_TTL });
    return { token, user };
  }

  verify(token: string): RequestUser {
    return jwt.verify(token, this.secret()) as RequestUser;
  }

  private secret(): string {
    const s = process.env.JWT_SECRET;
    if (!s || s === 'change-me') {
      // Не падаем при разработке, но в проде такое нельзя — Coolify должен задать свой.
      return s || 'dev-only-secret';
    }
    return s;
  }
}
