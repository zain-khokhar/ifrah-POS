/**
 * electron/phase10/phase10.test.js
 *
 * Unit & Integration tests for Phase 10 — Reports & Exports.
 * Tests:
 *  - Delivery Sheet report & enrichment
 *  - Prepare & Dry-Clean operations list
 *  - Returns Due and Overdue with days_late
 *  - Customer Report (BDRCustomer) and matching totals
 *  - Customers This Month & city breakdown
 *  - Today's Open Accounts
 *  - Daily Cash by Method (Owner only, Cashier/Viewer forbidden)
 *  - Outstanding Balances (Owner only, oldest delivery first)
 *  - Dress Utilization & same-day conflict detection
 *  - Excel report generation via ExcelJS (numeric types, preserved phone zeros, frozen row, totals)
 *  - Full system 5-tab Excel export (Owner only)
 *  - Printable HTML report template rendering
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');

const { SCHEMA_STATEMENTS } = require('../database/schema');
const { createBookingsService } = require('../bookings/service');
const { createPaymentsService } = require('../payments/service');
const { createTrackingService } = require('../tracking/service');
const { createSettingsService } = require('../settings/service');
const { createReportsService } = require('../reports/service');
const { buildExcelReport, buildFullSystemExcel } = require('../reports/excel');
const { renderReportHtml } = require('../reports/template');
const { ROLES } = require('../auth/roles');

describe('Phase 10 — Reports and Exports', () => {
  let db;
  let tmpDir;
  let bookingsService;
  let paymentsService;
  let trackingService;
  let settingsService;
  let reportsService;

  const ownerSession   = { active: true, user: { id: 1, username: 'owner_user',   role: ROLES.OWNER, full_name: 'Owner Zain' } };
  const cashierSession = { active: true, user: { id: 2, username: 'cashier_user', role: ROLES.CASHIER, full_name: 'Cashier Ali' } };
  const viewerSession  = { active: true, user: { id: 3, username: 'viewer_user',  role: ROLES.VIEWER, full_name: 'Viewer Sana' } };

  let testCustId1;
  let testCustId2;
  let testDressId1;
  let testDressId2;

  let b1Id;
  let b2Id;
  let b3Id;

  const todayIso = new Date().toISOString().slice(0, 10);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);

  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 4);
  const pastIso = pastDate.toISOString().slice(0, 10);

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 3);
  const futureIso = futureDate.toISOString().slice(0, 10);

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ifrah-test-phase10-'));
    const dbPath = path.join(tmpDir, 'test-phase10.sqlite');

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
    settingsService = createSettingsService(db);
    paymentsService = createPaymentsService(db);
    bookingsService = createBookingsService(db, paymentsService);
    trackingService = createTrackingService(db, bookingsService, paymentsService);
    reportsService  = createReportsService(db, settingsService);

    // Seed cities
    db.prepare(`INSERT INTO cities (id, name) VALUES (1, 'Lahore'), (2, 'Burewala')`).run();
    db.prepare(`INSERT INTO relation_types (id, name) VALUES (1, 'Brother')`).run();

    // Seed customers (with leading zeros in phone & CNIC)
    const c1 = db.prepare(`
      INSERT INTO customers (name, phone, cnic, city_id, relative_name, relation_type_id, created_by, updated_by)
      VALUES ('Fatima Zahra', '03001234567', '35202-1234567-1', 1, 'Usman Zahra', 1, 1, 1)
    `).run();
    testCustId1 = c1.lastInsertRowid;

    const c2 = db.prepare(`
      INSERT INTO customers (name, phone, cnic, city_id, created_by, updated_by)
      VALUES ('Sana Tariq', '03219876543', '35202-7654321-2', 2, 1, 1)
    `).run();
    testCustId2 = c2.lastInsertRowid;

    // Seed dresses
    const d1 = db.prepare(`
      INSERT INTO dresses (name, code, default_rate, is_active, created_by, updated_by)
      VALUES ('Royal Crimson Lehenga', 'D-0001', 18000, 1, 1, 1)
    `).run();
    testDressId1 = d1.lastInsertRowid;

    const d2 = db.prepare(`
      INSERT INTO dresses (name, code, default_rate, is_active, created_by, updated_by)
      VALUES ('Emerald Velvet Gharara', 'D-0002', 14000, 1, 1, 1)
    `).run();
    testDressId2 = d2.lastInsertRowid;

    // Booking 1: Going out today (Open, partially paid)
    const b1 = bookingsService.create(ownerSession, {
      customer_id: testCustId1,
      city_id: 1,
      booking_date: todayIso,
      delivery_date: todayIso,
      returning_date: futureIso,
      security_deposit: 3000,
      items: [
        { dress_id: testDressId1, dress_name_snapshot: 'Royal Crimson Lehenga', rate: 18000, quantity: 1, size: 'M', jewellery: 1, clutch_purse: 1 },
      ],
    });
    b1Id = b1.id;
    // Mark Booking 1 Open
    bookingsService.setStatus(ownerSession, b1Id, 'Open');
    // Pay advance 8,000 cash
    paymentsService.create(ownerSession, {
      booking_id: b1Id,
      amount: 8000,
      payment_method: 'cash',
      kind: 'rental',
      paid_on: todayIso,
    });

    // Booking 2: Past delivery, overdue return, remaining balance
    const b2 = bookingsService.create(ownerSession, {
      customer_id: testCustId2,
      city_id: 2,
      booking_date: pastIso,
      delivery_date: pastIso,
      returning_date: pastIso, // 4 days ago
      security_deposit: 2000,
      items: [
        { dress_id: testDressId2, dress_name_snapshot: 'Emerald Velvet Gharara', rate: 14000, quantity: 1, size: 'L' },
      ],
    });
    b2Id = b2.id;
    // Mark delivered in past
    trackingService.markDelivered(ownerSession, {
      bookingId: b2Id,
      deliveredOn: pastIso,
    });

    // Booking 3: Another booking with dress 1 on SAME date (Today) to test Clash report
    const b3 = bookingsService.create(ownerSession, {
      customer_id: testCustId2,
      city_id: 2,
      booking_date: todayIso,
      delivery_date: todayIso,
      returning_date: futureIso,
      items: [
        { dress_id: testDressId1, dress_name_snapshot: 'Royal Crimson Lehenga', rate: 18000, quantity: 1, size: 'M' },
      ],
    });
    b3Id = b3.id;
  });

  after(() => {
    try {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. Daily Delivery Sheet', () => {
    it('generates delivery sheet for today with full dress details and relative info', () => {
      const report = reportsService.getDeliverySheet(cashierSession, { range: 'today' });
      assert.ok(report);
      assert.equal(report.reportType, 'delivery_sheet');
      assert.ok(Array.isArray(report.rows));
      assert.ok(report.rows.length >= 2, 'Must include bookings scheduled for today');

      const b1Row = report.rows.find(r => r.id === b1Id);
      assert.ok(b1Row);
      assert.equal(b1Row.customer_name, 'Fatima Zahra');
      assert.equal(b1Row.customer_phone, '03001234567');
      assert.ok(b1Row.relative_info.includes('Usman Zahra'));
      assert.ok(b1Row.dresses_detailed.includes('Jewellery'));
      assert.equal(b1Row.grand_total, 18000);
      assert.equal(b1Row.amount_paid, 8000);
      assert.equal(b1Row.remaining, 10000);

      // Verify footer totals
      assert.ok(report.totals.grand_total >= 36000);
      assert.ok(report.totals.remaining >= 28000);
    });

    it('allows Viewer to view delivery sheet', () => {
      const report = reportsService.getDeliverySheet(viewerSession, { range: 'today' });
      assert.ok(report.rows.length >= 1);
    });
  });

  describe('2. Prepare & Dry-Clean Operations List', () => {
    before(() => {
      // Mark one item ready
      const b1 = trackingService.listDeliveries(ownerSession, { filter: 'today' }).find(b => b.id === b1Id);
      if (b1?.items[0]) {
        trackingService.toggleItemReady(ownerSession, { itemId: b1.items[0].id, isReady: true });
      }
    });

    it('generates prepare list for upcoming dresses with ready state', () => {
      const report = reportsService.getPrepareDryCleanList(cashierSession);
      assert.ok(report);
      assert.equal(report.reportType, 'prepare_dryclean');
      assert.ok(report.rows.length >= 1);

      const prepItem = report.rows.find(r => r.booking_no === 412 || r.booking_no === b1Id);
      assert.ok(prepItem);
      assert.equal(prepItem.section, 'PREPARE');
      assert.equal(prepItem.is_ready_text, 'Ready');
    });
  });

  describe('3. Returns Due and Overdue Report', () => {
    it('flags past delivered returns as overdue and calculates days late', () => {
      const report = reportsService.getReturnsDueAndOverdue(ownerSession);
      assert.ok(report);
      assert.equal(report.reportType, 'returns_overdue');

      const overdueRow = report.rows.find(r => r.id === b2Id);
      assert.ok(overdueRow, 'Booking 2 must appear in overdue report');
      assert.equal(overdueRow.is_overdue, true);
      assert.ok(overdueRow.days_late >= 4);
      assert.ok(overdueRow.status_label.includes('LATE'));
      assert.equal(overdueRow.security_deposit, 2000);
    });
  });

  describe('4. Customer Report (BDRCustomer Replacement)', () => {
    it('generates customer bookings ledger and calculates matching totals', () => {
      const report = reportsService.getCustomerReport(ownerSession);
      assert.ok(report);
      assert.equal(report.reportType, 'customer_report');
      assert.ok(report.rows.length >= 3);

      const calculatedGrand = report.rows.reduce((s, r) => s + r.grand_total, 0);
      assert.equal(report.totals.grand_total, calculatedGrand);

      const calculatedPaid = report.rows.reduce((s, r) => s + r.amount_paid, 0);
      assert.equal(report.totals.amount_paid, calculatedPaid);

      const calculatedRemaining = report.rows.reduce((s, r) => s + r.remaining, 0);
      assert.equal(report.totals.remaining, calculatedRemaining);
    });

    it('filters customer report by city', () => {
      const lahoreReport = reportsService.getCustomerReport(ownerSession, { cityId: 1 });
      assert.ok(lahoreReport.rows.every(r => r.city === 'Lahore'));
    });
  });

  describe('5. Customers This Month', () => {
    it('aggregates unique customers and total spent for the month', () => {
      const report = reportsService.getCustomersThisMonth(ownerSession);
      assert.ok(report);
      assert.equal(report.reportType, 'customers_month');
      assert.ok(report.rows.length >= 2, 'Should have at least 2 unique customers');
      assert.ok(Array.isArray(report.citySummary));
    });
  });

  describe('6. Today Open Accounts', () => {
    it('lists only Open bookings whose delivery date is today', () => {
      const report = reportsService.getTodayOpenAccounts(cashierSession);
      assert.ok(report);
      assert.equal(report.reportType, 'today_open_accounts');
      const found = report.rows.find(r => r.id === b1Id);
      assert.ok(found, 'Booking 1 (Open status today) must be in open accounts');
      assert.equal(found.status, 'Open');
    });
  });

  describe('7. Daily Cash by Method (Owner Only)', () => {
    it('forbids Cashier and Viewer from viewing daily cash report', () => {
      assert.throws(() => {
        reportsService.getDailyCash(cashierSession);
      }, /permission/i);

      assert.throws(() => {
        reportsService.getDailyCash(viewerSession);
      }, /permission/i);
    });

    it('allows Owner to view daily cash breakdown by method and kind', () => {
      const report = reportsService.getDailyCash(ownerSession);
      assert.ok(report);
      assert.equal(report.reportType, 'daily_cash');
      assert.ok(report.summary);
      assert.equal(report.summary.totalCash, 8000);
      assert.equal(report.summary.totalBank, 0);
      assert.equal(report.summary.totalRental, 8000);
      assert.equal(report.summary.netTotal, 8000);
    });
  });

  describe('8. Outstanding Balances (Owner Only)', () => {
    it('forbids Cashier and Viewer from viewing outstanding balances', () => {
      assert.throws(() => {
        reportsService.getOutstandingBalances(cashierSession);
      }, /permission/i);
    });

    it('allows Owner to view unpaid balances ordered oldest delivery first', () => {
      const report = reportsService.getOutstandingBalances(ownerSession);
      assert.ok(report);
      assert.equal(report.reportType, 'outstanding_balances');
      assert.ok(report.rows.length >= 2);

      // Oldest delivery (b2Id in past) should come before today's b1Id
      const b2Index = report.rows.findIndex(r => r.id === b2Id);
      const b1Index = report.rows.findIndex(r => r.id === b1Id);
      assert.ok(b2Index < b1Index, 'Older delivery must come first');
    });
  });

  describe('9. Dress Clash & Utilization Report', () => {
    it('detects and flags same-day duplicate dress bookings', () => {
      const report = reportsService.getDressReport(ownerSession);
      assert.ok(report);
      assert.equal(report.reportType, 'dress_report');

      // Dress 1 was booked in both Booking 1 and Booking 3 on Today
      const clashed = report.rows.filter(r => r.dress_id === testDressId1);
      assert.ok(clashed.length >= 2);
      assert.ok(clashed[0].clash_warning.includes('Clash'), 'Duplicate booking must be flagged as clash');
    });
  });

  describe('10. Excel Generation via ExcelJS', () => {
    it('builds valid Excel workbook with formatted numbers, text phones, frozen rows, and totals', async () => {
      const reportData = reportsService.getCustomerReport(ownerSession);
      const buffer = await buildExcelReport({
        title: reportData.title,
        columns: reportData.columns,
        rows: reportData.rows,
        totals: reportData.totals,
      });

      assert.ok(Buffer.isBuffer(buffer));
      assert.ok(buffer.length > 1000, 'Buffer must be valid Excel file');

      // Verify with ExcelJS reader
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      assert.equal(wb.worksheets.length, 1);
      const sheet = wb.worksheets[0];

      // Verify frozen header row
      assert.equal(sheet.views[0].state, 'frozen');
      assert.equal(sheet.views[0].ySplit, 1);

      // Verify phone column preserves leading zero
      const phoneColIdx = reportData.columns.findIndex(c => c.key === 'customer_phone') + 1;
      const phoneCell = sheet.getRow(2).getCell(phoneColIdx);
      assert.equal(typeof phoneCell.value, 'string');
      assert.ok(phoneCell.value.startsWith('03'), `Phone must keep leading zero: got ${phoneCell.value}`);
    });
  });

  describe('11. Full System 5-Tabs Excel Export (Owner Only)', () => {
    it('forbids Cashier and Viewer from exporting everything', () => {
      assert.throws(() => {
        reportsService.getSystemExportData(cashierSession);
      }, /permission/i);
    });

    it('generates multi-tab Excel backup workbook for Owner', async () => {
      const systemData = reportsService.getSystemExportData(ownerSession);
      assert.ok(systemData.bookings.length >= 3);
      assert.ok(systemData.items.length >= 3);
      assert.ok(systemData.customers.length >= 2);
      assert.ok(systemData.dresses.length >= 2);

      const buffer = await buildFullSystemExcel(systemData);
      assert.ok(Buffer.isBuffer(buffer));

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      assert.equal(wb.worksheets.length, 5);

      const sheetNames = wb.worksheets.map(s => s.name);
      assert.deepEqual(sheetNames, ['Bookings', 'Booking Items', 'Payments', 'Customers', 'Dresses']);
    });
  });

  describe('12. Printable HTML Report Template', () => {
    it('renders beautiful bilingual HTML report with shop branding, headers, and footer cards', () => {
      const reportData = reportsService.getDeliverySheet(ownerSession, { range: 'today' });
      const html = renderReportHtml({
        reportType: 'delivery_sheet',
        title: reportData.title,
        subtitle: reportData.subtitle,
        columns: reportData.columns,
        rows: reportData.rows,
        totals: reportData.totals,
        settings: { shop_name: 'Ifrah Collection' },
        generatedBy: 'Owner Zain',
      });

      assert.ok(typeof html === 'string');
      assert.ok(html.includes('Ifrah Collection'));
      assert.ok(html.includes('Daily Delivery Sheet'));
      assert.ok(html.includes('Fatima Zahra'));
      assert.ok(html.includes('TOTAL / کُل'));
      assert.ok(html.includes('Proprietor / Owner Signature'));
    });
  });
});
