const { hashPassword, verifyPassword } = require('./passwords');
const { ROLES, requireRole } = require('./roles');
const { withAudit } = require('./audit');
const { sendResetCodeEmail } = require('./mailer');

const MAX_LOGIN_DELAY_MS = 5000;

function createAuthService(db, options = {}) {
  const sleep = options.sleep || ((milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const now = options.now || (() => new Date().toISOString());
  const failedAttempts = new Map();

  async function authenticate(username, password) {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const attempt = failedAttempts.get(normalizedUsername) || 0;
    const user = db.prepare('SELECT * FROM users WHERE lower(username) = ? AND deleted_at IS NULL').get(normalizedUsername);
    const valid = user && user.is_active && await verifyPassword(String(password || ''), user.password_hash);

    if (!valid) {
      const delay = Math.min(500 * (2 ** attempt), MAX_LOGIN_DELAY_MS);
      failedAttempts.set(normalizedUsername, attempt + 1);
      await sleep(delay);
      return { ok: false, message: 'Username ya password galat hai.' };
    }

    failedAttempts.delete(normalizedUsername);
    return {
      ok: true,
      user: { id: user.id, username: user.username, name: user.full_name, role: user.role },
    };
  }

  function needsSetup() {
    return db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND deleted_at IS NULL").get().count === 0;
  }

  async function setupOwner(input) {
    if (!needsSetup()) throw new Error('The owner account is already set up.');
    const passwordHash = await hashPassword(input.password);
    const recoveryKey = input.recoveryKey || (
      'IFRAH-' +
      Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
      Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
      Math.random().toString(36).substring(2, 6).toUpperCase()
    );
    const email = input.email ? input.email.trim().toLowerCase() : null;
    const phone = input.phone ? input.phone.trim() : null;
    const recoveryPin = input.recoveryPin ? String(input.recoveryPin).trim() : null;

    const result = withAudit(db, { id: null }, 'user.create', 'users', res => res.lastInsertRowid, {
      newValues: { username: input.username, full_name: input.fullName, role: ROLES.OWNER, email },
    }, () => {
      return db.prepare(`
        INSERT INTO users (username, password_hash, full_name, role, email, phone, recovery_key, recovery_pin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.username.trim().toLowerCase(),
        passwordHash,
        input.fullName.trim(),
        ROLES.OWNER,
        email,
        phone,
        recoveryKey,
        recoveryPin
      );
    });

    if (email) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseKey) {
          fetch(`${supabaseUrl}/auth/v1/signup`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password: 'Tmp!' + Math.random().toString(36).slice(2) }),
          }).catch(() => {});
        }
      } catch {}
    }

    return {
      lastInsertRowid: result.lastInsertRowid,
      recoveryKey,
      email,
      username: input.username.trim().toLowerCase(),
    };
  }

  async function requestPasswordReset({ identifier }) {
    const cleanId = String(identifier || '').trim().toLowerCase();
    if (!cleanId) {
      return { ok: false, message: 'Barah-e-karam apna username ya registered email darj karein.' };
    }

    const user = db.prepare(`
      SELECT * FROM users
      WHERE (lower(username) = ? OR lower(email) = ?) AND deleted_at IS NULL
    `).get(cleanId, cleanId);

    if (!user) {
      return { ok: false, message: 'Is username ya email ka koi account nahi mila.' };
    }

    // 6-digit OTP code
    const resetCode = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins expiry

    db.prepare(`
      UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = ?
      WHERE id = ?
    `).run(resetCode, expiresAt, now(), user.id);

    let maskedEmail = 'aap ke email';
    if (user.email) {
      const [local, dom] = user.email.split('@');
      maskedEmail = (local[0] || 'u') + '***@' + (dom || 'mail.com');
    }

    console.log(`[Auth Recovery] Reset code for ${user.username} (${user.email || 'no email'}): ${resetCode}`);

    let emailStatus = null;
    if (user.email) {
      emailStatus = await sendResetCodeEmail({
        to: user.email,
        username: user.username,
        code: resetCode,
      });
    }

    let message = '';
    if (emailStatus && emailStatus.sent) {
      message = `Verification code kamyabi se ${maskedEmail} par bhej diya gaya hai! Apna email inbox check karein.`;
    } else if (user.email) {
      message = `Verification code generate ho gaya hai (${maskedEmail}). (Emergency/Offline Code: ${resetCode}).`;
    } else {
      message = `Is account par koi recovery email set nahi tha. (Emergency Code: ${resetCode}).`;
    }

    return {
      ok: true,
      message,
      username: user.username,
      maskedEmail,
      hasEmail: Boolean(user.email),
      emailSent: Boolean(emailStatus?.sent),
      code: resetCode,
    };
  }

  async function resetPasswordWithCode({ identifier, code, newPassword }) {
    const cleanId = String(identifier || '').trim().toLowerCase();
    const cleanCode = String(code || '').trim();

    if (!cleanCode || !newPassword) {
      return { ok: false, message: 'Reset code aur naya password dono darj karein.' };
    }

    const user = db.prepare(`
      SELECT * FROM users
      WHERE (lower(username) = ? OR lower(email) = ?) AND deleted_at IS NULL
    `).get(cleanId, cleanId);

    if (!user) {
      return { ok: false, message: 'User account nahi mila.' };
    }

    if (!user.reset_token || user.reset_token !== cleanCode) {
      return { ok: false, message: 'Reset code galat hai.' };
    }

    if (user.reset_token_expires && new Date(user.reset_token_expires) < new Date()) {
      return { ok: false, message: 'Reset code expire ho chuka hai. Naya code mangwayein.' };
    }

    const passwordHash = await hashPassword(newPassword);

    withAudit(db, { id: user.id }, 'user.password_reset', 'users', user.id, {
      newValues: { method: 'code_reset' },
    }, () => {
      db.prepare(`
        UPDATE users
        SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = ?
        WHERE id = ?
      `).run(passwordHash, now(), user.id);
    });

    return { ok: true, message: 'Password kamyabi se tabdeel ho gaya hai! Ab naye password se login karein.' };
  }

  async function resetPasswordWithRecoveryKey({ username, recoveryKey, newPassword }) {
    const cleanKey = String(recoveryKey || '').trim().toUpperCase();
    const cleanUser = String(username || '').trim().toLowerCase();

    if (!cleanKey || !newPassword) {
      return { ok: false, message: 'Master Recovery Key aur naya password zaroori hain.' };
    }

    let user;
    if (cleanUser) {
      user = db.prepare(`
        SELECT * FROM users WHERE lower(username) = ? AND deleted_at IS NULL
      `).get(cleanUser);
    } else {
      user = db.prepare(`
        SELECT * FROM users WHERE role = 'owner' AND deleted_at IS NULL LIMIT 1
      `).get();
    }

    if (!user) {
      return { ok: false, message: 'Owner account nahi mila.' };
    }

    if (!user.recovery_key || user.recovery_key.toUpperCase() !== cleanKey) {
      return { ok: false, message: 'Master Recovery Key durust nahi hai. Barah-e-karam dobara check karein.' };
    }

    const passwordHash = await hashPassword(newPassword);

    withAudit(db, { id: user.id }, 'user.recovery_key_reset', 'users', user.id, {
      newValues: { method: 'recovery_key' },
    }, () => {
      db.prepare(`
        UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?
      `).run(passwordHash, now(), user.id);
    });

    return { ok: true, message: 'Master Recovery Key tasdeeq ho gayi! Password tabdeel ho chuka hai.' };
  }

  function recoverUsername({ emailOrPhone }) {
    const clean = String(emailOrPhone || '').trim().toLowerCase();
    if (!clean) return { ok: false, message: 'Registered email ya phone number darj karein.' };

    const user = db.prepare(`
      SELECT username, full_name, role FROM users
      WHERE (lower(email) = ? OR phone = ?) AND deleted_at IS NULL
    `).get(clean, clean);

    if (!user) {
      return { ok: false, message: 'Is email ya phone number ke sath koi account registered nahi hai.' };
    }

    return {
      ok: true,
      username: user.username,
      name: user.full_name,
      role: user.role,
      message: `Aap ka registered username: "${user.username}" hai.`,
    };
  }

  function getRecoveryKeyForOwner(session) {
    const owner = requireRole(session, [ROLES.OWNER]);
    const user = db.prepare('SELECT recovery_key, email, phone FROM users WHERE id = ?').get(owner.id);
    return {
      recoveryKey: user?.recovery_key || '',
      email: user?.email || '',
      phone: user?.phone || '',
    };
  }

  async function createUser(session, input) {
    const owner = requireRole(session, [ROLES.OWNER]);
    const passwordHash = await hashPassword(input.password);
    const result = withAudit(db, owner, 'user.create', 'users', null, {
      newValues: { username: input.username, full_name: input.fullName, role: input.role },
    }, () => db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role)
      VALUES (?, ?, ?, ?)
    `).run(input.username.trim().toLowerCase(), passwordHash, input.fullName.trim(), input.role));
    return { id: result.lastInsertRowid };
  }

  function disableUser(session, userId) {
    const owner = requireRole(session, [ROLES.OWNER]);
    if (Number(userId) === owner.id) throw new Error('The owner account cannot be disabled.');
    return withAudit(db, owner, 'user.disable', 'users', userId, {
      newValues: { is_active: 0, deleted_at: now() },
    }, () => db.prepare(`
      UPDATE users SET is_active = 0, deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(now(), now(), userId));
  }

  function listUsers(session) {
    requireRole(session, [ROLES.OWNER]);
    return db.prepare(`
      SELECT id, username, full_name AS name, role, is_active, created_at
      FROM users WHERE deleted_at IS NULL ORDER BY full_name
    `).all();
  }

  function listAuditLogs(session) {
    requireRole(session, [ROLES.OWNER]);
    return db.prepare(`
      SELECT audit_logs.*, users.username
      FROM audit_logs LEFT JOIN users ON users.id = audit_logs.user_id
      ORDER BY audit_logs.created_at DESC
    `).all();
  }

  return {
    authenticate,
    needsSetup,
    setupOwner,
    createUser,
    disableUser,
    listUsers,
    listAuditLogs,
    requestPasswordReset,
    resetPasswordWithCode,
    resetPasswordWithRecoveryKey,
    recoverUsername,
    getRecoveryKeyForOwner,
  };
}

module.exports = { createAuthService, MAX_LOGIN_DELAY_MS };