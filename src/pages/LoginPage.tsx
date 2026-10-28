import { APP_VERSION } from '@/constants';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '@/lib/auth';
import { getStore } from '@/lib/store';
import { toast } from 'sonner';
import { Check, Eye, EyeOff, Lock, Settings } from 'lucide-react';

// v1.31.17: «Запомнить пароль» — логин/пароль хранятся локально (localStorage), только по явной галочке.
const REMEMBER_KEY = 'vz_remember_login';

function readSavedLogin(): { email: string; password: string } | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const saved = readSavedLogin();
  const [email, setEmail] = useState(saved?.email || '');
  const [password, setPassword] = useState(saved?.password || '');
  const [remember, setRemember] = useState(Boolean(saved));
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  // Кнопка входа — только когда логин найден среди пользователей системы.
  // Если список пользователей ещё не загружен (первый визит/чистый кэш) — показываем кнопку,
  // иначе можно полностью отрезать вход. Список к этому моменту уже в localStorage (синк стора).
  const knownEmails = (getStore().settings.users || []).map(u => (u.email || '').toLowerCase());
  const emailKnown =
    email.trim() !== '' &&
    (knownEmails.length === 0 || knownEmails.includes(email.trim().toLowerCase()));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { toast.error('Заполните все поля'); return; }
    setLoading(true);
    try {
      const user = await login(email, password);
      if (user) {
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, password }));
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
        toast.success(`Добро пожаловать, ${user.name}!`);
        navigate('/dashboard');
      } else {
        toast.error('Неверный логин или пароль');
      }
    } catch {
      toast.error('Не удалось войти. Проверьте подключение к серверу');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-gray flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* v1.31.17: логотип 333px, отступ снизу 3rem (mb-12) — только на /login */}
        <div className="text-center mb-12">
          <img src="/logo-erp.png" alt="ВСЕМЗАПЧАСТИ ERP" className="w-[333px] max-w-full h-auto mx-auto mb-3" />
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Система управления платформой</p>
            <p className="text-[10px] text-gray-300 mt-1">v{APP_VERSION}</p>
        </div>

        <div className="card-base p-8 shadow-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="relative">
                {/* v1.31.17: иконка почты заменена на шестерёнку */}
                <Settings size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="form-input pl-9"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="form-input pl-9 pr-16"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                {/* v1.31.17: галочка «Запомнить» рядом с глазом — тот же серый стиль */}
                <button
                  type="button"
                  onClick={() => setRemember(v => !v)}
                  title="Запомнить пароль"
                  aria-pressed={remember}
                  className={`absolute right-10 top-1/2 -translate-y-1/2 transition-colors ${
                    remember ? 'text-gray-600' : 'text-gray-300 hover:text-gray-400'
                  }`}
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  title="Показать пароль"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* v1.31.17: кнопка появляется только когда логин найден в системе */}
            {emailKnown && (
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full justify-center text-base py-3"
              >
                {loading ? 'Вход...' : 'Войти'}
              </button>
            )}
          </form>
        </div>

      </div>
    </div>
  );
}
