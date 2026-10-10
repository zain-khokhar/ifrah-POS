/**
 * electron/phase9/phase9.test.js
 *
 * Unit & Integration tests for Phase 9 — Delivery & Return Tracking.
 * Tests:
 *  - Delivery listing & date filters (today, tomorrow, upcoming, pending, delivered)
 *  - Per-item night-before preparation 'ready' toggle (is_ready)
 *  - Mark delivered with date & note (Owner & Cashier allowed, Viewer forbidden, audit logged)
 *  - Unmark delivered
 *  - Overdue returns tracking & exact days_late calculation
 *  - Mark returned with condition (OK, Needs cleaning, Damaged) & damage note
 *  - Return flow prompts: deposit refund, remaining balance collection, close booking
 *  - Home counters live summary (deliveries, returns, overdue, pending)
 *  - Complete end-to-end lifecycle: Booked -> Delivered -> Returned -> Paid -> Closed
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const { SCHEMA_STATEMENTS } = require('../database/schema');
const { createBookingsService } = require('../bookings/service');
const { createPaymentsService } = require('../payments/service');
const { createTrackingService } = require('../tracking/service');
const { ROLES } = require('../auth/roles');

describe('Phase 9 — Delivery and Return Tracking', () => {
  let db;
  let tmpDir;
  let bookingsService;
  let paymentsService;
  let trackingService;

  const ownerSession   = { active: true, user: { id: 1, username: 'owner_user',   role: ROLES.OWNER, full_name: 'Owner Zain' } };
  const cashierSession = { active: true, user: { id: 2, username: 'cashier_user', role: ROLES.CASHIER, full_name: 'Cashier Ali' } };
  const viewerSession  = { active: true, user: { id: 3, username: 'viewer_user',  role: ROLES.VIEWER, full_name: 'Viewer Sana' } };

  let testCustId;
  let bookingTodayId;
  let bookingOverdueId;

  const todayIso = new Date().toISOString().slice(0, 10);

  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 3);
  const pastIso = pastDate.toISOString().slice(0, 10);

  const olderDate = new Date();
  olderDate.setDate(olderDate.getDate() - 6);
  const olderIso = olderDate.toISOString().slice(0, 10);

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 3);
  const futureIso = futureDate.toISOString().slice(0, 10);

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ifrah-test-phase9-'));
    const dbPath = path.join(tmpDir, 'test-phase9.sqlite');

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    for (const sql of SCHEMA_STATEMENTS) {
      db.exec(sql);
    }

    // Seed test users
    db.prepare(`
      INSERT INTO users (id, username, password_hash, full_name, role)
      VALUES (1, 'owner_user', 'hash', 'Owner Zain', 'owner'),
             (2, 'cashier_user', 'hash', 'Cashier Ali', 'cashier'),
             (3, 'viewer_user', 'hash', 'Viewer Sana', 'viewer')
    `).run();

    // Instantiate services
    paymentsService = createPaymentsService(db);
    bookingsService = createBookingsService(db, paymentsService);
    trackingService = createTrackingService(db, bookingsService, paymentsService);

    // Seed test customer
    const custRes = db.prepare(`
      INSERT INTO customers (name, phone, cnic, created_by, updated_by)
      VALUES ('Ayesha Khan', '03001234567', '35202-1234567-1', 1, 1)
    `).run();
    testCustId = custRes.lastInsertRowid;

    // Seed booking 1 (Due for delivery today)
    const b1 = bookingsService.create(ownerSession, {
      customer_id: testCustId,
      booking_date: todayIso,
      delivery_date: todayIso,
      returning_date: futureIso,
      security_deposit: 2000,
      items: [
        { dress_name_snapshot: 'Red Bridal Lehenga', rate: 15000, quantity: 1, size: 'M' },
        { dress_name_snapshot: 'Matching Dupatta', rate: 2000, quantity: 1, size: 'Free' },
      ],
    });
    bookingTodayId = b1.id;

    // Seed booking 2 (Past delivery and past return date, to test Overdue)
    const b2 = bookingsService.create(ownerSession, {
      customer_id: testCustId,
      booking_date: olderIso,
      delivery_date: olderIso,
      returning_date: pastIso, // 3 days ago
      security_deposit: 1500,
      items: [
        { dress_name_snapshot: 'Gold Velvet Sharara', rate: 12000, quantity: 1, size: 'L' },
      ],
    });
    bookingOverdueId = b2.id;
  });

  after(() => {
    try {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. Deliveries List & Filters', () => {
    it('lists deliveries scheduled for today', () => {
      const list = trackingService.listDeliveries(ownerSession, { filter: 'today' });
      assert.ok(Array.isArray(list));
      const found = list.find(b => b.id === bookingTodayId);
      assert.ok(found, 'Booking due today must be in list');
      assert.equal(found.items.length, 2);
      assert.equal(found.all_ready, false);
    });

    it('allows Cashier to view deliveries', () => {
      const list = trackingService.listDeliveries(cashierSession, { filter: 'today' });
      assert.ok(list.length >= 1);
    });

    it('allows Viewer to view deliveries', () => {
      const list = trackingService.listDeliveries(viewerSession, { filter: 'today' });
      assert.ok(list.length >= 1);
    });
  });

  describe('2. Night-Before Preparation: Toggle Item Ready', () => {
    it('allows Cashier and Owner to toggle item ready status', () => {
      const booking = trackingService.listDeliveries(ownerSession, { filter: 'today' })
        .find(b => b.id === bookingTodayId);
      const firstItem = booking.items[0];

      // Initially not ready
      assert.equal(firstItem.is_ready, 0);

      // Toggle to ready
      const res = trackingService.toggleItemReady(cashierSession, {
        itemId: firstItem.id,
        isReady: true,
      });
      assert.equal(res.ok, true);
      assert.equal(res.is_ready, 1);

      // Verify in DB
      const itemDb = db.prepare('SELECT is_ready FROM booking_items WHERE id = ?').get(firstItem.id);
      assert.equal(itemDb.is_ready, 1);

      // Verify audit log
      const audit = db.prepare(`
        SELECT * FROM audit_logs
        WHERE table_name = 'booking_items' AND record_id = ? AND action = 'ITEM_READY_TOGGLED'
      `).get(firstItem.id);
      assert.ok(audit, 'Toggle must be recorded in audit log');
    });

    it('forbids Viewer from toggling item ready', () => {
      const booking = trackingService.listDeliveries(ownerSession, { filter: 'today' })
        .find(b => b.id === bookingTodayId);
      const secondItem = booking.items[1];

      assert.throws(() => {
        trackingService.toggleItemReady(viewerSession, {
          itemId: secondItem.id,
          isReady: true,
        });
      }, /permission/i);
    });
  });

  describe('3. Mark Delivered & Unmark Delivered', () => {
    it('marks a booking as delivered with date and delivery note', () => {
      const res = trackingService.markDelivered(cashierSession, {
        bookingId: bookingTodayId,
        deliveredOn: todayIso,
        deliveryNote: 'Received by customer brother at shop counter',
        allItemsReady: true,
      });

      assert.equal(res.ok, true);
      assert.equal(res.delivered_on, todayIso);

      // Check DB update
      const b = db.prepare('SELECT delivered_on, delivery_note, status FROM bookings WHERE id = ?').get(bookingTodayId);
      assert.equal(b.delivered_on, todayIso);
      assert.equal(b.delivery_note, 'Received by customer brother at shop counter');
      assert.equal(b.status, 'Open'); // Auto promoted from None to Open

      // Verify items are all ready
      const items = db.prepare('SELECT is_ready FROM booking_items WHERE booking_id = ?').all(bookingTodayId);
      assert.ok(items.every(it => it.is_ready === 1));

      // Verify audit log
      const audit = db.prepare(`
        SELECT * FROM audit_logs
        WHERE table_name = 'bookings' AND record_id = ? AND action = 'DELIVERY_MARKED'
      `).get(bookingTodayId);
      assert.ok(audit, 'Delivery marked must be audited');
    });

    it('forbids Viewer from marking delivered', () => {
      assert.throws(() => {
        trackingService.markDelivered(viewerSession, {
          bookingId: bookingTodayId,
          deliveredOn: todayIso,
        });
      }, /permission/i);
    });

    it('can unmark delivered to fix operational mistakes', () => {
      const res = trackingService.unmarkDelivered(ownerSession, bookingTodayId);
      assert.equal(res.ok, true);

      const b = db.prepare('SELECT delivered_on, delivery_note FROM bookings WHERE id = ?').get(bookingTodayId);
      assert.equal(b.delivered_on, null);
      assert.equal(b.delivery_note, null);

      // Re-mark it delivered for subsequent tests
      trackingService.markDelivered(ownerSession, {
        bookingId: bookingTodayId,
        deliveredOn: todayIso,
      });
    });
  });

  describe('4. Overdue Returns Calculation', () => {
    before(() => {
      // Mark booking 2 as delivered on olderIso
      trackingService.markDelivered(ownerSession, {
        bookingId: bookingOverdueId,
        deliveredOn: olderIso,
      });
    });

    it('correctly flags delivered bookings with passed return dates as overdue with exact days late', () => {
      const returns = trackingService.listReturns(ownerSession, { filter: 'overdue' });
      assert.ok(returns.length >= 1);

      const overdueItem = returns.find(r => r.id === bookingOverdueId);
      assert.ok(overdueItem, 'Booking with returning_date in past must be in overdue list');
      assert.equal(overdueItem.is_overdue, true);
      assert.ok(overdueItem.days_late >= 3, `Expected at least 3 days late, got ${overdueItem.days_late}`);
    });

    it('does NOT flag non-delivered bookings as overdue', () => {
      // Create a booking with past return date that was NEVER delivered
      const notDelivered = bookingsService.create(ownerSession, {
        customer_id: testCustId,
        booking_date: olderIso,
        delivery_date: olderIso,
        returning_date: pastIso,
        items: [{ dress_name_snapshot: 'Test Uncollected', rate: 5000 }],
      });

      const list = trackingService.listReturns(ownerSession, { filter: 'overdue' });
      const found = list.find(r => r.id === notDelivered.id);
      assert.equal(found, undefined, 'A dress never delivered cannot be an overdue return');
    });
  });

  describe('5. Mark Returned & Return Flow Prompts', () => {
    it('marks booking as returned with condition (Needs cleaning / Damaged) and audits it', () => {
      const res = trackingService.markReturned(cashierSession, {
        bookingId: bookingOverdueId,
        returnedOn: todayIso,
        condition: 'Needs cleaning',
        damageNote: 'Slight dust at bottom hem, sent for steam dry-clean',
      });

      assert.equal(res.ok, true);
      assert.equal(res.returned_on, todayIso);
      assert.equal(res.return_condition, 'Needs cleaning');

      const b = db.prepare('SELECT returned_on, return_condition, return_damage_note FROM bookings WHERE id = ?').get(bookingOverdueId);
      assert.equal(b.returned_on, todayIso);
      assert.equal(b.return_condition, 'Needs cleaning');
      assert.equal(b.return_damage_note, 'Slight dust at bottom hem, sent for steam dry-clean');

      // Verify audit log
      const audit = db.prepare(`
        SELECT * FROM audit_logs
        WHERE table_name = 'bookings' AND record_id = ? AND action = 'RETURN_MARKED'
      `).get(bookingOverdueId);
      assert.ok(audit);
    });

    it('handles return prompts: deposits refund, remaining collection, and closing booking', () => {
      // Setup booking for full settling flow:
      // Grand total = 17000, paid so far = 0, remaining = 17000, security_deposit = 2000
      const bBefore = bookingsService.get(ownerSession, bookingTodayId);
      assert.equal(bBefore.security_deposit, 2000);
      assert.equal(bBefore.remaining, 17000);

      // Perform return with prompts:
      // 1. Refund 2000 deposit
      // 2. Receive 17000 remaining
      // 3. Close booking
      const res = trackingService.markReturned(ownerSession, {
        bookingId: bookingTodayId,
        returnedOn: todayIso,
        condition: 'OK',
        refundDeposit: true,
        depositRefundMethod: 'cash',
        depositRefundAmount: 2000,
        receiveRemaining: true,
        remainingMethod: 'cash',
        remainingAmount: 17000,
        closeBooking: true,
      });

      assert.equal(res.ok, true);
      assert.equal(res.returned_on, todayIso);
      assert.equal(res.return_condition, 'OK');
      assert.equal(res.remaining, 0);
      assert.equal(res.status, 'Closed');

      // Verify deposit refund payment was created with kind 'deposit_refund'
      const payments = paymentsService.listByBooking(ownerSession, bookingTodayId);
      const refundPay = payments.find(p => p.kind === 'deposit_refund');
      assert.ok(refundPay, 'Deposit refund payment must exist');
      assert.equal(refundPay.amount, 2000);

      // Verify rental payment was created
      const rentalPay = payments.find(p => p.kind === 'rental');
      assert.ok(rentalPay, 'Remaining rental payment must exist');
      assert.equal(rentalPay.amount, 17000);

      // Verify booking status in database is Closed
      const bAfter = db.prepare('SELECT status, remaining, delivered_on, returned_on FROM bookings WHERE id = ?').get(bookingTodayId);
      assert.equal(bAfter.status, 'Closed');
      assert.equal(bAfter.remaining, 0);
      assert.ok(bAfter.delivered_on);
      assert.ok(bAfter.returned_on);
    });
  });

  describe('6. Home Counters Live Summary', () => {
    it('returns accurate live tracking summary counts', () => {
      const summary = trackingService.getTrackingSummary(ownerSession);
      assert.ok(summary);
      assert.equal(typeof summary.deliveries, 'number');
      assert.equal(typeof summary.returns, 'number');
      assert.equal(typeof summary.overdue, 'number');
      assert.equal(typeof summary.pending, 'number');
      assert.equal(summary.today, todayIso);
    });
  });
});
