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
  db.close();
});