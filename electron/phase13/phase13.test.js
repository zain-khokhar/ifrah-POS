/**
 * electron/phase13/phase13.test.js
 *
 * Comprehensive Scenario Test Suite for Phase 13 — Supabase Cloud & Offline Sync.
 *
 * Scenarios tested:
 * 1. Outbox atomic queueing on writes
 * 2. Push outbox to cloud with parent-before-child ordering & idempotency
 * 3. Pull from cloud with Last-Write-Wins header merging
 * 4. Multi-PC independent number blocks (PC-1: 412+, PC-2: 5000+)
 * 5. Concurrent offline child item & payment merging + total recalculation
 * 6. Offline overlapping dress booking clash detection ('Needs a look')
 * 7. Clash resolution flow
 * 8. Offline resilience when cloud is unreachable (zero unhandled exceptions)
 * 9. Friendly state badges and stats (zero technical jargon)
 * 10. Role-guarded device configuration (Owner only)
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { SCHEMA_STATEMENTS } = require('../database/schema');
const { createSyncService } = require('../sync/service');
const { createBookingsService } = require('../bookings/service');
const { createCustomersService } = require('../customers/service');
const { createDressesService } = require('../dresses/service');
const { createPaymentsService } = require('../payments/service');
const { enqueueOutbox, getPendingOutbox, getOutboxStats } = require('../sync/outbox');

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const s of SCHEMA_STATEMENTS) {
    db.exec(s);
  }

  // Seed default admin owner & cashier
  db.prepare(`
    INSERT INTO users (id, username, password_hash, full_name, role)
    VALUES (1, 'owner', 'hash1', 'Owner Admin', 'owner'),
           (2, 'cashier', 'hash2', 'Cashier Staff', 'cashier'),
           (3, 'viewer', 'hash3', 'Viewer Staff', 'viewer')
  `).run();

  // Seed initial sync_state
  db.prepare(`
    INSERT INTO sync_state (key, value) VALUES
    ('device_id', 'pc_test_1'),
    ('device_name', 'Counter 1'),
    ('booking_number_start', '412'),
    ('sync_status', 'idle'),
    ('shop_id', 'ifrah-pos-test')
  `).run();

  return db;
}

// In-Memory Cloud Store simulating Supabase Cloud
function createMockCloudStore() {
  const tables = {
    customers: new Map(),
    dresses: new Map(),
    bookings: new Map(),
    booking_items: new Map(),
    payments: new Map(),
    settings: new Map(),
  };

  return {
    tables,
    async upsert(tableName, rows) {
      if (!tables[tableName]) tables[tableName] = new Map();
      const stored = [];
      for (const row of rows) {
        const key = row.sync_id || row.key;
        const record = {
          ...row,
          server_updated_at: new Date().toISOString(),
        };
        tables[tableName].set(key, record);
        stored.push(record);
      }
      return stored;
    },

    async pull(tableName, { cursor }) {
      if (!tables[tableName]) return [];
      const list = Array.from(tables[tableName].values());
      if (!cursor) return list;
      return list.filter(r => r.server_updated_at > cursor);
    },
  };
}

describe('Phase 13 — Supabase Cloud & Offline Sync', () => {
  let db;
  let mockCloud;
  let syncService;
  let ownerSession;
  let cashierSession;
  let viewerSession;

  beforeEach(() => {
    db = createTestDb();
    mockCloud = createMockCloudStore();
    syncService = createSyncService(db, { apiClient: mockCloud });

    ownerSession   = { active: true, user: { id: 1, role: 'owner', username: 'owner' } };
    cashierSession = { active: true, user: { id: 2, role: 'cashier', username: 'cashier' } };
    viewerSession  = { active: true, user: { id: 3, role: 'viewer', username: 'viewer' } };
  });

  it('1. Outbox: writes inside transactions automatically enqueue into sync_outbox', () => {
    const custService = createCustomersService(db);
    const customer = custService.create(ownerSession, {
      name: 'Ayesha Khan',
      phone: '03001234567',
      address: 'Gulberg Lahore',
    });

    assert.ok(customer?.id, 'Customer created');

    const pending = getPendingOutbox(db);
    assert.ok(pending.length >= 1, 'Pending outbox row exists');
    const outboxItem = pending.find(p => p.table_name === 'customers');
    assert.ok(outboxItem, 'Customer entry in outbox');
    assert.equal(outboxItem.status, 'pending');

    const payload = JSON.parse(outboxItem.payload);
    assert.equal(payload.name, 'Ayesha Khan');
    assert.equal(payload.phone, '03001234567');
  });

  it('2. Push: batches pending outbox rows to cloud and marks them synced', async () => {
    const custService = createCustomersService(db);
    custService.create(ownerSession, {
      name: 'Fatima Zahra',
      phone: '03219876543',
    });

    const statsBefore = getOutboxStats(db);
    assert.ok(statsBefore.pending >= 1, 'Has pending outbox items before push');

    const pushRes = await syncService.pushOutbox();
    assert.ok(pushRes.pushed >= 1, 'Pushed items count > 0');
    assert.equal(pushRes.errors, 0, 'Zero push errors');

    const statsAfter = getOutboxStats(db);
    assert.equal(statsAfter.pending, 0, 'No more pending outbox items');
    assert.ok(statsAfter.synced >= 1, 'Synced items count incremented');

    // Cloud should now hold the customer
    assert.ok(mockCloud.tables.customers.size >= 1, 'Cloud has customer stored');
  });

  it('3. Idempotency: pushing the same outbox item or batch twice does not cause errors or duplicates', async () => {
    const custService = createCustomersService(db);
    const customer = custService.create(ownerSession, {
      name: 'Mariam Bibi',
      phone: '03335555555',
    });

    await syncService.pushOutbox();
    const countFirst = mockCloud.tables.customers.size;

    // Simulate re-enqueuing or pushing duplicate
    enqueueOutbox(db, 'customers', 'INSERT', customer.sync_id, customer);
    await syncService.pushOutbox();

    assert.equal(mockCloud.tables.customers.size, countFirst, 'Cloud size remains exact same (upsert on sync_id)');
  });

  it('4. Multi-PC: independent number blocks (PC-1: 412+, PC-2: 5000+)', () => {
    const bookingsService = createBookingsService(db);
    const custService = createCustomersService(db);
    const customer = custService.create(ownerSession, { name: 'Zainab', phone: '03112223334' });

    // PC-1 default starts at 412
    const b1 = bookingsService.create(ownerSession, {
      customer_id: customer.id,
      booking_date: '2026-10-15',
      delivery_date: '2026-10-20',
      returning_date: '2026-10-22',
      items: [{ dress_name: 'Bridal Red', rate: 25000, quantity: 1 }],
    });
    assert.equal(b1.booking_no, 412, 'PC-1 creates booking #412');

    // Now configure this PC as Counter 2 with block starting at 5000
    syncService.setDeviceConfig(ownerSession, {
      deviceName: 'Counter 2',
      bookingNumberStart: 5000,
    });

    const b2 = bookingsService.create(ownerSession, {
      customer_id: customer.id,
      booking_date: '2026-10-15',
      delivery_date: '2026-10-25',
      returning_date: '2026-10-27',
      items: [{ dress_name: 'Walima Gold', rate: 30000, quantity: 1 }],
    });
    assert.equal(b2.booking_no, 5000, 'PC-2 creates booking #5000 cleanly');

    const b3 = bookingsService.create(ownerSession, {
      customer_id: customer.id,
      booking_date: '2026-10-15',
      delivery_date: '2026-10-28',
      returning_date: '2026-10-30',
      items: [{ dress_name: 'Mehndi Green', rate: 15000, quantity: 1 }],
    });
    assert.equal(b3.booking_no, 5001, 'PC-2 creates next booking #5001');
  });

  it('5. Pull & Last-Write-Wins: updates local customer when cloud is newer', async () => {
    const custService = createCustomersService(db);
    const createdCust = custService.create(ownerSession, {
      name: 'Sana Tariq',
      phone: '03001112233',
      address: 'Old Address',
    });
    const localCust = custService.get(ownerSession, createdCust.id);

    // Cloud has newer address updated on another PC
    mockCloud.tables.customers.set(localCust.sync_id, {
      sync_id: localCust.sync_id,
      name: 'Sana Tariq',
      phone: '03001112233',
      address: 'New Model Town Address',
      updated_at: '2026-12-01T12:00:00Z',
      server_updated_at: '2026-12-01T12:00:00Z',
    });

    const pullRes = await syncService.pullFromCloud();
    assert.ok(pullRes.pulled >= 1, 'Pulled updated record');

    const updatedLocal = custService.get(ownerSession, localCust.id);
    assert.equal(updatedLocal.address, 'New Model Town Address', 'Local customer updated via Last-Write-Wins');
  });

  it('6. Concurrent offline child item & payment merging recalculates booking totals', async () => {
    const bookingsService = createBookingsService(db);
    const custService = createCustomersService(db);
    const customer = custService.create(ownerSession, { name: 'Hira Mani', phone: '03456789012' });

    const created = bookingsService.create(ownerSession, {
      customer_id: customer.id,
      booking_date: '2026-10-12',
      delivery_date: '2026-10-18',
      returning_date: '2026-10-20',
      items: [{ dress_name: 'Dress Line 1', rate: 10000, quantity: 1 }],
    });

    const booking = bookingsService.get(ownerSession, created.id);
    assert.equal(booking.grand_total, 10000);
    assert.equal(booking.remaining, 10000);

    // Another PC added another line item and a payment in the cloud
    const cloudItemSyncId = 'item_remote_99';
    mockCloud.tables.booking_items.set(cloudItemSyncId, {
      sync_id: cloudItemSyncId,
      booking_id: booking.id,
      booking_sync_id: booking.sync_id,
      line_no: 2,
      detail_no: booking.booking_no * 100 + 2,
      dress_id: null,
      dress_name_snapshot: 'Dress Line 2 (Added on PC-2)',
      rate: 15000,
      quantity: 1,
      line_total: 15000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      server_updated_at: new Date().toISOString(),
    });

    const cloudPaymentSyncId = 'pay_remote_88';
    mockCloud.tables.payments.set(cloudPaymentSyncId, {
      sync_id: cloudPaymentSyncId,
      booking_id: booking.id,
      booking_sync_id: booking.sync_id,
      amount: 8000,
      payment_method: 'cash',
      kind: 'rental',
      paid_on: '2026-10-13',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      server_updated_at: new Date().toISOString(),
    });

    // Pull from cloud
    await syncService.pullFromCloud();

    const mergedBooking = bookingsService.get(ownerSession, booking.id);
    assert.equal(mergedBooking.items.length, 2, 'Has 2 lines merged');
    assert.equal(mergedBooking.payments.length, 1, 'Has 1 merged payment');
    assert.equal(mergedBooking.grand_total, 25000, 'Grand total recalculated: 10000 + 15000 = 25000');
    assert.equal(mergedBooking.amount_paid, 8000, 'Amount paid: 8000');
    assert.equal(mergedBooking.remaining, 17000, 'Remaining recalculated: 25000 - 8000 = 17000');
  });

  it('7. Offline clash detection flags overlapping bookings with Needs a look', async () => {
    const dressesService = createDressesService(db);
    const custService = createCustomersService(db);
    const bookingsService = createBookingsService(db);

    const dress = dressesService.create(ownerSession, {
      name: 'Emerald Green Velvet',
      default_rate: 20000,
    });
    const customer = custService.create(ownerSession, { name: 'Customer A', phone: '03009998877' });

    // Local booking on Counter 1 for dates 2026-11-10 to 2026-11-15
    const b1 = bookingsService.create(ownerSession, {
      customer_id: customer.id,
      booking_date: '2026-10-12',
      delivery_date: '2026-11-10',
      returning_date: '2026-11-15',
      items: [{ dress_id: dress.id, dress_name: dress.name, rate: 20000, quantity: 1 }],
    });

    // Counter 2 offline booked the SAME dress for overlapping dates (2026-11-12 to 2026-11-17)
    const remoteBookingSyncId = 'remote_clash_booking';
    mockCloud.tables.bookings.set(remoteBookingSyncId, {
      sync_id: remoteBookingSyncId,
      booking_no: 5001,
      customer_id: customer.id,
      status: 'Open',
      delivery_date: '2026-11-12',
      returning_date: '2026-11-17',
      security_deposit: 0,
      discount: 0,
      grand_total: 20000,
      amount_paid: 5000,
      remaining: 15000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      server_updated_at: new Date().toISOString(),
    });

    mockCloud.tables.booking_items.set('remote_clash_item', {
      sync_id: 'remote_clash_item',
      booking_sync_id: remoteBookingSyncId,
      line_no: 1,
      detail_no: 500101,
      dress_id: dress.id,
      dress_name_snapshot: dress.name,
      rate: 20000,
      quantity: 1,
      line_total: 20000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      server_updated_at: new Date().toISOString(),
    });

    // Run pull and clash detection
    const pullRes = await syncService.pullFromCloud();
    assert.ok(pullRes.clashes >= 1, 'Clash detected');

    // Check status of both bookings
    const localB1 = bookingsService.get(ownerSession, b1.id);
    assert.equal(localB1.clash_flag, 1, 'Local booking marked with clash_flag = 1');
    assert.ok(localB1.clash_note.includes('clash'), 'Has informative clash note');

    const status = syncService.getStatus();
    assert.equal(status.clashCount, 2, 'Status reports 2 clashing bookings');
    assert.ok(status.badge.includes('Needs a look'), 'Badge shows Needs a look');
  });

  it('8. Clash resolution: resolveClash clears clash_flag and restores normal badge', () => {
    const custService = createCustomersService(db);
    const bookingsService = createBookingsService(db);
    const customer = custService.create(ownerSession, { name: 'Customer Test', phone: '03001239999' });
    const b = bookingsService.create(ownerSession, {
      customer_id: customer.id,
      booking_date: '2026-10-12',
      delivery_date: '2026-10-20',
      returning_date: '2026-10-22',
      items: [{ dress_name: 'Dress Test', rate: 5000, quantity: 1 }],
    });

    // Flag booking as clashing
    db.prepare(`UPDATE bookings SET clash_flag = 1, clash_note = 'Overlapping dress test' WHERE id = ?`).run(b.id);

    let status = syncService.getStatus();
    assert.ok(status.badge.includes('Needs a look'));

    const res = syncService.resolveClash(ownerSession, b.id);
    assert.ok(res.ok);

    status = syncService.getStatus();
    assert.equal(status.clashCount, 0);
    assert.ok(!status.badge.includes('Needs a look'));
  });

  it('9. Offline resilience: handles network failure gracefully without throwing', async () => {
    // Service configured with broken transport throwing network error
    const failingService = createSyncService(db, {
      apiClient: {
        async upsert() { throw new Error('getaddrinfo ENOTFOUND mock.supabase.co'); },
        async pull() { throw new Error('fetch failed: Connection refused'); },
      },
    });

    // Enqueue an outbox row
    enqueueOutbox(db, 'settings', 'UPDATE', 'shop_name', { value: 'New Name' });

    // syncNow should not throw
    const res = await failingService.syncNow();
    assert.equal(res.ok, false);
    assert.equal(res.status, 'offline');
    assert.ok(res.stats.pending >= 1);

    const status = failingService.getStatus();
    assert.ok(status.badge.includes('Offline'));
    assert.ok(status.badge.includes('waiting'));
  });

  it('10. Role-guarded device configuration: Owner can configure; Cashier/Viewer forbidden', () => {
    assert.throws(() => {
      syncService.setDeviceConfig(cashierSession, { deviceName: 'Counter 9' });
    }, /permission|denied|owner/i);

    assert.throws(() => {
      syncService.setDeviceConfig(viewerSession, { deviceName: 'Counter 9' });
    }, /permission|denied|owner/i);

    const res = syncService.setDeviceConfig(ownerSession, {
      deviceName: 'Counter 3',
      bookingNumberStart: 7000,
    });
    assert.ok(res.ok);
    assert.equal(res.status.deviceName, 'Counter 3');
    assert.equal(res.status.bookingNumberStart, 7000);
  });
});
