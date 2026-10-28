import { Bell, Mail, Globe, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getStore, useStoreVersion } from '@/lib/store';
import { getCurrentUser, logout } from '@/lib/auth';
import { isToday } from '@/lib/utils';

// v1.31.0: шапка на всю ширину — логотип слева, справа быстрые ссылки,
// колокольчик и блок пользователя (перенесён из Sidebar).
// Shown on desktop only (lg and up) — on mobile, navigation is handled
// entirely by BottomNav.tsx.
export default function Header() {
  useStoreVersion();
  const navigate = useNavigate();
  const user = getCurrentUser();
  const store = getStore();
  const todayTasks = store.tasks.filter(t => !t.completed && isToday(t.dueDate));
  const newTickets = store.tickets.filter(t => (t.status === 'Новая' || t.status === 'Новый с сайта') && !t.deletedAt);
  const notifCount = todayTasks.length + newTickets.length;

  const quickLinks = store.settings.quickLinks || { mail: '', platform: '' };

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header
      className="hidden lg:block bg-white border-b border-brand-gray-mid sticky top-0 z-40"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="h-14 flex items-center justify-between px-4 gap-4">
        {/* Логотип (перенесён из меню) */}
        <button type="button" onClick={() => navigate('/')} title="На главную" className="flex items-center min-h-[44px] rounded-md hover:bg-brand-gray px-2 -ml-2 transition-colors">
          {/* v1.31.16: логотип ERP (ЛК поставщика логотип не меняет — там старый /logo.png).
              v1.31.17: ширина логотипа 245px; сама кнопка ведёт на главную (navigate '/'). */}
          {/* v1.34.0 (аудит #6): max-w-full — не ломаем мобильную вёрстку при тесноте */}
          <img src="/logo-erp.png" alt="ВСЕМЗАПЧАСТИ ERP" className="w-[245px] max-w-full h-auto flex-shrink-0" />
        </button>

        <div className="flex items-center gap-2">
          {quickLinks.mail && (
            <a
              href={quickLinks.mail}
              target="_blank"
              rel="noopener noreferrer"
              title="Почта"
              aria-label="Почта"
              className="p-2 rounded-md hover:bg-brand-gray transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <Mail size={20} className="text-gray-600" />
            </a>
          )}
          {quickLinks.platform && (
            <a
              href={quickLinks.platform}
              target="_blank"
              rel="noopener noreferrer"
              title="Платформа"
              aria-label="Платформа"
              className="p-2 rounded-md hover:bg-brand-gray transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <Globe size={20} className="text-gray-600" />
            </a>
          )}
          <div className="relative">
            <button className="p-2 rounded-md hover:bg-brand-gray transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
              <Bell size={20} className="text-gray-600" />
              {notifCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-brand-red rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </button>
          </div>

          {/* Блок пользователя (перенесён из Sidebar, после колокольчика) */}
          <div className="flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-2xl bg-gray-50 border border-gray-100">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-md shadow-red-200">
              {user?.name?.charAt(0) || 'A'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-brand-black truncate leading-tight">{user?.name}</p>
              <p className="text-[11px] text-gray-400 truncate leading-tight">
                {user?.role === 'admin' ? 'Администратор' : 'Менеджер'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              title="Выйти"
              aria-label="Выйти"
              className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-brand-red hover:border-red-200 transition-colors flex-shrink-0"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
