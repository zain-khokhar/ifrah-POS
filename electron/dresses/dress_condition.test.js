/**
 * electron/dresses/dress_condition.test.js
 *
 * Unit & Integration tests for Dress Condition Workflow, Dynamic Attachments & Dry Clean/Repair Tracking.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { SCHEMA_STATEMENTS } = require('../database/schema');
const { createAuthService } = require('../auth/service');
const { createCustomersService } = require('../customers/service');
const { createDressesService } = require('../dresses/service');
const { createBookingsService } = require('../bookings/service');
const { createTrackingService } = require('../tracking/service');
const { createReportsService } = require('../reports/service');
const { ROLES } = require('../auth/roles');

function createFreshDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  for (const sql of SCHEMA_STATEMENTS) {
    db.exec(sql);
  }

  // Pre-seed users
  db.prepare(`
    INSERT INTO users (id, username, password_hash, full_name, role, is_active)
    VALUES (1, 'owner_admin', 'hash_owner', 'Owner User', 'owner', 1),
           (2, 'cashier_user', 'hash_cashier', 'Cashier User', 'cashier', 1),
           (3, 'viewer_user', 'hash_viewer', 'Viewer User', 'viewer', 1)
  `).run();

  // Pre-seed categories
  db.prepare(`
    INSERT INTO dress_categories (id, name, name_normalized) VALUES
    (1, 'Bridal Maxi', 'bridal maxi'),
    (2, 'Party Wear', 'party wear')
  `).run();

  return db;
}

describe('Dress Condition Workflow & Maintenance Tracking', () => {
  let db;
  let authService;
  let custService;
  let dressService;
  let bookingsService;
  let trackingService;
  let reportsService;

  let ownerSession;
  let cashierSession;
  let viewerSession;

  before(async () => {
    db = createFreshDb();
    authService = createAuthService(db);
    custService = createCustomersService(db);
    dressService = createDressesService(db);
    bookingsService = createBookingsService(db);
    trackingService = createTrackingService(db);
    reportsService = createReportsService(db);

    ownerSession = { active: true, user: { id: 1, username: 'owner_admin', role: ROLES.OWNER } };
    cashierSession = { active: true, user: { id: 2, username: 'cashier_user', role: ROLES.CASHIER } };
    viewerSession = { active: true, user: { id: 3, username: 'viewer_user', role: ROLES.VIEWER } };
  });

  it('1. Creates dress with custom dynamic attachments and condition_status', () => {
    const res = dressService.create(ownerSession, {
      code: 'D-TEST-1',
      name: 'Red Velvet Lehenga',
      category_id: 1,
      rental_price: 15000,
      condition_status: 'fresh',
      attachments: ['Dupatta', 'Crown', 'Belt'],
    });

    assert.ok(res);
    assert.equal(res.code, 'D-TEST-1');

    const retrieved = dressService.get(ownerSession, res.id);
    assert.equal(retrieved.condition_status, 'fresh');
    assert.equal(retrieved.attachments, JSON.stringify(['Dupatta', 'Crown', 'Belt']));
  });

  it('2. Updates dress attachments and condition_status', () => {
    const res = dressService.create(ownerSession, {
      code: 'D-TEST-2',
      name: 'Emerald Green Maxi',
      category_id: 2,
      rental_price: 12000,
      condition_status: 'good',
      attachments: ['Dupatta'],
    });

    dressService.update(cashierSession, res.id, {
      name: 'Emerald Green Maxi (Embroidered)',
      condition_status: 'need_dry_clean',
      attachments: ['Dupatta', 'Clutch', 'Jewellery'],
    });

    const retrieved = dressService.get(ownerSession, res.id);
    assert.equal(retrieved.condition_status, 'need_dry_clean');
    assert.equal(retrieved.attachments, JSON.stringify(['Dupatta', 'Clutch', 'Jewellery']));
  });

  it('3. Filters dresses by conditionStatus', () => {
    const freshList = dressService.list(ownerSession, { conditionStatus: 'fresh' });
    assert.ok(freshList.some(d => d.code === 'D-TEST-1'));
    assert.ok(!freshList.some(d => d.code === 'D-TEST-2'));

    const cleanList = dressService.list(ownerSession, { conditionStatus: 'need_dry_clean' });
    assert.ok(cleanList.some(d => d.code === 'D-TEST-2'));
    assert.ok(!cleanList.some(d => d.code === 'D-TEST-1'));
  });

  it('4. Booking return flow auto-syncs dress condition and logs maintenance record', () => {
    // Create customer & booking with D-TEST-1
    const customer = custService.create(cashierSession, {
      name: 'Fatima Zahra',
      phone: '0311-5551234',
    });

    const d1 = dressService.list(ownerSession, { search: 'D-TEST-1' })[0];

    const today = new Date().toISOString().slice(0, 10);
    const booking = bookingsService.create(cashierSession, {
      customer_id: customer.id,
      delivery_date: today,
      returning_date: today,
      items: [
        { dress_id: d1.id, rate: 15000, quantity: 1, size: 'M' }
      ],
      amount_paid: 15000,
    });

    // Mark delivered first
    trackingService.markDelivered(cashierSession, {
      bookingId: booking.id,
      deliveredOn: today,
    });

    // Mark returned with Need Dry Clean
    trackingService.markReturned(cashierSession, {
      bookingId: booking.id,
      returnedOn: today,
      returnCondition: 'Need Dry Clean',
      returnDamageNote: 'Stain on bottom flare',
    });

    // Check dress condition in dresses table
    const dressAfterReturn = dressService.get(ownerSession, d1.id);
    assert.equal(dressAfterReturn.condition_status, 'need_dry_clean');

    // Check maintenance list
    const maintList = dressService.listMaintenance(cashierSession, {});
    const entry = maintList.find(m => m.dress_id === d1.id);
    assert.ok(entry, 'Dress must appear in maintenance list');
    assert.equal(entry.status, 'need_dry_clean');
    assert.equal(entry.notes, 'Stain on bottom flare');
    assert.equal(entry.customer_name, 'Fatima Zahra');
    assert.equal(entry.booking_no, booking.booking_no);
  });

  it('5. Mark Ready restores dress condition and marks maintenance log complete', () => {
    const d1 = dressService.list(ownerSession, { search: 'D-TEST-1' })[0];
    assert.equal(d1.condition_status, 'need_dry_clean');

    // Mark Ready
    const updated = dressService.updateCondition(cashierSession, d1.id, 'good', 'Cleaned and pressed by laundry');
    assert.ok(updated);
    assert.equal(updated.condition_status, 'good');

    // Check that it leaves listMaintenance
    const maintList = dressService.listMaintenance(cashierSession, {});
    const entry = maintList.find(m => m.dress_id === d1.id);
    assert.equal(entry, undefined, 'Dress must leave maintenance list once marked good');

    // Check database maintenance log completed_at
    const log = db.prepare('SELECT * FROM dress_maintenance_logs WHERE dress_id = ? ORDER BY id DESC LIMIT 1').get(d1.id);
    assert.ok(log);
    assert.ok(log.completed_at, 'Maintenance log must have completed_at timestamp');
    assert.equal(log.completed_by, cashierSession.user.id);
  });

  it('6. Viewer cannot update condition (RBAC check)', () => {
    const d1 = dressService.list(ownerSession, { search: 'D-TEST-1' })[0];
    assert.throws(() => {
      dressService.updateCondition(viewerSession, d1.id, 'need_repair', 'Torn sleeve');
    }, /permission|denied|unauthorized/i);
  });
});
