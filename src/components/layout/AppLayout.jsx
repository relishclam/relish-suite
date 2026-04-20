import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className={`app-layout${sidebarCollapsed ? ' app-layout--collapsed' : ''}${mobileOpen ? ' app-layout--mobile-open' : ''}`}>
      {/* Mobile backdrop */}
      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="app-layout__main">
        <Header onMenuToggle={() => setMobileOpen((prev) => !prev)} />
        <main className="app-layout__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
