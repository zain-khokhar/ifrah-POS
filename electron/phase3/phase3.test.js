/**
 * electron/phase3/phase3.test.js
 *
 * Phase 3 tests:
 *  - Learning dropdowns (add, dedup, Urdu normalization, re-enable)
 *  - Customers (create, list, search, duplicate guard, CNIC validation, soft delete)
 *  - Dresses (create, list, deactivate, owner-only rate, similar-name)
 *  - Normalize utility
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { SCHEMA_STATEMENTS }      = require('../database/schema');
const { normalizeName }          = require('../domain/normalize');
const { createListsService }     = require('../lists/service');
const { createCustomersService } = require('../customers/service');
const { createDressesService }   = require('../dresses/service');

// ─── Shared DB & services ─────────────────────────────────────────────────────
function makeDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const stmt of SCHEMA_STATEMENTS) db.exec(stmt);
  return db;
}

function makeOwnerSession(db) {
  const result = db.prepare(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ('owner', 'x', 'Owner', 'owner')`
  ).run();
  return { active: true, user: { id: result.lastInsertRowid, username: 'owner', name: 'Owner', role: 'owner' } };
}

function makeCashierSession(db, ownerId) {
  const result = db.prepare(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ('cashier', 'x', 'Cashier', 'cashier')`
  ).run();
  return { active: true, user: { id: result.lastInsertRowid, username: 'cashier', name: 'Cashier', role: 'cashier' } };
}

function makeViewerSession(db) {
  const result = db.prepare(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ('viewer', 'x', 'Viewer', 'viewer')`
  ).run();
  return { active: true, user: { id: result.lastInsertRowid, username: 'viewer', name: 'Viewer', role: 'viewer' } };
}

// ─── Fake app object for dresses service ─────────────────────────────────────
const fakeApp = { getPath: () => require('os').tmpdir() };

// ─── normalizeName ────────────────────────────────────────────────────────────
describe('normalizeName utility', () => {
  it('strips spaces and lowercases', () => {
    assert.equal(normalizeName('  Lahore  '), 'lahore');
  });
  it('strips punctuation', () => {
    assert.equal(normalizeName('lah-ore'), 'lahore');
    assert.equal(normalizeName("O'Brien"), 'obrien');
  });
  it('treats Arabic Yeh and Urdu Ye as equal', () => {
    const arabicYeh = '\u064a\u062a\u0648\u0646';
    const urduYe    = '\u06cc\u062a\u0648\u0646';
    assert.equal(normalizeName(arabicYeh), normalizeName(urduYe));
  });
  it('returns empty string for null/undefined', () => {
    assert.equal(normalizeName(null), '');
    assert.equal(normalizeName(undefined), '');
  });
});

// ─── Learning Dropdowns ───────────────────────────────────────────────────────
describe('learning dropdown lists', () => {
  let db, ownerSession, cashierSession, viewerSession, listsService;
  before(() => {
    db = makeDb();
    ownerSession   = makeOwnerSession(db);
    cashierSession = makeCashierSession(db);
    viewerSession  = makeViewerSession(db);
    listsService   = createListsService(db);
  });
  after(() => db.close());

  it('seedIfMissing inserts new entries', () => {
    listsService.seedIfMissing('cities', ['Lahore', 'Karachi']);
    const rows = listsService.list('cities');
    assert.ok(rows.some(r => r.name === 'Lahore'));
    assert.ok(rows.some(r => r.name === 'Karachi'));
  });

  it('seedIfMissing is idempotent (no duplicates on re-run)', () => {
    listsService.seedIfMissing('cities', ['Lahore', 'Karachi']);
    const rows = listsService.list('cities');
    const lahoreCount = rows.filter(r => r.name === 'Lahore').length;
    assert.equal(lahoreCount, 1);
  });

  it('add returns existing entry when normalized name matches', () => {
    listsService.seedIfMissing('casts', ['Rajput']);
    const result = listsService.add(ownerSession, 'casts', '  RAJPUT  ');
    assert.equal(result.alreadyExisted, true);
  });

  it('cashier can add a city', () => {
    const result = listsService.add(cashierSession, 'cities', 'Faisalabad');
    assert.ok(result.id);
    assert.equal(result.name, 'Faisalabad');
  });

  it('viewer cannot add', () => {
    assert.throws(() => listsService.add(viewerSession, 'cities', 'Multan'), /FORBIDDEN|permission/i);
  });

  it('rename changes name but keeps normalized unique check', () => {
    listsService.seedIfMissing('casts', ['OldCast']);
    const rows = listsService.list('casts');
    const old  = rows.find(r => r.name === 'OldCast');
    listsService.rename(ownerSession, 'casts', old.id, 'NewCast');
    const updated = listsService.list('casts').find(r => r.id === old.id);
    assert.equal(updated.name, 'NewCast');
  });

  it('disable soft-deletes and hides entry from list', () => {
    listsService.seedIfMissing('casts', ['ToDisable']);
    const row = listsService.list('casts').find(r => r.name === 'ToDisable');
    listsService.disable(ownerSession, 'casts', row.id);
    const stillThere = listsService.list('casts').find(r => r.id === row.id);
    assert.equal(stillThere, undefined);
  });

  it('re-adding a disabled entry reactivates it', () => {
    listsService.seedIfMissing('cities', ['Gujranwala']);
    const row = listsService.list('cities').find(r => r.name === 'Gujranwala');
    listsService.disable(ownerSession, 'cities', row.id);
    const result = listsService.add(ownerSession, 'cities', 'Gujranwala');
    assert.equal(result.reactivated, true);
    const found = listsService.list('cities').find(r => r.id === row.id);
    assert.ok(found);
  });

  it('unknown table throws', () => {
    assert.throws(() => listsService.list('unknown_table'), /Unknown list table/);
  });
});

// ─── Customers ────────────────────────────────────────────────────────────────
describe('customers service', () => {
  let db, ownerSession, cashierSession, viewerSession, customersService, listsService;
  before(() => {
    db = makeDb();
    ownerSession    = makeOwnerSession(db);
    cashierSession  = makeCashierSession(db);
    viewerSession   = makeViewerSession(db);
    listsService    = createListsService(db);
    customersService = createCustomersService(db);
    listsService.seedIfMissing('cities', ['Lahore']);
    listsService.seedIfMissing('relation_types', ['Husband']);
  });
  after(() => db.close());

  it('owner can create a customer', () => {
    const res = customersService.create(ownerSession, { name: 'Ayesha Khan', phone: '03001234567' });
    assert.ok(res.id);
  });

  it('cashier can create a customer', () => {
    const res = customersService.create(cashierSession, { name: 'Sana Malik', phone: '03331234567' });
    assert.ok(res.id);
  });

  it('viewer cannot create', () => {
    assert.throws(() => customersService.create(viewerSession, { name: 'Fatima' }), /FORBIDDEN|permission/i);
  });

  it('list returns all active customers', () => {
    const rows = customersService.list(ownerSession);
    assert.ok(rows.length >= 2);
  });

  it('search by name works (case-insensitive)', () => {
    const rows = customersService.list(ownerSession, { search: 'ayesha' });
    assert.ok(rows.some(r => r.name === 'Ayesha Khan'));
  });

  it('search by phone works', () => {
    const rows = customersService.list(ownerSession, { search: '03001234567' });
    assert.ok(rows.some(r => r.name === 'Ayesha Khan'));
  });

  it('CNIC format validated when provided', () => {
    assert.throws(
      () => customersService.create(ownerSession, { name: 'Zara', cnic: '12345' }),
      /format|CNIC/i
    );
  });

  it('valid CNIC is accepted', () => {
    const res = customersService.create(ownerSession, { name: 'Hina Baig', cnic: '35202-1234567-8' });
    assert.ok(res.id);
  });

  it('rejects incomplete phone (< 11 digits)', () => {
    assert.throws(
      () => customersService.create(ownerSession, { name: 'Ali Khan', phone: '03003333' }),
      /11 digits/i
    );
  });

  it('rejects phone not starting with 03', () => {
    assert.throws(
      () => customersService.create(ownerSession, { name: 'Ali Khan', phone: '04231234567' }),
      /03 se shuru/i
    );
  });

  it('rejects phone2 identical to phone', () => {
    assert.throws(
      () => customersService.create(ownerSession, {
        name: 'Ali Khan',
        phone: '03001234567',
        phone2: '03001234567',
      }),
      /Phone 2 aur Phone 1 same nahi ho sakte/i
    );
  });

  it('rejects relative phone identical to customer phone', () => {
    assert.throws(
      () => customersService.create(ownerSession, {
        name: 'Ali Khan',
        phone: '03001234567',
        relation_type_id: 1,
        relative_name: 'Usman Khan',
        relative_phone: '03001234567',
      }),
      /Relative ka phone aur Customer ka phone same nahi ho sakta/i
    );
  });

  it('rejects relative CNIC identical to customer CNIC', () => {
    assert.throws(
      () => customersService.create(ownerSession, {
        name: 'Ali Khan',
        phone: '03001234567',
        cnic: '35202-2222222-2',
        relation_type_id: 1,
        relative_name: 'Usman Khan',
        relative_phone: '03009876543',
        relative_cnic: '35202-2222222-2',
      }),
      /Relative ka CNIC/i
    );
  });

  it('rejects relative name identical to customer name', () => {
    assert.throws(
      () => customersService.create(ownerSession, {
        name: 'Ali Khan',
        phone: '03001234567',
        relation_type_id: 1,
        relative_name: 'ali khan',
        relative_phone: '03009876543',
      }),
      /Relative ka naam customer ke naam jaisa nahi ho sakta/i
    );
  });

  it('findDuplicate catches same name+phone', () => {
    customersService.create(ownerSession, { name: 'Duplicate Test', phone: '03111111111' });
    const dup = customersService.findDuplicate('Duplicate Test', '03111111111');
    assert.ok(dup);
    assert.equal(dup.name, 'Duplicate Test');
  });

  it('phone stored as text — leading zero preserved', () => {
    customersService.create(ownerSession, { name: 'Zero Test', phone: '03001234999' });
    const rows = customersService.list(ownerSession, { search: '03001234999' });
    assert.ok(rows.some(r => r.phone === '03001234999'));
  });

  it('update changes fields and audits', () => {
    const created = customersService.create(ownerSession, { name: 'UpdateMe', phone: '03009999000' });
    customersService.update(ownerSession, created.id, { name: 'Updated Name', phone: '03009999000' });
    const row = customersService.get(ownerSession, created.id);
    assert.equal(row.name, 'Updated Name');
  });

  it('owner can soft-delete a customer with no bookings', () => {
    const created = customersService.create(ownerSession, { name: 'DeleteMe' });
    const res = customersService.softDelete(ownerSession, created.id);
    assert.equal(res.ok, true);
    const row = customersService.get(ownerSession, created.id);
    assert.equal(row, null);
  });

  it('cashier cannot delete', () => {
    const created = customersService.create(ownerSession, { name: 'NoDel' });
    assert.throws(() => customersService.softDelete(cashierSession, created.id), /FORBIDDEN|permission/i);
  });
});

// ─── Dresses ─────────────────────────────────────────────────────────────────
describe('dresses service', () => {
  let db, ownerSession, cashierSession, viewerSession, dressesService, listsService;
  before(() => {
    db = makeDb();
    ownerSession   = makeOwnerSession(db);
    cashierSession = makeCashierSession(db);
    viewerSession  = makeViewerSession(db);
    listsService   = createListsService(db);
    dressesService = createDressesService(db, fakeApp);
    listsService.seedIfMissing('dress_categories', ['Lehenga', 'Saree']);
  });
  after(() => db.close());

  it('owner can create a dress', () => {
    const res = dressesService.create(ownerSession, { name: 'Red Bridal Lehenga', rental_price: 25000 });
    assert.ok(res.id);
    assert.ok(res.code.startsWith('D-'));
  });

  it('cashier can create a dress (rate 0)', () => {
    const res = dressesService.create(cashierSession, { name: 'Blue Gharara', rental_price: 0 });
    assert.ok(res.id);
  });

  it('cashier cannot set rental_price > 0', () => {
    assert.throws(
      () => dressesService.create(cashierSession, { name: 'Test', rental_price: 5000 }),
      /Owner|rental price/i
    );
  });

  it('viewer cannot create', () => {
    assert.throws(() => dressesService.create(viewerSession, { name: 'V' }), /FORBIDDEN|permission/i);
  });

  it('list returns all dresses', () => {
    const rows = dressesService.list(ownerSession);
    assert.ok(rows.length >= 2);
  });

  it('activeOnly filter works', () => {
    const res = dressesService.create(ownerSession, { name: 'To Deactivate', rental_price: 0 });
    dressesService.setActive(ownerSession, res.id, false);
    const active = dressesService.list(ownerSession, { activeOnly: true });
    assert.ok(!active.some(d => d.id === res.id));
  });

  it('deactivate sets active=0', () => {
    const res = dressesService.create(ownerSession, { name: 'Deact Me', rental_price: 0 });
    dressesService.setActive(ownerSession, res.id, false);
    const row = dressesService.get(ownerSession, res.id);
    assert.equal(row.active, 0);
  });

  it('reactivate sets active=1', () => {
    const res = dressesService.create(ownerSession, { name: 'React Me', rental_price: 0 });
    dressesService.setActive(ownerSession, res.id, false);
    dressesService.setActive(ownerSession, res.id, true);
    const row = dressesService.get(ownerSession, res.id);
    assert.equal(row.active, 1);
  });

  it('cashier cannot deactivate (owner only)', () => {
    const res = dressesService.create(ownerSession, { name: 'CashierDe', rental_price: 0 });
    assert.throws(() => dressesService.setActive(cashierSession, res.id, false), /FORBIDDEN|permission/i);
  });

  it('similar-name suggestion works', () => {
    dressesService.create(ownerSession, { name: 'Pink Bridal Lehenga', rental_price: 0 });
    const suggestions = dressesService.suggestSimilar('Pink Lehenga');
    assert.ok(suggestions.some(s => s.name === 'Pink Bridal Lehenga'));
  });

  it('auto-generated code is sequential', () => {
    const first  = dressesService.nextCode();
    dressesService.create(ownerSession, { name: 'Seq Test 1', rental_price: 0 });
    const second = dressesService.nextCode();
    const n1 = parseInt(first.replace('D-', ''), 10);
    const n2 = parseInt(second.replace('D-', ''), 10);
    assert.equal(n2, n1 + 1);
  });

  it('quickAdd creates dress from name only', () => {
    const res = dressesService.quickAdd(cashierSession, 'Quick Sharara');
    assert.ok(res.id);
  });

  it('owner can update rental_price', () => {
    const res = dressesService.create(ownerSession, { name: 'Price Test', rental_price: 1000 });
    dressesService.update(ownerSession, res.id, { name: 'Price Test', rental_price: 2000 });
    const row = dressesService.get(ownerSession, res.id);
    assert.equal(row.rental_price, 2000);
  });

  it('cashier cannot change rental_price', () => {
    const res = dressesService.create(ownerSession, { name: 'PriceLock', rental_price: 5000 });
    assert.throws(
      () => dressesService.update(cashierSession, res.id, { name: 'PriceLock', rental_price: 9000 }),
      /Owner|rental price/i
    );
  });
});
