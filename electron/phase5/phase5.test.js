/**
 * electron/phase5/phase5.test.js
 *
 * Unit tests for Phase 5 — Payments, Remaining balance, Status workflow, and Manual Backup.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const { SCHEMA_STATEMENTS } = require('../database/schema');
const { createPaymentsService } = require('../payments/service');
const { createBookingsService } = require('../bookings/service');
const { createBackupService }   = require('../backup/service');
const { ROLES } = require('../auth/roles');

describe('Phase 5 — Payments, Remaining, Status & Backup', () => {
  let db;
  let tmpDir;
  let paymentsService;
  let bookingsService;
  let backupService;

  const ownerSession   = { active: true, user: { id: 1, username: 'owner_user',   role: ROLES.OWNER } };
  const cashierSession = { active: true, user: { id: 2, username: 'cashier_user', role: ROLES.CASHIER } };
  const viewerSession  = { active: true, user: { id: 3, username: 'viewer_user',  role: ROLES.VIEWER } };

  let testCustomerId;
  let testDressId;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ifrah-test-phase5-'));
    const dbPath = path.join(tmpDir, 'test-phase5.sqlite');

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

    // Seed test customer
    const custRes = db.prepare(`
      INSERT INTO customers (name, phone) VALUES ('Bibi Fatima', '03001234567')
    `).run();
    testCustomerId = custRes.lastInsertRowid;

    // Seed test dress
    const dressRes = db.prepare(`
      INSERT INTO dresses (code, name, rental_price) VALUES ('D-0001', 'Bridal Red Lehenga', 15000)
    `).run();
    testDressId = dressRes.lastInsertRowid;

    paymentsService = createPaymentsService(db);
    bookingsService = createBookingsService(db);
    backupService   = createBackupService(db, { getPath: () => tmpDir });
  });

  after(() => {
    if (db) db.close();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. ADVANCE PAYMENT ON BOOKING CREATION
  // ──────────────────────────────────────────────────────────────────────────
  describe('Advance Payment & Booking Creation', () => {
    it('creates booking with zero advance: remaining equals grand_total', () => {
      const res = bookingsService.create(cashierSession, {
        customer_id: testCustomerId,
        booking_date: '2026-10-10',
        delivery_date: '2026-10-15',
        returning_date: '2026-10-17',
        items: [{ dress_id: testDressId, dress_name: 'Bridal Red Lehenga', quantity: 1, rate: 10000 }],
        advance_amount: 0,
      });

      const b = bookingsService.get(cashierSession, res.id);
      assert.equal(b.grand_total, 10000);
      assert.equal(b.amount_paid, 0);
      assert.equal(b.remaining, 10000);
      assert.equal(b.payments.length, 0);
    });

    it('creates booking with advance: auto creates rental payment and updates remaining', () => {
      const res = bookingsService.create(cashierSession, {
        customer_id: testCustomerId,
        booking_date: '2026-10-10',
        delivery_date: '2026-10-15',
        returning_date: '2026-10-17',
        items: [{ dress_id: testDressId, dress_name: 'Bridal Red Lehenga', quantity: 1, rate: 20000 }],
        advance_amount: 5000,
        advance_method: 'bank',
        advance_note: 'Online Transfer Advance',
      });

      const b = bookingsService.get(cashierSession, res.id);
      assert.equal(b.grand_total, 20000);
      assert.equal(b.amount_paid, 5000);
      assert.equal(b.remaining, 15000);
      assert.equal(b.payments.length, 1);

      const p = b.payments[0];
      assert.equal(p.amount, 5000);
      assert.equal(p.payment_method, 'bank');
      assert.equal(p.kind, 'rental');
      assert.equal(p.is_void, 0);
      assert.equal(p.note, 'Online Transfer Advance');
    });

    it('discount reduces grand_total and remaining correctly', () => {
      const res = bookingsService.create(ownerSession, {
        customer_id: testCustomerId,
        booking_date: '2026-10-10',
        delivery_date: '2026-10-15',
        returning_date: '2026-10-17',
        discount: 2000,
        items: [{ dress_id: testDressId, dress_name: 'Bridal Red Lehenga', quantity: 1, rate: 12000 }],
        advance_amount: 3000,
      });

      const b = bookingsService.get(ownerSession, res.id);
      assert.equal(b.grand_total, 10000); // 12000 - 2000
      assert.equal(b.amount_paid, 3000);
      assert.equal(b.remaining, 7000);   // 10000 - 3000
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. PAYMENTS SERVICE & SUBSEQUENT PAYMENTS
  // ──────────────────────────────────────────────────────────────────────────
  describe('Payments Service & Live Balances', () => {
    let bookingId;

    before(() => {
      const bRes = bookingsService.create(cashierSession, {
        customer_id: testCustomerId,
        booking_date: '2026-10-10',
        delivery_date: '2026-10-15',
        returning_date: '2026-10-17',
        items: [{ dress_id: testDressId, dress_name: 'Bridal Red Lehenga', quantity: 1, rate: 30000 }],
        advance_amount: 10000,
      });
      bookingId = bRes.id;
    });

    it('cashier can record second payment and remaining updates live', () => {
      const payRes = paymentsService.create(cashierSession, {
        booking_id: bookingId,
        amount: 8000,
        payment_method: 'cash',
        note: 'Second installment',
      });

      assert.equal(payRes.amount, 8000);
      assert.equal(payRes.totals.amount_paid, 18000);
      assert.equal(payRes.totals.remaining, 12000);

      const b = bookingsService.get(cashierSession, bookingId);
      assert.equal(b.amount_paid, 18000);
      assert.equal(b.remaining, 12000);
    });

    it('rejects payment with 0 or negative amount', () => {
      assert.throws(() => {
        paymentsService.create(cashierSession, {
          booking_id: bookingId,
          amount: 0,
        });
      }, /Payment amount 0 se zyada hona zaroori hai/);

      assert.throws(() => {
        paymentsService.create(cashierSession, {
          booking_id: bookingId,
          amount: -500,
        });
      }, /Payment amount 0 se zyada hona zaroori hai/);
    });

    it('security deposit does NOT affect rental remaining balance', () => {
      const depRes = paymentsService.create(cashierSession, {
        booking_id: bookingId,
        amount: 5000,
        kind: 'deposit',
        payment_method: 'cash',
        note: 'Security deposit',
      });

      assert.equal(depRes.kind, 'deposit');
      const b = bookingsService.get(cashierSession, bookingId);
      // Remaining is still 12000! Deposit does NOT count towards rental
      assert.equal(b.remaining, 12000);
      assert.equal(b.amount_paid, 18000);
    });

    it('viewer cannot record a payment', () => {
      assert.throws(() => {
        paymentsService.create(viewerSession, {
          booking_id: bookingId,
          amount: 1000,
        });
      }, /permission/);
    });

    it('overpayment reduces remaining to 0 while keeping accurate amount_paid', () => {
      // remaining is 12000. Customer pays 15000.
      paymentsService.create(cashierSession, {
        booking_id: bookingId,
        amount: 15000,
        payment_method: 'wallet',
      });

      const b = bookingsService.get(cashierSession, bookingId);
      assert.equal(b.amount_paid, 33000); // 10k + 8k + 15k
      assert.equal(b.remaining, 0);       // Max(0, 30000 - 33000)
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. VOID PAYMENT & PERMISSIONS
  // ──────────────────────────────────────────────────────────────────────────
  describe('Void Payment Rules', () => {
    let bookingId;
    let paymentToVoidId;

    before(() => {
      const bRes = bookingsService.create(cashierSession, {
        customer_id: testCustomerId,
        booking_date: '2026-10-10',
        delivery_date: '2026-10-15',
        returning_date: '2026-10-17',
        items: [{ dress_id: testDressId, dress_name: 'Bridal Red Lehenga', quantity: 1, rate: 25000 }],
        advance_amount: 5000,
      });
      bookingId = bRes.id;

      const pRes = paymentsService.create(cashierSession, {
        booking_id: bookingId,
        amount: 10000,
        payment_method: 'cash',
        note: 'Cash payment entered mistakenly',
      });
      paymentToVoidId = pRes.id;
    });

    it('cashier cannot void a payment (Owner only)', () => {
      assert.throws(() => {
        paymentsService.voidPayment(cashierSession, paymentToVoidId, { reason: 'Wrong entry' });
      }, /permission/);
    });

    it('owner can void a payment with a reason; balance recalculates instantly', () => {
      const voidRes = paymentsService.voidPayment(ownerSession, paymentToVoidId, { reason: 'Ghalat entry thi' });
      assert.equal(voidRes.ok, true);

      // Remaining was 10000 (25000 - 5000 - 10000). After voiding 10000, remaining must be 20000!
      assert.equal(voidRes.totals.amount_paid, 5000);
      assert.equal(voidRes.totals.remaining, 20000);

      const b = bookingsService.get(ownerSession, bookingId);
      assert.equal(b.amount_paid, 5000);
      assert.equal(b.remaining, 20000);

      const voidedRow = db.prepare(`SELECT * FROM payments WHERE id = ?`).get(paymentToVoidId);
      assert.equal(voidedRow.is_void, 1);
      assert.equal(voidedRow.void_reason, 'Ghalat entry thi');
      assert.equal(voidedRow.voided_by, ownerSession.user.id);
      assert.ok(voidedRow.voided_at);
    });

    it('cannot void an already-voided payment again', () => {
      assert.throws(() => {
        paymentsService.voidPayment(ownerSession, paymentToVoidId, { reason: 'Double void' });
      }, /pehle se void ho chuki hai/);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. LISTINGS AND SUMMARY STATS
  // ──────────────────────────────────────────────────────────────────────────
  describe('Payments Listings & Summary', () => {
    it('listAll returns payments with customer and booking details', () => {
      const list = paymentsService.listAll(cashierSession, { limit: 10 });
      assert.ok(Array.isArray(list));
      assert.ok(list.length > 0);
      assert.ok(list[0].booking_no);
      assert.ok(list[0].amount > 0);
    });

    it('getSummary calculates method totals correctly', () => {
      const summary = paymentsService.getSummary(cashierSession);
      assert.ok(typeof summary.total === 'number');
      assert.ok(typeof summary.cash === 'number');
      assert.ok(typeof summary.bank === 'number');
      assert.ok(typeof summary.wallet === 'number');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. STATUS WORKFLOW & CLOSED CRITERIA
  // ──────────────────────────────────────────────────────────────────────────
  describe('Status Workflow & Closed Rules', () => {
    let bookingId;

    before(() => {
      const bRes = bookingsService.create(cashierSession, {
        customer_id: testCustomerId,
        booking_date: '2026-10-10',
        delivery_date: '2026-10-15',
        returning_date: '2026-10-17',
        items: [{ dress_id: testDressId, dress_name: 'Bridal Red Lehenga', quantity: 1, rate: 10000 }],
        advance_amount: 5000,
      });
      bookingId = bRes.id;
    });

    it('canClose returns false when not delivered, not returned, and balance remains', () => {
      const check = bookingsService.canClose(bookingId);
      assert.equal(check.canClose, false);
      assert.equal(check.checklist.delivered, false);
      assert.equal(check.checklist.returned, false);
      assert.equal(check.checklist.fullyPaid, false);
      assert.equal(check.missing.length, 3);
    });

    it('rejects closing the booking when conditions are not met', () => {
      assert.throws(() => {
        bookingsService.setStatus(cashierSession, bookingId, 'Closed');
      }, /Booking close nahi ho sakti/);
    });

    it('owner can force-close with a required reason', () => {
      assert.throws(() => {
        bookingsService.setStatus(ownerSession, bookingId, 'Closed', { forceClose: true, forceReason: '' });
      }, /Owner ke force-close karne ke liye reason likhna zaroori hai/);

      const res = bookingsService.setStatus(ownerSession, bookingId, 'Closed', {
        forceClose: true,
        forceReason: 'Special concession by owner',
      });
      assert.equal(res.ok, true);
      assert.equal(res.status, 'Closed');

      const audit = db.prepare(`SELECT * FROM audit_logs WHERE action = 'booking.force_close' ORDER BY id DESC LIMIT 1`).get();
      assert.ok(audit);
      assert.ok(audit.new_values.includes('Special concession by owner'));
    });

    it('allows normal close when delivered, returned, and fully paid', () => {
      // Create new fresh booking
      const bRes = bookingsService.create(cashierSession, {
        customer_id: testCustomerId,
        booking_date: '2026-10-10',
        delivery_date: '2026-10-15',
        returning_date: '2026-10-17',
        items: [{ dress_id: testDressId, dress_name: 'Bridal Red Lehenga', quantity: 1, rate: 10000 }],
        advance_amount: 10000, // Fully paid
      });
      const bId = bRes.id;

      // Mark delivered and returned
      db.prepare(`UPDATE bookings SET delivered_on = '2026-10-15', returned_on = '2026-10-17' WHERE id = ?`).run(bId);

      const check = bookingsService.canClose(bId);
      assert.equal(check.canClose, true);
      assert.equal(check.checklist.delivered, true);
      assert.equal(check.checklist.returned, true);
      assert.equal(check.checklist.fullyPaid, true);
      assert.equal(check.missing.length, 0);

      // Cashier can now set Closed without forceClose!
      const statusRes = bookingsService.setStatus(cashierSession, bId, 'Closed');
      assert.equal(statusRes.ok, true);
      assert.equal(statusRes.status, 'Closed');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. LOCAL BACKUP SERVICE & INTEGRITY CHECK
  // ──────────────────────────────────────────────────────────────────────────
  describe('Local Backup Service', () => {
    it('creates a clean SQLite backup and passes integrity check', async () => {
      const backupRes = await backupService.createBackup(cashierSession, { isManual: true });
      assert.equal(backupRes.ok, true);
      assert.ok(backupRes.filePath);
      assert.ok(fs.existsSync(backupRes.filePath));
      assert.equal(backupRes.integrity, 'ok');
      assert.ok(backupRes.sizeBytes > 0);

      // Audit log check
      const audit = db.prepare(`SELECT * FROM audit_logs WHERE action = 'backup.create' ORDER BY id DESC LIMIT 1`).get();
      assert.ok(audit);
      assert.equal(audit.user_id, cashierSession.user.id);
    });

    it('listBackups finds the created backup files', () => {
      const list = backupService.listBackups(cashierSession);
      assert.ok(Array.isArray(list));
      assert.ok(list.length >= 1);
      assert.ok(list[0].name.endsWith('.sqlite'));
      assert.ok(list[0].size);
    });
  });
});
