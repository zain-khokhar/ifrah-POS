'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, User, AlertCircle, Sparkles, BookOpen, Users, Shirt, CreditCard, BarChart2 } from 'lucide-react';

/**
 * Phase 0 — Mock users (will be replaced with SQLite in Phase 1)
 * Credentials stored locally so the app works fully offline.
 */
const MOCK_USERS = [
  { username: 'owner',   password: 'owner123',   name: 'Shop Owner',  role: 'owner'   },
  { username: 'cashier', password: 'cashier123', name: 'Ali Cashier', role: 'cashier' },
  { username: 'viewer',  password: 'viewer123',  name: 'Viewer',      role: 'viewer'  },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername]         = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simulate async delay (will be real SQLite query in Phase 1)
    await new Promise(r => setTimeout(r, 500));

    const user = MOCK_USERS.find(
      u => u.username === username.trim() && u.password === password
    );

    if (user) {
      localStorage.setItem('ifrah_user', JSON.stringify({
        username:  user.username,
        name:      user.name,
        role:      user.role,
        loginTime: new Date().toISOString(),
      }));
      router.push('/dashboard');
    } else {
      setError('Username ya password galat hai. Dobara try karein.');
    }

    setLoading(false);
  };

  const fillDemo = (u) => {
    setUsername(u.username);
    setPassword(u.password);
    setError('');
  };

  return (
    <div className="login-page">

      {/* ── Left Panel — Branding ─────────────────────────────────── */}
      <div className="login-left">
        {/* Decorative circles */}
        {[
          { w: 280, h: 280, t: '-80px', r: '-60px', color: 'rgba(139,92,246,0.12)' },
          { w: 180, h: 180, b: '-40px', l: '-40px', color: 'rgba(245,158,11,0.08)' },
          { w: 120, h: 120, t: '40%',   r: '8%',    color: 'rgba(236,72,153,0.08)' },
        ].map((c, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: c.w, height: c.h,
            borderRadius: '50%',
            border: `1px solid ${c.color}`,
            top: c.t, right: c.r, bottom: c.b, left: c.l,
          }} />
        ))}

        <div style={{ textAlign: 'center', position: 'relative', zIndex: 1, width: '100%', maxWidth: 360 }}>
          {/* Logo */}
          <div style={{
            width: 88, height: 88,
            background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
            borderRadius: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 28px',
            boxShadow: '0 20px 48px rgba(124,58,237,0.4)',
          }}>
            <Sparkles size={42} color="#ffffff" />
          </div>

          <h1 style={{ fontSize: 30, fontWeight: 800, color: '#f59e0b', margin: '0 0 8px', letterSpacing: '-0.5px' }}>
            Ifrah Collection
          </h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '0 0 44px', letterSpacing: '2.5px', textTransform: 'uppercase' }}>
            Dress Rental Management
          </p>

          {/* Feature list */}
          {[
            { icon: BookOpen, text: 'Booking Management System' },
            { icon: Users, text: 'Customer Records & Search' },
            { icon: Shirt, text: 'Dress Catalogue & Availability' },
            { icon: CreditCard, text: 'Payment Tracking & Receipts' },
            { icon: BarChart2, text: 'Business Reports & Exports' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.text} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.06)',
                marginBottom: 6,
                textAlign: 'left',
              }}>
                <Icon size={16} color="#c084fc" />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                  {item.text}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ position: 'absolute', bottom: 20, fontSize: 11, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.5px' }}>
          Ifrah Collection POS v0.1.0 • Offline Mode
        </div>
      </div>

      {/* ── Right Panel — Login Form ──────────────────────────────── */}
      <div className="login-right">
        <div style={{ width: '100%' }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.4px' }}>
            Welcome Back
          </h2>
          <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 32px' }}>
            Apna account login karein
          </p>

          {/* Error Alert */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 14px',
              background: '#fee2e2', border: '1px solid #fecaca',
              borderRadius: 10, marginBottom: 22,
            }}>
              <AlertCircle size={16} color="#dc2626" />
              <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            {/* Username */}
            <div className="form-group">
              <label className="form-label">Username</label>
              <div style={{ position: 'relative' }}>
                <User size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: 40 }}
                  placeholder="username daalen"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  style={{ paddingLeft: 40, paddingRight: 42 }}
                  placeholder="password daalen"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8',
                  padding: 0, display: 'flex', alignItems: 'center',
                }}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 14.5, marginTop: 4 }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <div style={{
                    width: 15, height: 15, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                  Login ho raha hai...
                </>
              ) : 'Login Karein →'}
            </button>
          </form>

          {/* Demo Credentials */}
          <div style={{
            marginTop: 28, padding: '14px 16px',
            background: '#f8fafc', borderRadius: 10,
            border: '1px solid #e2e8f0',
          }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>
              Demo Accounts (Phase 0)
            </p>
            {MOCK_USERS.map(u => (
              <div key={u.username}
                onClick={() => fillDemo(u)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: 12.5, color: '#64748b',
                  padding: '5px 8px', borderRadius: 6,
                  cursor: 'pointer', marginBottom: 3,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span>
                  <strong style={{ color: '#475569' }}>{u.username}</strong>
                  {' '}/ {u.password}
                </span>
                <span className={`badge ${u.role === 'owner' ? 'badge-purple' : u.role === 'cashier' ? 'badge-info' : 'badge-gray'}`}
                  style={{ fontSize: 10, padding: '2px 7px' }}>
                  {u.role}
                </span>
              </div>
            ))}
            <p style={{ fontSize: 10.5, color: '#94a3b8', margin: '8px 0 0', fontStyle: 'italic' }}>
              Click karo to auto-fill • Phase 1 mein SQLite se real login hoga
            </p>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
