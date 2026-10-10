/**
 * electron/phase4/phase4.test.js
 *
 * Phase 4 unit tests — booking business rules:
 *  - booking_no auto-increment (starts at 412 on empty table)
 *  - detail_no = booking_no * 100 + line_no
 *  - line_total = qty * rate
 *  - grand_total = sum(line_totals) - discount
 *  - month derived from booking_date
 *  - total_returning_days = |returning - delivery|
 *  - remaining recalc after payments
 *  - Max 99 lines
 *  - Soft delete cascades
 *  - Cashier cannot delete, Viewer cannot create
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { SCHEMA_STATEMENTS }      = require('../database/schema');
const { createBookingsService }  = require('../bookings/service');
const { createCustomersService } = require('../customers/service');

// ─── Shared test helpers ─────────────────────────────────────────────────────
function makeDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const stmt of SCHEMA_STATEMENTS) db.exec(stmt);
  return db;
}

function addUser(db, role) {
  const r = db.prepare(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES (?,?,?,?)`
  ).run(`${role}_user_${Date.now()}`, 'x', role, role);
  return { active: true, user: { id: r.lastInsertRowid, username: role, name: role, role } };
}

function addCustomer(db, ownerSession) {
  const svc = createCustomersService(db);
  return svc.create(ownerSession, { name: 'Test Customer', phone: '03001234567' });
}

// ─── Computation helpers (pure, no DB needed) ─────────────────────────────────
describe('booking computation helpers', () => {
  let svc, db;
  before(() => {
    db = makeDb();
    const owner = addUser(db, 'owner');
    svc = createBookingsService(db);
  });
  after(() => db.close());

  it('computeMonth extracts YYYY-MM', () => {
    assert.equal(svc.computeMonth('2026-10-15'), '2026-10');
  });

  it('computeMonth returns null for empty date', () => {
    assert.equal(svc.computeMonth(null), null);
    assert.equal(svc.computeMonth(''), null);
  });

  it('computeReturningDays calculates absolute days', () => {
    assert.equal(svc.computeReturningDays('2026-10-10', '2026-10-13'), 3);
    // reversed order → still positive
    assert.equal(svc.computeReturningDays('2026-10-13', '2026-10-10'), 3);
  });

  it('computeReturningDays returns null if either date is missing', () => {
    assert.equal(svc.computeReturningDays(null, '2026-10-13'), null);
    assert.equal(svc.computeReturningDays('2026-10-10', null), null);
  });

  it('computeLineTotals sums qty*rate', () => {
    const items = [
      { quantity: 2, rate: 5000 },
      { quantity: 1, rate: 3000 },
    ];
    assert.equal(svc.computeLineTotals(items), 13000);
  });

  it('computeGrandTotal subtracts discount', () => {
    const items = [{ quantity: 1, rate: 10000 }];
    assert.equal(svc.computeGrandTotal(items, 1000), 9000);
  });

  it('computeGrandTotal never goes below 0', () => {
    const items = [{ quantity: 1, rate: 5000 }];
    assert.equal(svc.computeGrandTotal(items, 99999), 0);
  });

  it('computeGrandTotal with no discount', () => {
    const items = [{ quantity: 3, rate: 4000 }];
    assert.equal(svc.computeGrandTotal(items), 12000);
  });
});

// ─── Booking number rules ─────────────────────────────────────────────────────
describe('booking_no and detail_no rules', () => {
  let db, owner, svc, customerId;
  before(() => {
    db = makeDb();
    owner = addUser(db, 'owner');
    svc = createBookingsService(db);
    const c = addCustomer(db, owner);
    customerId = c.id;
  });
  after(() => db.close());

  it('first booking_no on empty table = 412', () => {
    assert.equal(svc.nextBookingNo(), 412);
  });

  it('creates booking with sequential number', () => {
    const r = svc.create(owner, {
      customer_id: customerId,
      items: [{ dress_name_snapshot: 'Red Lehenga', quantity: 1, rate: 10000 }],
    });
    assert.equal(r.booking_no, 412);
  });

  it('second booking gets 413', () => {
    assert.equal(svc.nextBookingNo(), 413);
  });

  it('detail_no = booking_no * 100 + line_no', () => {
    const r = svc.create(owner, {
      customer_id: customerId,
      items: [
        { dress_name_snapshot: 'Dress A', quantity: 1, rate: 5000 },
        { dress_name_snapshot: 'Dress B', quantity: 2, rate: 3000 },
      ],
    });
    const booking = svc.get(owner, r.id);
    const line1 = booking.items.find(i => i.line_no === 1);
    const line2 = booking.items.find(i => i.line_no === 2);
    assert.equal(line1.detail_no, 413 * 100 + 1);  // 41301
    assert.equal(line2.detail_no, 413 * 100 + 2);  // 41302
  });

  it('rejects more than 99 lines', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      dress_name_snapshot: `Dress ${i}`, quantity: 1, rate: 0,
    }));
    assert.throws(
      () => svc.create(owner, { customer_id: customerId, items }),
      /Maximum 99/i
    );
  });
});

// ─── Totals ───────────────────────────────────────────────────────────────────
describe('booking totals stored correctly', () => {
  let db, owner, svc, customerId;
  before(() => {
    db = makeDb();
    owner = addUser(db, 'owner');
    svc = createBookingsService(db);
    const c = addCustomer(db, owner);
    customerId = c.id;
  });
  after(() => db.close());

  it('grand_total = sum of line totals', () => {
    const r = svc.create(owner, {
      customer_id: customerId,
      items: [
        { dress_name_snapshot: 'A', quantity: 2, rate: 5000 },
        { dress_name_snapshot: 'B', quantity: 1, rate: 8000 },
      ],
    });
    const b = svc.get(owner, r.id);
    // line totals: 10000 + 8000 = 18000
    assert.equal(b.grand_total, 18000);
  });

  it('grand_total includes discount deduction', () => {
    const r = svc.create(owner, {
      customer_id: customerId,
      items: [{ dress_name_snapshot: 'C', quantity: 1, rate: 20000 }],
      discount: 2000,
    });
    const b = svc.get(owner, r.id);
    assert.equal(b.grand_total, 18000);
    assert.equal(b.discount, 2000);
  });

  it('remaining = grand_total before any payment', () => {
    const r = svc.create(owner, {
      customer_id: customerId,
      items: [{ dress_name_snapshot: 'D', quantity: 1, rate: 15000 }],
    });
    const b = svc.get(owner, r.id);
    assert.equal(b.remaining, b.grand_total);
  });

  it('booking_month derived from booking_date', () => {
    const r = svc.create(owner, {
      customer_id: customerId,
      booking_date: '2026-10-15',
      items: [{ dress_name_snapshot: 'E', quantity: 1, rate: 0 }],
    });
    const b = svc.get(owner, r.id);
    assert.equal(b.booking_month, '2026-10');
  });

  it('total_returning_days is computed', () => {
    const r = svc.create(owner, {
      customer_id: customerId,
      delivery_date: '2026-10-10',
      returning_date: '2026-10-14',
      items: [{ dress_name_snapshot: 'F', quantity: 1, rate: 0 }],
    });
    const b = svc.get(owner, r.id);
    assert.equal(b.total_returning_days, 4);
  });

  it('recalcTotals updates remaining after manual payment insert', () => {
    const r = svc.create(owner, {
      customer_id: customerId,
      items: [{ dress_name_snapshot: 'G', quantity: 1, rate: 10000 }],
    });
    // Manually insert a payment
    db.prepare(
      `INSERT INTO payments (booking_id, amount, kind, paid_on)
       VALUES (?, 4000, 'rental', '2026-10-10')`
    ).run(r.id);
    svc.recalcTotals(r.id);
    const b = svc.get(owner, r.id);
    assert.equal(b.amount_paid, 4000);
    assert.equal(b.remaining, 6000);
  });
});

// ─── Permissions ─────────────────────────────────────────────────────────────
describe('booking permissions', () => {
  let db, owner, cashier, viewer, svc, customerId, bookingId;
  before(() => {
    db = makeDb();
    owner   = addUser(db, 'owner');
    cashier = addUser(db, 'cashier');
    viewer  = addUser(db, 'viewer');
    svc = createBookingsService(db);
    const c = addCustomer(db, owner);
    customerId = c.id;
    const r = svc.create(owner, {
      customer_id: customerId,
      items: [{ dress_name_snapshot: 'Test', quantity: 1, rate: 5000 }],
    });
    bookingId = r.id;
  });
  after(() => db.close());

  it('viewer can list bookings', () => {
    const rows = svc.list(viewer);
    assert.ok(rows.length >= 1);
  });

  it('cashier can create a booking', () => {
    const r = svc.create(cashier, {
      customer_id: customerId,
      items: [{ dress_name_snapshot: 'Cashier Dress', quantity: 1, rate: 3000 }],
    });
    assert.ok(r.id);
  });

  it('viewer cannot create', () => {
    assert.throws(
      () => svc.create(viewer, { customer_id: customerId, items: [] }),
      /FORBIDDEN|permission/i
    );
  });

  it('cashier cannot delete', () => {
    assert.throws(() => svc.softDelete(cashier, bookingId), /FORBIDDEN|permission/i);
  });

  it('owner can soft-delete', () => {
    const r = svc.create(owner, {
      customer_id: customerId,
      items: [{ dress_name_snapshot: 'Delete Me', quantity: 1, rate: 0 }],
    });
    const res = svc.softDelete(owner, r.id);
    assert.equal(res.ok, true);
    assert.equal(svc.get(owner, r.id), null);
  });
});

// ─── Update ───────────────────────────────────────────────────────────────────
describe('booking update', () => {
  let db, owner, svc, customerId, bookingId;
  before(() => {
    db = makeDb();
    owner = addUser(db, 'owner');
    svc = createBookingsService(db);
    const c = addCustomer(db, owner);
    customerId = c.id;
    const r = svc.create(owner, {
      customer_id: customerId,
      items: [{ dress_name_snapshot: 'Original', quantity: 1, rate: 10000 }],
    });
    bookingId = r.id;
  });
  after(() => db.close());

  it('update replaces items and recalculates grand_total', () => {
    svc.update(owner, bookingId, {
      customer_id: customerId,
      items: [
        { dress_name_snapshot: 'Updated A', quantity: 1, rate: 6000 },
        { dress_name_snapshot: 'Updated B', quantity: 2, rate: 4000 },
      ],
    });
    const b = svc.get(owner, bookingId);
    assert.equal(b.grand_total, 14000);
    assert.equal(b.items.length, 2);
  });

  it('old items are soft-deleted on update', () => {
    const deleted = db.prepare(
      `SELECT COUNT(*) AS n FROM booking_items
       WHERE booking_id = ? AND deleted_at IS NOT NULL`
    ).get(bookingId);
    assert.ok(deleted.n >= 1);
  });

  it('todaySummary returns numeric counts', () => {
    const s = svc.todaySummary();
    assert.equal(typeof s.deliveries, 'number');
    assert.equal(typeof s.returns,    'number');
    assert.equal(typeof s.overdue,    'number');
    assert.equal(typeof s.pending,    'number');
  });
});
