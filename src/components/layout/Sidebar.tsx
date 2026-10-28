import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, X, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCurrentUser, logout } from '@/lib/auth';
import { getVisibleNavItems, NAV_SECTIONS } from './navConfig';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/**
 * v1.31.0 — парящее меню: карточка с отступами от краёв и сверху от шапки,
 * группы (Работа/Сервисы/Система) — кнопки-аккордеоны, подпункты компактные,
 * без подложки. Мобильный режим прежний — полноэкранный drawer.
 */
export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();
  const navItems = getVisibleNavItems();
  const byPath = new Map(navItems.map(item => [item.to, item]));
  const [openSections, setOpenSections] = useState<Set<string>>(new Set()); // v1.31.1: группы скрыты по умолчанию

  function toggleSection(title: string) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <>
      {open && <div className="sidebar-overlay lg:hidden" onClick={onClose} />}
      <aside
        className={cn(
          // мобильный drawer прежний; на десктопе — парящая карточка под шапкой
          'fixed z-50 flex flex-col bg-white transition-all duration-300 ease-out',
          'top-0 left-0 h-full w-full border-r border-gray-100',
          'lg:top-[calc(3.5rem+0.75rem+env(safe-area-inset-top,0px))] lg:bottom-3 lg:h-auto lg:left-3 lg:w-[calc(100%-1.5rem)] lg:rounded-2xl lg:border lg:border-gray-100 lg:shadow-lg lg:overflow-hidden',
          collapsed ? 'lg:w-14' : 'lg:w-64',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Верхняя панель карточки: заглушка-закрытие на мобильном + сворачивание на десктопе */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1 lg:pb-3">
          <span className="lg:hidden text-xs font-semibold uppercase tracking-wider text-gray-400">Меню</span>
          <button
            onClick={onClose}
            aria-label="Закрыть меню"
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-brand-black transition-colors lg:hidden"
          >
            <X size={18} />
          </button>
          {!collapsed && (
            <button
              onClick={onToggleCollapse}
              aria-label="Свернуть меню"
              title="Свернуть меню"
              className="hidden lg:flex w-7 h-7 rounded-full bg-gray-100 items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-brand-black transition-colors ml-auto"
            >
              <ChevronLeft size={14} />
            </button>
          )}
          {collapsed && (
            <button
              onClick={onToggleCollapse}
              aria-label="Развернуть меню"
              title="Развернуть меню"
              className="hidden lg:flex w-7 h-7 rounded-full bg-gray-100 items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-brand-black transition-colors mx-auto"
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        {/* Nav: группы-аккордеоны */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3 pt-1">
          {NAV_SECTIONS.map(section => {
            const items = section.paths
              .map(path => byPath.get(path))
              .filter((item): item is NonNullable<typeof item> => Boolean(item));
            if (!items.length) return null;
            const hasActive = items.some(item => location.pathname.startsWith(item.to));
            const isOpen = collapsed ? false : (openSections.has(section.title) || hasActive);

            if (collapsed) {
              // v1.31.1: свёрнутый режим — иконки ГРУПП (клик — первый видимый пункт группы)
              const first = items[0];
              return (
                <div key={section.title} className="mb-3 space-y-0.5">
                  {first && (
                    <NavLink
                      to={first.to}
                      onClick={onClose}
                      title={section.title}
                      className={() =>
                        cn(
                          'sidebar-link justify-center px-0 gap-0',
                          hasActive ? 'sidebar-link-active' : 'sidebar-link-inactive'
                        )
                      }
                    >
                      <section.icon size={18} />
                    </NavLink>
                  )}
                </div>
              );
            }

            return (
              <div key={section.title} className="mb-2">
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors',
                    hasActive ? 'text-brand-black' : 'text-gray-700 hover:text-brand-black'
                  )}
                >
                  <section.icon size={16} className={cn('flex-shrink-0', hasActive ? 'text-brand-red' : 'text-gray-400')} />
                  <span className="flex-1 text-left">{section.title}</span>
                  <ChevronDown
                    size={15}
                    className={cn('text-gray-400 transition-transform duration-200', isOpen ? 'rotate-180' : '')}
                  />
                </button>
                {isOpen && (
                  <div>
                    {items.map(item => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={onClose}
                        className={({ isActive }) =>
                          cn(
                            // v1.31.0: подпункты без подложки, компактные
                            'flex items-center gap-2 pl-8 pr-3 py-1 rounded-lg text-[13px] transition-colors',
                            isActive ? 'bg-gray-100 text-brand-red font-semibold' : 'text-gray-500 hover:text-gray-900'
                          )
                        }
                      >
                        <item.icon size={15} className="flex-shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Мобильный: карточка пользователя + выход (в шапке её нет) */}
        <div className="lg:hidden px-4 pb-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-100">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-md shadow-red-200">
              {user?.name?.charAt(0) || 'A'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-brand-black truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 truncate">
                {user?.role === 'admin' ? 'Администратор' : 'Менеджер'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              title="Выйти"
              aria-label="Выйти"
              className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-brand-red hover:border-red-200 transition-colors flex-shrink-0"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
