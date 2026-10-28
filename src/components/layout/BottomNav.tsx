import { NavLink } from 'react-router-dom';
import { Menu, LayoutDashboard } from 'lucide-react';
import { cn, isToday } from '@/lib/utils';
import { getStore, useStoreVersion } from '@/lib/store';
import { getMobilePrimaryTabs } from './navConfig';

interface BottomNavProps {
  onMoreClick: () => void;
  moreActive: boolean;
}

/**
 * Mobile navigation — a floating rounded panel above the bottom edge of
 * the screen. Minimalist look: plain monochrome line icons (Lucide), no
 * icon backgrounds; the active tab is simply red, inactive ones quiet gray.
 *
 * Tab order: Дашборд, Поддержка, Поставщики, Покупатели, Ещё (the middle
 * three come from getMobilePrimaryTabs() — see navConfig.ts; sections the
 * current user has no access to are skipped automatically).
 * "Ещё" opens the full-screen Sidebar menu; the red dot is the mobile
 * notification indicator (same today-tasks + new-tickets count the
 * desktop Header bell shows).
 */
export default function BottomNav({ onMoreClick, moreActive }: BottomNavProps) {
  useStoreVersion(); // re-render on real-time changes from other users (see src/lib/realtime.ts)
  const primaryTabs = getMobilePrimaryTabs();

  const store = getStore();
  const todayTasks = store.tasks.filter(t => !t.completed && isToday(t.dueDate));
  const newTickets = store.tickets.filter(t => (t.status === 'Новая' || t.status === 'Новый с сайта') && !t.deletedAt);
  const hasNotifications = todayTasks.length + newTickets.length > 0;

  return (
    <div
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <nav className="pointer-events-auto mx-3 mb-3 bg-white/95 backdrop-blur border border-gray-100 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex items-stretch overflow-hidden">
        <NavLink to="/dashboard" className="flex-1 flex min-w-0">
          {({ isActive }) => (
            <div className={cn('bottom-nav-link', isActive ? 'bottom-nav-link-active' : 'bottom-nav-link-inactive')}>
              <LayoutDashboard size={22} />
            </div>
          )}
        </NavLink>

        {primaryTabs.map(item => (
          <NavLink key={item.to} to={item.to} className="flex-1 flex min-w-0">
            {({ isActive }) => (
              <div className={cn('bottom-nav-link', isActive ? 'bottom-nav-link-active' : 'bottom-nav-link-inactive')}>
                <item.icon size={22} />
              </div>
            )}
          </NavLink>
        ))}

        <button onClick={onMoreClick} className={cn('bottom-nav-link', moreActive ? 'bottom-nav-link-active' : 'bottom-nav-link-inactive')}>
          <span className="relative">
            <Menu size={22} />
            {hasNotifications && (
              <span className="absolute -top-0.5 -right-1 w-2 h-2 bg-brand-red rounded-full ring-2 ring-white" />
            )}
          </span>
        </button>
      </nav>
    </div>
  );
}
