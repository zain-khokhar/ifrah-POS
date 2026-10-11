const assert = require('node:assert/strict');
const test = require('node:test');
const Database = require('better-sqlite3');
const { SCHEMA_STATEMENTS } = require('../database/schema');
const { hashPassword } = require('./passwords');
const { createAuthService } = require('./service');
const { requireRole, AuthorizationError } = require('./roles');

function createDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const statement of SCHEMA_STATEMENTS) db.exec(statement);
  return db;
}

async function seedUsers(db) {
  const passwordHash = await hashPassword('correct-password');
  const insert = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role)
    VALUES (?, ?, ?, ?)
  `);
  insert.run('zain', passwordHash, 'Zain', 'owner');
  insert.run('cashier', passwordHash, 'Cashier', 'cashier');
  insert.run('viewer', passwordHash, 'Viewer', 'viewer');
}

test('cashier cannot delete or open profit reports', async () => {
  const db = createDb();
  await seedUsers(db);
  const auth = createAuthService(db, { sleep: async () => {} });
  const result = await auth.authenticate('cashier', 'correct-password');
  assert.equal(result.ok, true);
  const session = { active: true, user: result.user };

  assert.throws(() => requireRole(session, ['owner']), AuthorizationError);
  assert.throws(() => auth.listAuditLogs(session), AuthorizationError);
  db.close();
});

test('viewer cannot change anything', async () => {
  const db = createDb();
  await seedUsers(db);
  const auth = createAuthService(db, { sleep: async () => {} });
  const result = await auth.authenticate('viewer', 'correct-password');
  const session = { active: true, user: result.user };

  await assert.rejects(() => auth.createUser(session, {
    username: 'new-user', password: 'password', fullName: 'New User', role: 'cashier',
  }), AuthorizationError);
  assert.throws(() => auth.disableUser(session, 2), AuthorizationError);
  db.close();
});

test('every user write creates an audit row', async () => {
  const db = createDb();
  await seedUsers(db);
  const auth = createAuthService(db, { sleep: async () => {}, now: () => '2026-10-10T00:00:00.000Z' });
  const result = await auth.authenticate('zain', 'correct-password');
  const session = { active: true, user: result.user };

  await auth.createUser(session, {
    username: 'new-user', password: 'password', fullName: 'New User', role: 'cashier',
  });
  auth.disableUser(session, 4);

  const audits = db.prepare('SELECT action, table_name, record_id, user_id, new_values FROM audit_logs ORDER BY id').all();
  assert.deepEqual(audits.map(audit => audit.action), ['user.create', 'user.disable']);
  assert.equal(audits[0].table_name, 'users');
  assert.equal(audits[0].user_id, result.user.id);
  assert.match(audits[0].new_values, /new-user/);
  db.close();
});

test('wrong-password delay increases and plain passwords are not stored', async () => {
  const db = createDb();
  await seedUsers(db);
  const delays = [];
  const auth = createAuthService(db, { sleep: async milliseconds => delays.push(milliseconds) });

  assert.equal((await auth.authenticate('zain', 'wrong')).ok, false);
  assert.equal((await auth.authenticate('zain', 'wrong')).ok, false);
  assert.deepEqual(delays, [500, 1000]);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE username = ?').get('zain').password_hash.includes('correct-password'), false);
  db.close();
});

test('first-run owner setup creates an audited owner account', async () => {
  const db = createDb();
  const auth = createAuthService(db, { sleep: async () => {} });

  const result = await auth.setupOwner({ username: 'zain', password: 'owner-password', fullName: 'Zain' });
  const owner = db.prepare('SELECT username, role, password_hash FROM users WHERE id = ?').get(result.lastInsertRowid);
  const audit = db.prepare('SELECT action, table_name, record_id, user_id FROM audit_logs').get();

  assert.equal(owner.username, 'zain');
  assert.equal(owner.role, 'owner');
  assert.match(owner.password_hash, /^scrypt\$/);
  assert.deepEqual(audit, { action: 'user.create', table_name: 'users', record_id: result.lastInsertRowid, user_id: null });
  assert.match(result.recoveryKey, /^IFRAH-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+/);
  db.close();
});

test('requestPasswordReset and resetPasswordWithCode flow works', async () => {
  const db = createDb();
  const auth = createAuthService(db, { sleep: async () => {} });

  await auth.setupOwner({
    username: 'zain',
    password: 'old-password',
    fullName: 'Zain Khokhar',
    email: 'zain@example.com',
  });

  // 1. Request reset
  const reqRes = await auth.requestPasswordReset({ identifier: 'zain@example.com' });
  assert.equal(reqRes.ok, true);
  assert.match(reqRes.code, /^\d{6}$/);

  // 2. Reset with code
  const resetRes = await auth.resetPasswordWithCode({
    identifier: 'zain',
    code: reqRes.code,
    newPassword: 'new-secure-password',
  });
  assert.equal(resetRes.ok, true);

  // 3. Authenticate with new password
  const loginRes = await auth.authenticate('zain', 'new-secure-password');
  assert.equal(loginRes.ok, true);

  // 4. Old password must fail
  const oldLoginRes = await auth.authenticate('zain', 'old-password');
  assert.equal(oldLoginRes.ok, false);

  db.close();
});

test('resetPasswordWithRecoveryKey enables offline emergency password reset', async () => {
  const db = createDb();
  const auth = createAuthService(db, { sleep: async () => {} });

  const ownerRes = await auth.setupOwner({
    username: 'zain',
    password: 'initial-password',
    fullName: 'Zain',
    email: 'zain@boutique.com',
  });

  const recoveryKey = ownerRes.recoveryKey;
  assert.ok(recoveryKey);

  // Reset with recovery key
  const resetRes = await auth.resetPasswordWithRecoveryKey({
    username: 'zain',
    recoveryKey,
    newPassword: 'emergency-recovered-password',
  });
  assert.equal(resetRes.ok, true);

  // Verify new password works
  const loginRes = await auth.authenticate('zain', 'emergency-recovered-password');
  assert.equal(loginRes.ok, true);

  db.close();
});

test('recoverUsername returns username for registered email or phone', async () => {
  const db = createDb();
  const auth = createAuthService(db, { sleep: async () => {} });

  await auth.setupOwner({
    username: 'zainkhokhar',
    password: 'password123',
    fullName: 'Zain Khokhar',
    email: 'zain@boutique.com',
    phone: '03001234567',
  });

  const resEmail = auth.recoverUsername({ emailOrPhone: 'zain@boutique.com' });
  assert.equal(resEmail.ok, true);
  assert.equal(resEmail.username, 'zainkhokhar');

  const resPhone = auth.recoverUsername({ emailOrPhone: '03001234567' });
  assert.equal(resPhone.ok, true);
  assert.equal(resPhone.username, 'zainkhokhar');

  const resFail = auth.recoverUsername({ emailOrPhone: 'unknown@example.com' });
  assert.equal(resFail.ok, false);

  db.close();
});