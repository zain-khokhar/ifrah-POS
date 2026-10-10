/**
 * electron/phase8/phase8.test.js
 *
 * Unit tests for Phase 8 — Receipts, Printing, PDF generation, Settings, and Rule 10.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const { SCHEMA_STATEMENTS } = require('../database/schema');
const { createSettingsService } = require('../settings/service');
const { createBookingsService } = require('../bookings/service');
const { createPaymentsService } = require('../payments/service');
const { createReceiptsService } = require('../receipts/service');
const { renderReceiptHtml }     = require('../receipts/template');
const { ROLES } = require('../auth/roles');

describe('Phase 8 — Receipts, Printing & Settings', () => {
  let db;
  let tmpDir;
  let settingsService;
  let bookingsService;
  let paymentsService;
  let receiptsService;

  const ownerSession   = { active: true, user: { id: 1, username: 'owner_user',   role: ROLES.OWNER, full_name: 'Owner Zain' } };
  const cashierSession = { active: true, user: { id: 2, username: 'cashier_user', role: ROLES.CASHIER, full_name: 'Cashier Ali' } };
  const viewerSession  = { active: true, user: { id: 3, username: 'viewer_user',  role: ROLES.VIEWER, full_name: 'Viewer Sana' } };

  let testCustomerId;
  let testBookingId;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ifrah-test-phase8-'));
    const dbPath = path.join(tmpDir, 'test-phase8.sqlite');

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

    // Seed test settings
    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES ('shop_name', 'Ifrah Collection'),
             ('shop_tagline', 'Exclusive Bridal & Party Wear'),
             ('shop_address', 'Main Bazaar, Near Bank Alfalah'),
             ('shop_phone', '0300-1234567'),
             ('shop_phone2', '0321-7654321'),
             ('shop_city', 'Lahore'),
             ('receipt_footer_ur', 'واپسی پر ڈریس صاف اور درست حالت میں واپس کرنا لازمی ہے۔ تاخیر کی صورت میں یومیہ کرایہ وصول ہوگا۔'),
             ('receipt_footer_en', 'Dress must be returned in good condition. Late return will incur daily rental charges.'),
             ('receipt_default_layout', '80mm'),
             ('receipt_reprint_watermark', '1'),
             ('printer_80mm', 'Thermal_POS_80'),
             ('printer_a4', 'HP_LaserJet_A4')
    `).run();

    // Seed test customer
    const custRes = db.prepare(`
      INSERT INTO customers (name, phone, phone2, cnic, address)
      VALUES ('مسز فرزانہ بیگم', '03001234567', '03217654321', '35201-1234567-1', 'Gulberg III, Lahore')
    `).run();
    testCustomerId = custRes.lastInsertRowid;

    // Seed test dresses
    for (let i = 1; i <= 8; i++) {
      db.prepare(`
        INSERT INTO dresses (code, name, rental_price, active)
        VALUES ('D-000${i}', 'Bridal Lehenga ${i}', 5000, 1)
      `).run();
    }

    // Instantiate services
    settingsService = createSettingsService(db);
    bookingsService = createBookingsService(db);
    paymentsService = createPaymentsService(db);
    receiptsService = createReceiptsService(db, settingsService, bookingsService);

    // Create a rich test booking with 6 dresses and Urdu notes
    const bookingRes = bookingsService.create(cashierSession, {
      customer_id: testCustomerId,
      booking_date: '2026-10-10',
      delivery_date: '2026-10-15',
      returning_date: '2026-10-18',
      status: 'Open',
      discount: 2000,
      notes: 'دوپٹے پر خاص استری کی جائے اور جیولری باکس احتیاط سے دیا جائے',
      advance_amount: 10000,
      advance_method: 'cash',
      advance_date: '2026-10-10',
      advance_note: 'پیشگی ایڈوانس کیش',
      items: [
        { dress_id: 1, dress_name_snapshot: 'ریڈ برائیڈل لہنگا (Handwork)', size: 'Medium', quantity: 1, rate: 10000, jewellery: 1, clutch_purse: 1, double_dupatta: 1, description: 'کام بالکل نیا ہے' },
        { dress_id: 2, dress_name_snapshot: 'مہندی میکسی گرین', size: 'Large', quantity: 1, rate: 6000, jewellery: 1, shoes: 1 },
        { dress_id: 3, dress_name_snapshot: 'ولیمہ گرے فراک', size: 'Medium', quantity: 1, rate: 8000, hand_bag: 1 },
        { dress_id: 4, dress_name_snapshot: 'پارٹی ویئر سلور گاؤن', size: 'Small', quantity: 1, rate: 4000, clutch_purse: 1 },
        { dress_id: 5, dress_name_snapshot: 'شاہانہ مخمل شال سوٹ', size: 'Medium', quantity: 1, rate: 5000, double_dupatta: 1 },
        { dress_id: 6, dress_name_snapshot: 'پنک انارکلی فراک', size: 'Medium', quantity: 1, rate: 4500, jewellery: 1 },
      ],
    });
    testBookingId = bookingRes.id;
  });

  after(() => {
    if (db) db.close();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ─── 1. Settings Service Tests ──────────────────────────────────────────
  describe('Settings Service & Permissions', () => {
    it('any staff (cashier, viewer, owner) can read shop settings', () => {
      const settingsViewer = settingsService.getSettings(viewerSession);
      const settingsCashier = settingsService.getSettings(cashierSession);
      const settingsOwner = settingsService.getSettings(ownerSession);

      assert.strictEqual(settingsViewer.shop_name, 'Ifrah Collection');
      assert.strictEqual(settingsCashier.shop_name, 'Ifrah Collection');
      assert.strictEqual(settingsOwner.shop_name, 'Ifrah Collection');
      assert.strictEqual(settingsOwner.receipt_default_layout, '80mm');
      assert.strictEqual(settingsOwner.printer_80mm, 'Thermal_POS_80');
    });

    it('cashier cannot update shop settings (Owner only)', () => {
      assert.throws(() => {
        settingsService.updateSettings(cashierSession, { shop_name: 'Hacked Boutique' });
      }, /permission|authorized|AuthorizationError/i);
    });

    it('viewer cannot update shop settings (Owner only)', () => {
      assert.throws(() => {
        settingsService.updateSettings(viewerSession, { shop_name: 'Hacked Boutique' });
      }, /permission|authorized|AuthorizationError/i);
    });

    it('owner can update shop settings and updates are audited', () => {
      const res = settingsService.updateSettings(ownerSession, {
        shop_name: 'Ifrah Collection Bridal Studio',
        shop_phone: '0311-9999999',
        receipt_default_layout: 'a4',
      });

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data.shop_name, 'Ifrah Collection Bridal Studio');
      assert.strictEqual(res.data.shop_phone, '0311-9999999');
      assert.strictEqual(res.data.receipt_default_layout, 'a4');

      // Verify audit trail
      const audit = db.prepare(`SELECT * FROM audit_logs WHERE action = 'SETTINGS_UPDATED'`).get();
      assert.ok(audit, 'Audit log entry should exist');
      assert.strictEqual(audit.user_id, ownerSession.user.id);
    });
  });

  // ─── 2. Receipts Data Service Tests ─────────────────────────────────────
  describe('Receipts Data Preparation', () => {
    it('retrieves full booking data, items, customer, and remaining math', async () => {
      const res = await receiptsService.getReceiptData(cashierSession, testBookingId);
      assert.strictEqual(res.ok, true);
      assert.ok(res.booking);
      assert.strictEqual(res.booking.id, testBookingId);
      assert.strictEqual(res.booking.customer_name, 'مسز فرزانہ بیگم');
      assert.strictEqual(res.booking.customer_phone, '03001234567');
      assert.strictEqual(res.booking.customer_cnic, '35201-1234567-1');

      // Check items
      assert.strictEqual(res.booking.items.length, 6);
      assert.strictEqual(res.booking.items[0].dress_name_snapshot, 'ریڈ برائیڈل لہنگا (Handwork)');
      assert.strictEqual(res.booking.items[0].jewellery, 1);

      // Financials
      // Total lines = 10000 + 6000 + 8000 + 4000 + 5000 + 4500 = 37500
      // Discount = 2000 => Grand total = 35500
      // Paid (advance) = 10000 => Remaining = 25500
      assert.strictEqual(res.booking.grand_total, 35500);
      assert.strictEqual(res.booking.amount_paid, 10000);
      assert.strictEqual(res.booking.remaining, 25500);

      // Initially isReprint should be false
      assert.strictEqual(res.isReprint, false);
      assert.strictEqual(res.printCount, 0);
    });

    it('throws error for non-existent booking ID', async () => {
      await assert.rejects(async () => {
        await receiptsService.getReceiptData(cashierSession, 99999);
      }, /not found/i);
    });
  });

  // ─── 3. Template HTML Rendering Tests ───────────────────────────────────
  describe('Receipt Template HTML Rendering (80mm & A4)', () => {
    it('renders 80mm thermal receipt with correct styles, items, and Urdu notes', async () => {
      const gen = await receiptsService.generateHtml(cashierSession, {
        bookingId: testBookingId,
        layout: '80mm',
        isCopy: false,
      });

      assert.strictEqual(gen.ok, true);
      const html = gen.html;

      // Layout check
      assert.ok(html.includes('80mm auto'), 'Should include 80mm @page size');
      assert.ok(html.includes('BOOKING #'), 'Should include booking number');
      assert.ok(html.includes('Ifrah Collection Bridal Studio'), 'Should include updated shop name');
      assert.ok(html.includes('0311-9999999'), 'Should include shop phone');

      // Customer & Urdu checks
      assert.ok(html.includes('مسز فرزانہ بیگم'), 'Should render Urdu customer name');
      assert.ok(html.includes('35201-1234567-1'), 'Should render CNIC');
      assert.ok(html.includes('ریڈ برائیڈل لہنگا'), 'Should render Urdu dress name snapshot');
      assert.ok(html.includes('دوپٹے پر خاص استری'), 'Should render Urdu notes');

      // Accessories
      assert.ok(html.includes('Jewellery (جیولری)'), 'Should render jewellery accessory badge');
      assert.ok(html.includes('Clutch (پرس)'), 'Should render clutch badge');
      assert.ok(html.includes('2x Dupatta (ڈبل دوپٹہ)'), 'Should render dupatta badge');

      // Financials
      assert.ok(html.includes('35,500'), 'Should render Grand Total');
      assert.ok(html.includes('10,000'), 'Should render Advance Paid');
      assert.ok(html.includes('25,500'), 'Should render Remaining Balance');
      assert.ok(html.includes('REMAINING BALANCE (بقایا رقم)'), 'Should render remaining label in Urdu/English');

      // Is not copy
      assert.ok(!html.includes('DUPLICATE COPY'), 'Should not show copy watermark on first print');
    });

    it('renders A4 invoice with full table layout, terms, and signature lines', async () => {
      const gen = await receiptsService.generateHtml(cashierSession, {
        bookingId: testBookingId,
        layout: 'a4',
        isCopy: true,
      });

      assert.strictEqual(gen.ok, true);
      const html = gen.html;

      // A4 checks
      assert.ok(html.includes('A4 portrait'), 'Should include A4 @page size');
      assert.ok(html.includes('RENTAL INVOICE'), 'Should include Invoice header');
      assert.ok(html.includes('DUPLICATE COPY / نقل'), 'Should include duplicate stamp when isCopy is true');
      assert.ok(html.includes('Customer Signature (دستخط گاہک)'), 'Should include customer signature line');
      assert.ok(html.includes('Authorized Signature (دستخط شاپ)'), 'Should include shop signature line');

      // Long item count (all 6 dress lines)
      for (let i = 1; i <= 6; i++) {
        assert.ok(html.includes(`>${i}</td>`), `Should contain item row #${i}`);
      }
    });
  });

  // ─── 4. Reprint Counter & Audit Tracking ────────────────────────────────
  describe('Reprint Counter & Audit Tracking', () => {
    it('recordPrint increments receipt_print_count and logs audit trail', () => {
      const res1 = receiptsService.recordPrint(cashierSession, testBookingId);
      assert.strictEqual(res1.ok, true);
      assert.strictEqual(res1.print_count, 1);

      // Verify DB column updated
      const row = db.prepare('SELECT receipt_print_count FROM bookings WHERE id = ?').get(testBookingId);
      assert.strictEqual(row.receipt_print_count, 1);

      // Verify subsequent getReceiptData marks isReprint = true
      receiptsService.getReceiptData(cashierSession, testBookingId).then(data => {
        assert.strictEqual(data.isReprint, true);
        assert.strictEqual(data.printCount, 1);
      });

      // Second print
      const res2 = receiptsService.recordPrint(ownerSession, testBookingId);
      assert.strictEqual(res2.ok, true);
      assert.strictEqual(res2.print_count, 2);

      // Verify audit logs
      const auditRows = db.prepare(`SELECT * FROM audit_logs WHERE action = 'RECEIPT_PRINTED' AND record_id = ?`).all(testBookingId);
      assert.strictEqual(auditRows.length, 2);
    });

    it('viewer cannot record print', () => {
      assert.throws(() => {
        receiptsService.recordPrint(viewerSession, testBookingId);
      }, /permission|authorized|AuthorizationError/i);
    });
  });

  // ─── 5. Fully Paid vs Remaining Status on Receipts ──────────────────────
  describe('Fully Paid Zero-Remaining Presentation', () => {
    it('displays FULLY PAID when remaining balance is 0', async () => {
      // Record second payment to clear remaining 25500
      paymentsService.create(cashierSession, {
        booking_id: testBookingId,
        amount: 25500,
        payment_method: 'bank',
        paid_on: '2026-10-12',
        note: 'مکمل بقایا رقم وصول بذریعہ بینک',
      });

      const gen = await receiptsService.generateHtml(cashierSession, {
        bookingId: testBookingId,
        layout: '80mm',
      });

      assert.strictEqual(gen.ok, true);
      assert.ok(gen.html.includes('FULLY PAID'), 'Should display FULLY PAID on 0 balance');
      assert.ok(gen.html.includes('مکمل ادا شدہ'), 'Should display Urdu translation for fully paid');
    });
  });
});
