import { LayoutDashboard, Truck, ShoppingCart, CheckSquare, BarChart2, TrendingUp, HeadphonesIcon, Settings, Database, Video, BookOpen, Server, Percent, LayoutGrid, Package, Cog } from 'lucide-react';
import { canAccess, isAdmin } from '@/lib/auth';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  visible: () => boolean;
}

/**
 * Single source of truth for every section in the app's main navigation —
 * both Sidebar.tsx (desktop) and BottomNav.tsx (mobile) render from this
 * list, so permission rules only ever need to change in one place.
 */
const ALL_NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Дашборд', icon: LayoutDashboard, visible: () => canAccess('dashboard') },
  { to: '/suppliers', label: 'Поставщики', icon: Truck, visible: () => canAccess('suppliers') },
  { to: '/buyers', label: 'Покупатели', icon: ShoppingCart, visible: () => canAccess('buyers') },
  { to: '/tasks', label: 'Задачи', icon: CheckSquare, visible: () => canAccess('tasks') },
  { to: '/support', label: 'Поддержка', icon: HeadphonesIcon, visible: () => canAccess('support') },
  { to: '/leads', label: 'База лидов', icon: Database, visible: () => canAccess('leads') },
  { to: '/media', label: 'Продвижение', icon: Video, visible: () => canAccess('media') },
  { to: '/pricing', label: 'Проценка', icon: Percent, visible: () => canAccess('pricing') },
  { to: '/planfact', label: 'План / Факт', icon: TrendingUp, visible: () => canAccess('planfact') },
  { to: '/analytics', label: 'Аналитика', icon: BarChart2, visible: () => canAccess('analytics') },
  { to: '/settings', label: 'Настройки', icon: Settings, visible: () => isAdmin() },
  { to: '/knowledge', label: 'База знаний', icon: BookOpen, visible: () => canAccess('knowledge') },
  { to: '/database', label: 'База данных', icon: Database, visible: () => isAdmin() },
  { to: '/server', label: 'Сервер', icon: Server, visible: () => isAdmin() },
];

/**
 * Section grouping for the sidebar — items are grouped under small
 * uppercase headings. Items invisible to the current user (permissions)
 * are filtered out per section by Sidebar.tsx.
 */
// v1.31.1: группы со своими иконками; «Работа» → «CRM»; «Продвижение» (бывш. Медиа сервис) после «Проценка»
export const NAV_SECTIONS: Array<{ title: string; icon: React.ElementType; paths: string[] }> = [
  { title: 'CRM', icon: LayoutGrid, paths: ['/dashboard', '/planfact', '/suppliers', '/buyers', '/tasks', '/support', '/leads'] },
  { title: 'Сервисы', icon: Package, paths: ['/pricing', '/media', '/analytics', '/knowledge'] },
  { title: 'Система', icon: Cog, paths: ['/settings', '/database'] },
];

/** Nav items the current user is allowed to see, in the order above. */
export function getVisibleNavItems(): NavItem[] {
  return ALL_NAV_ITEMS.filter(item => item.visible());
}

/**
 * The 3 sections that get their own bottom-nav tab on mobile (in priority
 * order — first 3 the current user has access to). Everything else,
 * including these 3 minus whichever didn't make the cut, is reachable via
 * the "Ещё" tab, which opens the full Sidebar.
 */
const MOBILE_PRIMARY_PRIORITY = ['/support', '/suppliers', '/buyers', '/media', '/tasks'];

export function getMobilePrimaryTabs(): NavItem[] {
  const visible = getVisibleNavItems();
  const byPath = new Map(visible.map(item => [item.to, item]));
  const primary: NavItem[] = [];
  for (const path of MOBILE_PRIMARY_PRIORITY) {
    const item = byPath.get(path);
    if (item) primary.push(item);
    if (primary.length === 3) break;
  }
  return primary;
}
