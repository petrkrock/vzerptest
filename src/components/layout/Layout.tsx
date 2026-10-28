import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';

// v1.31.0: шапка на всю длину сверху; слева парящее меню, справа контент.
export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('vz_sidebar_collapsed') === '1'
  );

  function toggleSidebarCollapse() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem('vz_sidebar_collapsed', next ? '1' : '0');
  }

  return (
    <div className="min-h-screen bg-brand-gray flex flex-col">
      <Header />
      <div className="flex-1 flex min-h-0">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
        />
        <div
          className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-300 ${
            sidebarCollapsed ? 'lg:ml-[4.5rem]' : 'lg:ml-[17rem]'
          }`}
        >
          <main
            className="flex-1 p-4 md:p-6 overflow-auto"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)',
              paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))',
            }}
          >
            <Outlet />
          </main>
        </div>
      </div>
      <BottomNav onMoreClick={() => setSidebarOpen(true)} moreActive={sidebarOpen} />
    </div>
  );
}
