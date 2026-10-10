'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';

/**
 * Dashboard group layout — wraps all protected pages with the sidebar.
 * Redirects to /login if no session found.
 */
export default function DashboardLayout({ children }) {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      const result = await window.electronAPI?.auth.session();
      if (active && !result?.ok) router.replace('/login');
    };
    checkSession();

    let timeout;
    const resetIdleTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        await window.electronAPI?.auth.logout();
        if (active) router.replace('/login');
      }, 15 * 60 * 1000);
    };
    const events = ['mousemove', 'keydown', 'click', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetIdleTimer));
    resetIdleTimer();
    return () => {
      active = false;
      clearTimeout(timeout);
      events.forEach(event => window.removeEventListener(event, resetIdleTimer));
    };
  }, [router]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">
        {children}
      </div>
    </div>
  );
}
