'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Eye, EyeOff, Lock, User, AlertCircle, Sparkles, BookOpen, Users, Shirt,
  CreditCard, BarChart2, Key, Mail, Phone, CheckCircle, Copy, HelpCircle,
  ShieldCheck, X, ArrowLeft
} from 'lucide-react';
import ActivationModal from '@/components/licensing/ActivationModal';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername]         = useState('');
  const [password, setPassword]         = useState('');
  const [fullName, setFullName]         = useState('');
  const [email, setEmail]               = useState('');
  const [phone, setPhone]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [needsSetup, setNeedsSetup]     = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);

  // Recovery Key post-setup modal
  const [showKeyModal, setShowKeyModal]     = useState(false);
  const [createdRecoveryKey, setCreatedRecoveryKey] = useState('');
  const [keyCopied, setKeyCopied]           = useState(false);

  // Forgot password & account recovery modal
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryTab, setRecoveryTab]             = useState('email'); // 'email' | 'key' | 'username'
  const [emailResetInput, setEmailResetInput]     = useState('');
  const [masterKeyUsername, setMasterKeyUsername] = useState('');
  const [recoveryCode, setRecoveryCode]           = useState('');
  const [codeSent, setCodeSent]                   = useState(false);
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPass, setRecoveryConfirmPass] = useState('');
  const [masterRecoveryKey, setMasterRecoveryKey] = useState('');
  const [recoveryPhoneOrEmail, setRecoveryPhoneOrEmail] = useState('');
  const [recoveryMsg, setRecoveryMsg]             = useState({ type: '', text: '' });
  const [recoveryLoading, setRecoveryLoading]     = useState(false);
  const [showActivation, setShowActivation]       = useState(false);

  useEffect(() => {
    window.electronAPI?.auth.needsSetup().then(result => setNeedsSetup(result?.needsSetup));
    window.electronAPI?.license?.check().then(lic => {
      if (lic && !lic.licensed) {
        setShowActivation(true);
      }
    }).catch(() => {});
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (needsSetup) {
      if (password !== confirmPassword) {
        setError('Password aur Confirm Password aapas mein match nahi kar rahe.');
        return;
      }
      if (!email.trim()) {
        setError('Barah-e-karam apna recovery email zaroor darj karein.');
        return;
      }
    }

    setLoading(true);

    try {
      if (needsSetup) {
        const setupResult = await window.electronAPI.auth.setupOwner({
          username,
          password,
          fullName: fullName.trim() || 'Owner',
          email: email.trim(),
          phone: phone.trim(),
        });

        if (setupResult.ok === false) {
          setError(setupResult.message || 'Setup mein masla pesh aya.');
          setLoading(false);
          return;
        }

        // Save session locally and show recovery key modal
        localStorage.setItem('ifrah_user', JSON.stringify({
          username: username.trim().toLowerCase(),
          name: fullName.trim() || 'Owner',
          role: 'owner',
          loginTime: new Date().toISOString(),
        }));

        setCreatedRecoveryKey(setupResult.recoveryKey || 'IFRAH-OWNER-KEY');
        setShowKeyModal(true);
        setLoading(false);
        return;
      }

      const result = await window.electronAPI.auth.login({ username, password });

      if (result.ok !== false) {
        localStorage.setItem('ifrah_user', JSON.stringify({
          username:  result.user.username,
          name:      result.user.name,
          role:      result.user.role,
          loginTime: new Date().toISOString(),
        }));
        router.push('/dashboard');
      } else {
        setError(result.message || 'Username ya password galat hai. Dobara try karein.');
      }
    } catch (err) {
      setError(err.message || 'System error: Barah-e-karam dobara koshish karein.');
    } finally {
      setLoading(false);
    }
  };

  const copyKeyToClipboard = (key) => {
    navigator.clipboard?.writeText(key);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2500);
  };

  const handleProceedToDashboard = () => {
    setShowKeyModal(false);
    router.push('/dashboard');
  };

  // ── Recovery Handlers ────────────────────────────────────────────────────────
  const handleRequestCode = async (e) => {
    e.preventDefault();
    setRecoveryMsg({ type: '', text: '' });
    if (!emailResetInput.trim()) {
      setRecoveryMsg({ type: 'error', text: 'Username ya Email darj karein.' });
      return;
    }
    setRecoveryLoading(true);
    try {
      const res = await window.electronAPI.auth.requestReset({ identifier: emailResetInput.trim() });
      if (res.ok) {
        setCodeSent(true);
        if (res.code) {
          setRecoveryCode(res.code); // Pre-fill in local dev/offline mode for effortless ease
        }
        setRecoveryMsg({ type: 'success', text: res.message || 'Reset code bhej diya gaya hai.' });
      } else {
        setRecoveryMsg({ type: 'error', text: res.message || 'Account nahi mila.' });
      }
    } catch (err) {
      setRecoveryMsg({ type: 'error', text: err.message });
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleResetWithCode = async (e) => {
    e.preventDefault();
    setRecoveryMsg({ type: '', text: '' });
    if (!recoveryCode.trim() || !recoveryNewPassword) {
      setRecoveryMsg({ type: 'error', text: 'Reset code aur naya password dono darj karein.' });
      return;
    }
    if (recoveryNewPassword !== recoveryConfirmPass) {
      setRecoveryMsg({ type: 'error', text: 'Naya password aur confirm password match nahi kar rahe.' });
      return;
    }
    setRecoveryLoading(true);
    try {
      const res = await window.electronAPI.auth.resetWithCode({
        identifier: emailResetInput.trim(),
        code: recoveryCode.trim(),
        newPassword: recoveryNewPassword,
      });
      if (res.ok) {
        setRecoveryMsg({ type: 'success', text: res.message || 'Password tabdeel ho gaya!' });
        setTimeout(() => {
          setShowRecoveryModal(false);
          setPassword('');
          setError('Naya password set ho gaya hai. Ab login karein.');
        }, 1500);
      } else {
        setRecoveryMsg({ type: 'error', text: res.message || 'Reset code galat hai.' });
      }
    } catch (err) {
      setRecoveryMsg({ type: 'error', text: err.message });
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleResetWithKey = async (e) => {
    e.preventDefault();
    setRecoveryMsg({ type: '', text: '' });
    if (!masterRecoveryKey.trim() || !recoveryNewPassword) {
      setRecoveryMsg({ type: 'error', text: 'Master Recovery Key aur naya password dono darj karein.' });
      return;
    }
    if (recoveryNewPassword !== recoveryConfirmPass) {
      setRecoveryMsg({ type: 'error', text: 'Naya password aur confirm password match nahi kar rahe.' });
      return;
    }
    setRecoveryLoading(true);
    try {
      const res = await window.electronAPI.auth.resetWithKey({
        username: masterKeyUsername.trim() || undefined,
        recoveryKey: masterRecoveryKey.trim(),
        newPassword: recoveryNewPassword,
      });
      if (res.ok) {
        setRecoveryMsg({ type: 'success', text: res.message || 'Master Key verify ho gayi! Password tabdeel ho gaya.' });
        setTimeout(() => {
          setShowRecoveryModal(false);
          setPassword('');
          setError('Password tabdeel ho gaya hai. Ab login karein.');
        }, 1500);
      } else {
        setRecoveryMsg({ type: 'error', text: res.message || 'Master Recovery Key ghalat hai.' });
      }
    } catch (err) {
      setRecoveryMsg({ type: 'error', text: err.message });
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleRecoverUsername = async (e) => {
    e.preventDefault();
    setRecoveryMsg({ type: '', text: '' });
    if (!recoveryPhoneOrEmail.trim()) {
      setRecoveryMsg({ type: 'error', text: 'Registered email ya phone number darj karein.' });
      return;
    }
    setRecoveryLoading(true);
    try {
      const res = await window.electronAPI.auth.recoverUsername({ emailOrPhone: recoveryPhoneOrEmail.trim() });
      if (res.ok) {
        setRecoveryMsg({
          type: 'success',
          text: `Aap ka registered username: "${res.username}" (${res.name || res.role}) hai.`,
        });
        setUsername(res.username);
      } else {
        setRecoveryMsg({ type: 'error', text: res.message || 'Account nahi mila.' });
      }
    } catch (err) {
      setRecoveryMsg({ type: 'error', text: err.message });
    } finally {
      setRecoveryLoading(false);
    }
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
          {/* Logo Monogram */}
          <div style={{
            width: 104, height: 104,
            borderRadius: '50%',
            overflow: 'hidden',
            margin: '0 auto 24px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
            border: '2.5px solid #f59e0b',
          }}>
            <img
              src="/logo.jpeg"
              alt="Ifrah Collection"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
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
          Ifrah Collection POS v0.1.0 • Enterprise Edition
        </div>
      </div>

      {/* ── Right Panel — Login / Setup Form ──────────────────────── */}
      <div className="login-right">
        <div style={{ width: '100%', maxWidth: 420 }}>
          {/* Logo Monogram */}
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <img
              src="/logo.jpeg"
              alt="Ifrah Collection Monogram"
              style={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                objectFit: 'cover',
                margin: '0 auto 12px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                border: '2.5px solid #d97706',
                display: 'block',
              }}
            />
          </div>

          <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.4px', textAlign: 'center' }}>
            {needsSetup ? 'Initial Owner Setup' : 'Welcome Back'}
          </h2>
          <p style={{ fontSize: 13.5, color: '#64748b', margin: '0 0 24px', textAlign: 'center' }}>
            {needsSetup
              ? 'Pehli martaba Admin / Owner account banayein aur recovery key hasil karein.'
              : 'Apna username aur password darj karke POS login karein.'}
          </p>

          {/* Error Alert */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 14px',
              background: error.includes('Naya password') ? '#ecfdf5' : '#fee2e2',
              border: `1px solid ${error.includes('Naya password') ? '#a7f3d0' : '#fecaca'}`,
              borderRadius: 10, marginBottom: 20,
            }}>
              {error.includes('Naya password') ? (
                <CheckCircle size={16} color="#059669" />
              ) : (
                <AlertCircle size={16} color="#dc2626" />
              )}
              <span style={{ fontSize: 13, color: error.includes('Naya password') ? '#059669' : '#dc2626', fontWeight: 500 }}>
                {error}
              </span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            {/* Username */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" style={{ fontWeight: 600 }}>Username</label>
              <div style={{ position: 'relative' }}>
                <User size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: 40 }}
                  placeholder="e.g. zain / admin"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Additional Fields for First-Time Setup */}
            {needsSetup && (
              <>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Owner Full Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Zain Khokhar"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Owner Email <span style={{ color: '#7c3aed', fontSize: 11 }}>(Password Recovery ke liye)</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      type="email"
                      className="form-input"
                      style={{ paddingLeft: 40 }}
                      placeholder="owner@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Mobile Phone <span style={{ color: '#94a3b8', fontSize: 11 }}>(Ikhtiyari)</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      type="text"
                      className="form-input"
                      style={{ paddingLeft: 40 }}
                      placeholder="0300-1234567"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Password */}
            <div className="form-group" style={{ marginBottom: needsSetup ? 16 : 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Password</label>
                {!needsSetup && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmailResetInput(username);
                      setMasterKeyUsername('');
                      setMasterRecoveryKey('');
                      setRecoveryCode('');
                      setCodeSent(false);
                      setRecoveryMsg({ type: '', text: '' });
                      setShowRecoveryModal(true);
                    }}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      color: '#7c3aed', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', textDecoration: 'underline',
                    }}
                  >
                    Password bhool gaye?
                  </button>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  style={{ paddingLeft: 40, paddingRight: 42 }}
                  placeholder="••••••••"
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

            {/* Confirm Password (Setup only) */}
            {needsSetup && (
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Confirm Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="password"
                    className="form-input"
                    style={{ paddingLeft: 40 }}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '12px 16px',
                fontSize: 14.5,
                marginTop: 14,
                whiteSpace: 'normal',
                lineHeight: 1.3,
                boxSizing: 'border-box',
                textAlign: 'center',
              }}
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
                  {needsSetup ? 'Admin account ban raha hai...' : 'Login ho raha hai...'}
                </>
              ) : needsSetup ? 'Setup Mukammal Karein →' : 'Login Karein →'}
            </button>
          </form>
        </div>
      </div>

      {/* ── Modal 1: Post-Setup Master Recovery Key Display ───────── */}
      {showKeyModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
        }}>
          <div style={{
            background: 'white', borderRadius: 16, maxWidth: 480, width: '100%',
            padding: 28, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            textAlign: 'center',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: '#f5f3ff',
              color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <ShieldCheck size={32} />
            </div>

            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
              Admin Account Kamyabi Se Ban Gaya!
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: '0 0 20px' }}>
              Yeh aap ki <strong>Emergency Master Recovery Key</strong> hai. Agar kabhi internet na ho aur aap password bhool jayein, to is key ke zariye POS ka password foran reset kiya ja sakta hai.
            </p>

            {/* Key Box */}
            <div style={{
              background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: 12,
              padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 16,
            }}>
              <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#0f172a', letterSpacing: 1.5 }}>
                {createdRecoveryKey}
              </span>
              <button
                type="button"
                onClick={() => copyKeyToClipboard(createdRecoveryKey)}
                style={{
                  background: keyCopied ? '#10b981' : '#7c3aed', color: 'white',
                  border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12,
                  fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                }}
              >
                {keyCopied ? <CheckCircle size={14} /> : <Copy size={14} />}
                {keyCopied ? 'Copied!' : 'Copy Key'}
              </button>
            </div>

            <p style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fef3c7', padding: '8px 12px', borderRadius: 8, margin: '0 0 24px' }}>
              ⚠️ Barah-e-karam is key ko kisi mehfooz dairy ya file mein note kar lein.
            </p>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
              onClick={handleProceedToDashboard}
            >
              Samajh Gaya — Dashboard Par Jayein →
            </button>
          </div>
        </div>
      )}

      {/* ── Modal 2: Forgot Password & Account Recovery ───────────── */}
      {showRecoveryModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
        }}>
          <div style={{
            background: 'white', borderRadius: 16, maxWidth: 500, width: '100%',
            padding: 26, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                  Account Recovery (Password / Username Reset)
                </h3>
                <p style={{ fontSize: 12.5, color: '#64748b', margin: 0 }}>
                  Aap email ya emergency master recovery key se apna account reset kar saktay hain.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRecoveryModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 10, marginBottom: 18 }}>
              {[
                { id: 'email', label: '📧 Email OTP Reset' },
                { id: 'key',   label: '🔑 Master Key (Offline)' },
                { id: 'username', label: '👤 Username Maloom Karein' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setRecoveryTab(tab.id);
                    setRecoveryMsg({ type: '', text: '' });
                  }}
                  style={{
                    flex: 1, padding: '7px 10px', fontSize: 12, fontWeight: 600,
                    border: 'none', borderRadius: 7, cursor: 'pointer',
                    background: recoveryTab === tab.id ? 'white' : 'transparent',
                    color: recoveryTab === tab.id ? '#7c3aed' : '#64748b',
                    boxShadow: recoveryTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Feedback Message */}
            {recoveryMsg.text && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16,
                background: recoveryMsg.type === 'success' ? '#ecfdf5' : '#fee2e2',
                border: `1px solid ${recoveryMsg.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
                color: recoveryMsg.type === 'success' ? '#065f46' : '#991b1b',
              }}>
                {recoveryMsg.text}
              </div>
            )}

            {/* TAB 1: Email Reset */}
            {recoveryTab === 'email' && (
              <div>
                {!codeSent ? (
                  <form onSubmit={handleRequestCode}>
                    <div className="form-group" style={{ marginBottom: 14 }}>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>
                        Apna Username ya Registered Email darj karein
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. zainkhokhar ya owner@example.com"
                        value={emailResetInput}
                        onChange={e => setEmailResetInput(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center' }}
                      disabled={recoveryLoading}
                    >
                      {recoveryLoading ? 'Code Bheja Ja Raha Hai...' : '6-Digit Reset Code Mangwayein →'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResetWithCode}>
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>
                        6-Digit Verification Code
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="6-digit code"
                        value={recoveryCode}
                        onChange={e => setRecoveryCode(e.target.value)}
                        required
                        style={{ letterSpacing: 2, fontWeight: 700 }}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>
                        Naya Password
                      </label>
                      <input
                        type="password"
                        className="form-input"
                        placeholder="••••••••"
                        value={recoveryNewPassword}
                        onChange={e => setRecoveryNewPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 16 }}>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>
                        Confirm Naya Password
                      </label>
                      <input
                        type="password"
                        className="form-input"
                        placeholder="••••••••"
                        value={recoveryConfirmPass}
                        onChange={e => setRecoveryConfirmPass(e.target.value)}
                        required
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => setCodeSent(false)}
                        className="btn btn-secondary"
                        style={{ flex: 1 }}
                      >
                        Peechay Jayein
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ flex: 2, justifyContent: 'center' }}
                        disabled={recoveryLoading}
                      >
                        {recoveryLoading ? 'Updating...' : 'Naya Password Set Karein'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* TAB 2: Master Recovery Key (Emergency Offline) */}
            {recoveryTab === 'key' && (
              <form onSubmit={handleResetWithKey}>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>
                    Username (Ikhtiyari — Khali chorne par Owner account select hoga)
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. zainkhokhar (khali chorne par Owner)"
                    value={masterKeyUsername}
                    onChange={e => setMasterKeyUsername(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>
                    Master Recovery Key
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. IFRAH-XXXX-XXXX-XXXX"
                    value={masterRecoveryKey}
                    onChange={e => setMasterRecoveryKey(e.target.value)}
                    required
                    style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1 }}
                  />
                  <small style={{ color: '#64748b', fontSize: 11, marginTop: 4, display: 'block' }}>
                    Setup ke waqt milne wali 16-character emergency key darj karein.
                  </small>
                </div>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>
                    Naya Password
                  </label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="••••••••"
                    value={recoveryNewPassword}
                    onChange={e => setRecoveryNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>
                    Confirm Naya Password
                  </label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="••••••••"
                    value={recoveryConfirmPass}
                    onChange={e => setRecoveryConfirmPass(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={recoveryLoading}
                >
                  {recoveryLoading ? 'Tasdeeq Ho Rahi Hai...' : 'Master Key Se Password Reset Karein →'}
                </button>
              </form>
            )}

            {/* TAB 3: Find Username */}
            {recoveryTab === 'username' && (
              <form onSubmit={handleRecoverUsername}>
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>
                    Registered Email ya Phone Number
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="owner@example.com ya 03001234567"
                    value={recoveryPhoneOrEmail}
                    onChange={e => setRecoveryPhoneOrEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={recoveryLoading}
                >
                  {recoveryLoading ? 'Talaash Ho Raha Hai...' : 'Username Maloom Karein'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Security License Gate Modal ── */}
      <ActivationModal isOpen={showActivation} onActivated={() => setShowActivation(false)} />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
