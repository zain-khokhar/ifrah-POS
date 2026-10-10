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
    const user = localStorage.getItem('ifrah_user');
    if (!user) {
      router.replace('/login');
    }
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
