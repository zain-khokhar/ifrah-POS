'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Root page — redirects to /dashboard if logged in, else /login
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const user = localStorage.getItem('ifrah_user');
    if (user) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [router]);

  // Loading splash while redirecting
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(145deg, #0f0e1a 0%, #1e1040 55%, #2d1b69 100%)',
    }}>
      <div style={{ fontSize: 48, marginBottom: 20 }}>👗</div>
      <h1 style={{ color: '#f59e0b', fontSize: 22, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.3px' }}>
        Ifrah Collection
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>
        Loading POS System...
      </p>
      <div style={{
        marginTop: 32,
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: '3px solid rgba(139,92,246,0.2)',
        borderTopColor: '#8b5cf6',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
