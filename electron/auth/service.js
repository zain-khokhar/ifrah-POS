const { hashPassword, verifyPassword } = require('./passwords');
const { ROLES, requireRole } = require('./roles');
const { withAudit } = require('./audit');

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
    return db.prepare('SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL').get().count === 0;
  }

  async function setupOwner(input) {
    if (!needsSetup()) throw new Error('The owner account is already set up.');
    const passwordHash = await hashPassword(input.password);
    return withAudit(db, { id: null }, 'user.create', 'users', result => result.lastInsertRowid, {
      newValues: { username: input.username, full_name: input.fullName, role: ROLES.OWNER },
    }, () => {
      return db.prepare(`
        INSERT INTO users (username, password_hash, full_name, role)
        VALUES (?, ?, ?, ?)
      `).run(input.username.trim().toLowerCase(), passwordHash, input.fullName.trim(), ROLES.OWNER);
    });
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

  return { authenticate, needsSetup, setupOwner, createUser, disableUser, listUsers, listAuditLogs };
}

module.exports = { createAuthService, MAX_LOGIN_DELAY_MS };