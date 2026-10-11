/**
 * electron/sync/service.js
 *
 * Full Supabase Cloud & Offline-First Sync Service for Ifrah Collection POS.
 *
 * Implements:
 * 1. Outbox Push (idempotent upserts, parents before children, batching, retry)
 * 2. Pull with Cursor (last-write-wins, child item/payment merging, totals recalc)
 * 3. Offline clash detection for overlapping dress dates
 * 4. Multi-PC device block numbering and state management
 * 5. Friendly status badges with zero technical jargon
 * 6. Pluggable transport for hermetic offline scenario testing
 */

const fs = require('fs');
const path = require('path');
const { requireRole, ROLES } = require('../auth/roles');
const { getPendingOutbox, markOutboxDone, markOutboxFailed, getOutboxStats } = require('./outbox');

/**
 * Creates the sync service.
 * @param {import('better-sqlite3').Database} db
 * @param {object} options
 * @param {object} [options.apiClient] - Optional mock/custom client for scenario tests
 */
function createSyncService(db, options = {}) {
  let isSyncing = false;
  let customClient = options.apiClient || null;

  // Read credentials from .env.local or process.env
  function getCredentials() {
    let url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    let key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

    if (!url || !key) {
      try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, 'utf8');
          for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
              url = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '');
            } else if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=')) {
              key = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '');
            }
          }
        }
      } catch {}
    }

    const stateRow = db.prepare(`SELECT value FROM sync_state WHERE key = 'shop_id'`).get();
    const shopId = stateRow?.value || 'ifrah-pos-default';

    return { url, key, shopId };
  }

  // Helper to get or set sync_state value
  function getState(key, fallback = '') {
    try {
      const row = db.prepare(`SELECT value FROM sync_state WHERE key = ?`).get(key);
      return row ? row.value : fallback;
    } catch {
      return fallback;
    }
  }

  function setState(key, value) {
    try {
      db.prepare(`
        INSERT INTO sync_state (key, value, updated_at)
        VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).run(key, String(value ?? ''));
    } catch (e) {
      console.warn('[SyncState] Could not set state:', key, e.message);
    }
  }

  // ─── Default HTTP Client for Supabase REST ────────────────────────────────
  const defaultClient = {
    async upsert(tableName, rows) {
      const { url, key } = getCredentials();
      if (!url || !key) throw new Error('Supabase URL or Key not configured.');

      const endpoint = `${url}/rest/v1/${tableName}?on_conflict=sync_id`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(rows),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
      }
      return res.json().catch(() => rows);
    },

    async pull(tableName, { shopId, cursor, limit = 100 }) {
      const { url, key } = getCredentials();
      if (!url || !key) throw new Error('Supabase URL or Key not configured.');

      let query = `shop_id=eq.${encodeURIComponent(shopId)}&order=server_updated_at.asc&limit=${limit}`;
      if (cursor) {
        query += `&server_updated_at=gt.${encodeURIComponent(cursor)}`;
      }

      const endpoint = `${url}/rest/v1/${tableName}?${query}`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Accept': 'application/json',
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
      }
      return res.json();
    },
  };

  const client = customClient || defaultClient;

  // ─── PUSH OUTBOX ──────────────────────────────────────────────────────────
  async function pushOutbox(batchSize = 50) {
    const items = getPendingOutbox(db, batchSize);
    if (!items || items.length === 0) return { pushed: 0, errors: 0 };

    let pushedCount = 0;
    let errorCount = 0;

    const { shopId } = getCredentials();

    for (const item of items) {
      try {
        let payload = JSON.parse(item.payload || '{}');
        payload.shop_id = shopId;
        payload.sync_id = item.record_sync_id;

        // Strip local SQLite transient columns to prevent remote collision
        if (item.table_name !== 'settings') {
          delete payload.id;
        }
        delete payload.sync_status;
        delete payload.last_synced_at;

        // Map column differences between SQLite and Supabase Postgres schema
        if (item.table_name === 'customers') {
          if (payload.phone2 !== undefined) {
            payload.alt_phone = payload.phone2;
            delete payload.phone2;
          }
        } else if (item.table_name === 'dresses') {
          if (payload.code !== undefined) {
            payload.dress_code = payload.code;
            delete payload.code;
          }
          if (payload.rental_price !== undefined) {
            payload.default_rate = payload.rental_price;
            delete payload.rental_price;
          }
        }

        await client.upsert(item.table_name, [payload]);
        markOutboxDone(db, item.id, item.table_name, item.record_sync_id);
        pushedCount++;
      } catch (err) {
        errorCount++;
        markOutboxFailed(db, item.id, err.message);
      }
    }

    return { pushed: pushedCount, errors: errorCount };
  }

  // ─── RECALCULATE BOOKING TOTALS ───────────────────────────────────────────
  function recalculateBookingTotals(bookingId) {
    if (!bookingId) return;

    try {
      const bRow = db.prepare(`SELECT discount FROM bookings WHERE id = ?`).get(bookingId);
      if (!bRow) return;

      const itemsTotal = db.prepare(`
        SELECT COALESCE(SUM(line_total), 0) AS s
        FROM booking_items
        WHERE booking_id = ? AND deleted_at IS NULL
      `).get(bookingId)?.s || 0;

      const paidTotal = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) AS s
        FROM payments
        WHERE booking_id = ? AND is_void = 0 AND kind = 'rental'
      `).get(bookingId)?.s || 0;

      const grandTotal = Math.max(0, itemsTotal - (bRow.discount || 0));
      const remaining  = Math.max(0, grandTotal - paidTotal);

      db.prepare(`
        UPDATE bookings
        SET grand_total = ?, amount_paid = ?, remaining = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?
      `).run(grandTotal, paidTotal, remaining, bookingId);
    } catch (e) {
      console.warn('[Sync] Could not recalculate booking totals:', e.message);
    }
  }

  // ─── CLASH DETECTION AFTER MERGE ──────────────────────────────────────────
  function detectClashes() {
    let clashCount = 0;

    try {
      // Find active bookings that have overlapping delivery/returning dates for the same dress
      const clashingPairs = db.prepare(`
        SELECT DISTINCT
          b1.id AS b1_id, b1.booking_no AS b1_no,
          b2.id AS b2_id, b2.booking_no AS b2_no,
          bi1.dress_id, bi1.dress_name_snapshot
        FROM booking_items bi1
        JOIN bookings b1 ON b1.id = bi1.booking_id
        JOIN booking_items bi2 ON bi2.dress_id = bi1.dress_id AND bi2.booking_id != bi1.booking_id
        JOIN bookings b2 ON b2.id = bi2.booking_id
        WHERE bi1.deleted_at IS NULL AND bi2.deleted_at IS NULL
          AND b1.deleted_at IS NULL AND b2.deleted_at IS NULL
          AND b1.status != 'Closed' AND b2.status != 'Closed'
          AND b1.delivery_date IS NOT NULL AND b1.returning_date IS NOT NULL
          AND b2.delivery_date IS NOT NULL AND b2.returning_date IS NOT NULL
          AND b1.delivery_date <= b2.returning_date
          AND b1.returning_date >= b2.delivery_date
          AND b1.id < b2.id
      `).all();

      for (const pair of clashingPairs) {
        clashCount++;
        const note = `Dress #${pair.dress_id} (${pair.dress_name_snapshot}) dates clash between Booking #${pair.b1_no} and #${pair.b2_no}`;
        
        db.prepare(`
          UPDATE bookings
          SET clash_flag = 1, clash_note = ?
          WHERE id IN (?, ?)
        `).run(note, pair.b1_id, pair.b2_id);

        db.prepare(`
          INSERT INTO audit_logs (action, table_name, record_id, new_values)
          VALUES ('sync.clash_detected', 'bookings', ?, ?)
        `).run(pair.b1_id, JSON.stringify({ clash_note: note, other_booking: pair.b2_no }));
      }
    } catch (e) {
      console.warn('[Sync] Clash detection note:', e.message);
    }

    return clashCount;
  }

  // ─── PULL FROM CLOUD ──────────────────────────────────────────────────────
  async function pullFromCloud() {
    const { shopId } = getCredentials();
    const cursor = getState('last_pull_cursor', '');
    let newCursor = cursor;
    let pulledCount = 0;
    const affectedBookingIds = new Set();

    const TABLE_ORDER = [
      'cities', 'casts', 'relation_types', 'dress_categories',
      'customers', 'dresses', 'bookings', 'booking_items', 'payments', 'settings'
    ];

    for (const table of TABLE_ORDER) {
      try {
        const rows = await client.pull(table, { shopId, cursor, limit: 100 });
        if (!rows || rows.length === 0) continue;

        const applyTx = db.transaction(() => {
          for (const remote of rows) {
            pulledCount++;
            if (remote.server_updated_at && (!newCursor || remote.server_updated_at > newCursor)) {
              newCursor = remote.server_updated_at;
            }

            if (table === 'settings') {
              db.prepare(`
                INSERT INTO settings (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                  value = excluded.value,
                  updated_at = excluded.updated_at
              `).run(remote.key, remote.value, remote.updated_at || new Date().toISOString());
              continue;
            }

            // Look up local record by sync_id
            const existing = db.prepare(`SELECT * FROM ${table} WHERE sync_id = ?`).get(remote.sync_id);

            if (table === 'customers') {
              const phone2Val = remote.phone2 || remote.alt_phone || null;
              if (existing) {
                // Last-write-wins: compare updated_at
                if (!existing.updated_at || remote.updated_at >= existing.updated_at) {
                  db.prepare(`
                    UPDATE customers SET
                      name = ?, phone = ?, phone2 = ?, cnic = ?, address = ?,
                      city_id = ?, cast_id = ?, relation_type_id = ?, relative_name = ?,
                      relative_phone = ?, relative_cnic = ?, notes = ?, deleted_at = ?,
                      sync_status = 'synced', last_synced_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                    WHERE sync_id = ?
                  `).run(
                    remote.name, remote.phone, phone2Val, remote.cnic, remote.address,
                    remote.city_id, remote.cast_id, remote.relation_type_id, remote.relative_name,
                    remote.relative_phone, remote.relative_cnic, remote.notes, remote.deleted_at,
                    remote.sync_id
                  );
                }
              } else {
                db.prepare(`
                  INSERT INTO customers (
                    sync_id, name, phone, phone2, cnic, address,
                    city_id, cast_id, relation_type_id, relative_name, relative_phone, relative_cnic,
                    notes, created_at, updated_at, deleted_at, sync_status, last_synced_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                `).run(
                  remote.sync_id, remote.name, remote.phone, phone2Val, remote.cnic, remote.address,
                  remote.city_id, remote.cast_id, remote.relation_type_id, remote.relative_name,
                  remote.relative_phone, remote.relative_cnic, remote.notes,
                  remote.created_at, remote.updated_at, remote.deleted_at
                );
              }
            } else if (table === 'dresses') {
              const codeVal  = remote.code || remote.dress_code || '';
              const priceVal = remote.rental_price != null ? remote.rental_price : (remote.default_rate || 0);

              if (existing) {
                if (!existing.updated_at || remote.updated_at >= existing.updated_at) {
                  db.prepare(`
                    UPDATE dresses SET
                      code = ?, name = ?, category_id = ?, size = ?,
                      rental_price = ?, photo_path = ?, active = ?, deleted_at = ?,
                      sync_status = 'synced', last_synced_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                    WHERE sync_id = ?
                  `).run(
                    codeVal, remote.name, remote.category_id, remote.size,
                    priceVal, remote.photo_path, remote.active ?? 1, remote.deleted_at,
                    remote.sync_id
                  );
                }
              } else {
                db.prepare(`
                  INSERT INTO dresses (
                    sync_id, code, name, category_id, size,
                    rental_price, photo_path, active, created_at, updated_at, deleted_at,
                    sync_status, last_synced_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                `).run(
                  remote.sync_id, codeVal, remote.name, remote.category_id,
                  remote.size, priceVal, remote.photo_path, remote.active ?? 1,
                  remote.created_at, remote.updated_at, remote.deleted_at
                );
              }
            } else if (table === 'bookings') {
              let custId = remote.customer_id;
              if (custId && !db.prepare(`SELECT id FROM customers WHERE id = ?`).get(custId)) {
                custId = null;
              }
              let cityId = remote.city_id;
              if (cityId && !db.prepare(`SELECT id FROM cities WHERE id = ?`).get(cityId)) {
                cityId = null;
              }

              const secDep = remote.security_deposit || 0;
              const disc   = remote.discount || 0;
              const gTotal = remote.grand_total || 0;
              const aPaid  = remote.amount_paid || 0;
              const rem    = remote.remaining || 0;
              const printCount = remote.receipt_print_count || 0;
              const clashFlag  = remote.clash_flag || 0;

              if (existing) {
                if (!existing.updated_at || remote.updated_at >= existing.updated_at) {
                  db.prepare(`
                    UPDATE bookings SET
                      booking_no = ?, customer_id = ?, city_id = ?, status = ?,
                      booking_date = ?, delivery_date = ?, returning_date = ?, booking_month = ?,
                      total_returning_days = ?, relative_name = ?, relative_relation = ?, notes = ?,
                      delivered_on = ?, delivery_note = ?, returned_on = ?, return_condition = ?,
                      return_damage_note = ?, return_damage_photo = ?, security_deposit = ?, discount = ?,
                      grand_total = ?, amount_paid = ?, remaining = ?, receipt_print_count = ?, clash_flag = ?, deleted_at = ?,
                      sync_status = 'synced', last_synced_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                    WHERE sync_id = ?
                  `).run(
                    remote.booking_no, custId, cityId, remote.status || 'None',
                    remote.booking_date, remote.delivery_date, remote.returning_date, remote.booking_month,
                    remote.total_returning_days, remote.relative_name, remote.relative_relation, remote.notes,
                    remote.delivered_on, remote.delivery_note, remote.returned_on, remote.return_condition,
                    remote.return_damage_note, remote.return_damage_photo, secDep, disc,
                    gTotal, aPaid, rem, printCount, clashFlag, remote.deleted_at,
                    remote.sync_id
                  );
                  affectedBookingIds.add(existing.id);
                }
              } else {
                const r = db.prepare(`
                  INSERT INTO bookings (
                    sync_id, booking_no, customer_id, city_id, status,
                    booking_date, delivery_date, returning_date, booking_month,
                    total_returning_days, relative_name, relative_relation, notes,
                    delivered_on, delivery_note, returned_on, return_condition,
                    return_damage_note, return_damage_photo, security_deposit, discount,
                    grand_total, amount_paid, remaining, receipt_print_count, clash_flag, clash_note,
                    created_at, updated_at, deleted_at,
                    sync_status, last_synced_at
                  ) VALUES (
                    ?, ?, ?, ?, ?,  ?, ?, ?, ?,  ?, ?, ?, ?,  ?, ?, ?, ?,  ?, ?, ?, ?,  ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    'synced', strftime('%Y-%m-%dT%H:%M:%fZ','now')
                  )
                `).run(
                  remote.sync_id, remote.booking_no, custId, cityId, remote.status || 'None',
                  remote.booking_date, remote.delivery_date, remote.returning_date, remote.booking_month,
                  remote.total_returning_days, remote.relative_name, remote.relative_relation, remote.notes,
                  remote.delivered_on, remote.delivery_note, remote.returned_on, remote.return_condition,
                  remote.return_damage_note, remote.return_damage_photo, secDep, disc,
                  gTotal, aPaid, rem, printCount, clashFlag, remote.clash_note || null,
                  remote.created_at || new Date().toISOString(), remote.updated_at || new Date().toISOString(), remote.deleted_at
                );
                affectedBookingIds.add(r.lastInsertRowid);
              }
            } else if (table === 'booking_items') {
              let localBookingId = remote.booking_id;
              if (remote.booking_sync_id) {
                const b = db.prepare(`SELECT id FROM bookings WHERE sync_id = ?`).get(remote.booking_sync_id);
                if (b) localBookingId = b.id;
              } else if (!localBookingId && remote.detail_no) {
                const bNo = Math.floor(remote.detail_no / 100);
                const b = db.prepare(`SELECT id FROM bookings WHERE booking_no = ?`).get(bNo);
                if (b) localBookingId = b.id;
              }

              if (!localBookingId || !db.prepare(`SELECT id FROM bookings WHERE id = ?`).get(localBookingId)) {
                continue;
              }

              let dressId = remote.dress_id;
              if (dressId && !db.prepare(`SELECT id FROM dresses WHERE id = ?`).get(dressId)) {
                dressId = null;
              }

              const qty = remote.quantity || 1;
              const rate = remote.rate || 0;
              const lineTotal = remote.line_total || (qty * rate);

              if (existing) {
                db.prepare(`
                  UPDATE booking_items SET
                    booking_id = ?, line_no = ?, detail_no = ?, dress_id = ?,
                    dress_name_snapshot = ?, size = ?, quantity = ?, rate = ?, line_total = ?,
                    description = ?, jewellery = ?, clutch_purse = ?, hand_bag = ?,
                    double_dupatta = ?, shoes = ?, is_ready = ?, item_condition = ?, deleted_at = ?,
                    sync_status = 'synced', last_synced_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                  WHERE sync_id = ?
                `).run(
                  localBookingId, remote.line_no || 1, remote.detail_no || 1, dressId,
                  remote.dress_name_snapshot || 'Dress', remote.size, qty, rate, lineTotal,
                  remote.description, remote.jewellery || 0, remote.clutch_purse || 0, remote.hand_bag || 0,
                  remote.double_dupatta || 0, remote.shoes || 0, remote.is_ready || 0, remote.item_condition || 'OK',
                  remote.deleted_at, remote.sync_id
                );
              } else {
                db.prepare(`
                  INSERT INTO booking_items (
                    sync_id, booking_id, line_no, detail_no, dress_id,
                    dress_name_snapshot, size, quantity, rate, line_total,
                    description, jewellery, clutch_purse, hand_bag,
                    double_dupatta, shoes, is_ready, item_condition,
                    created_at, updated_at, deleted_at, sync_status, last_synced_at
                  ) VALUES (
                    ?, ?, ?, ?, ?,  ?, ?, ?, ?, ?,  ?, ?, ?, ?,  ?, ?, ?, ?,  ?, ?, ?, 'synced', strftime('%Y-%m-%dT%H:%M:%fZ','now')
                  )
                `).run(
                  remote.sync_id, localBookingId, remote.line_no || 1, remote.detail_no || 1, dressId,
                  remote.dress_name_snapshot || 'Dress', remote.size, qty, rate, lineTotal,
                  remote.description, remote.jewellery || 0, remote.clutch_purse || 0, remote.hand_bag || 0,
                  remote.double_dupatta || 0, remote.shoes || 0, remote.is_ready || 0, remote.item_condition || 'OK',
                  remote.created_at || new Date().toISOString(), remote.updated_at || new Date().toISOString(), remote.deleted_at
                );
              }
              if (localBookingId) affectedBookingIds.add(localBookingId);
            } else if (table === 'payments') {
              let localBookingId = remote.booking_id;
              if (remote.booking_sync_id) {
                const b = db.prepare(`SELECT id FROM bookings WHERE sync_id = ?`).get(remote.booking_sync_id);
                if (b) localBookingId = b.id;
              }

              if (!localBookingId || !db.prepare(`SELECT id FROM bookings WHERE id = ?`).get(localBookingId)) {
                continue;
              }

              let receivedById = remote.received_by;
              if (receivedById && !db.prepare(`SELECT id FROM users WHERE id = ?`).get(receivedById)) {
                receivedById = null;
              }

              let voidedById = remote.voided_by;
              if (voidedById && !db.prepare(`SELECT id FROM users WHERE id = ?`).get(voidedById)) {
                voidedById = null;
              }

              const voidVal = remote.is_void ?? 0;
              const methodVal = remote.payment_method || 'cash';
              const kindVal = remote.kind || 'rental';
              const paidOnVal = remote.paid_on || new Date().toISOString().slice(0, 10);
              const amtVal = remote.amount || 0;

              if (existing) {
                db.prepare(`
                  UPDATE payments SET
                    booking_id = ?, amount = ?, payment_method = ?, kind = ?,
                    received_by = ?, note = ?, paid_on = ?, is_void = ?, void_reason = ?,
                    voided_by = ?, voided_at = ?, sync_status = 'synced',
                    last_synced_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                  WHERE sync_id = ?
                `).run(
                  localBookingId, amtVal, methodVal, kindVal,
                  receivedById, remote.note, paidOnVal, voidVal, remote.void_reason,
                  voidedById, remote.voided_at, remote.sync_id
                );
              } else {
                db.prepare(`
                  INSERT INTO payments (
                    sync_id, booking_id, amount, payment_method, kind,
                    received_by, note, paid_on, is_void, void_reason,
                    voided_by, voided_at, created_at, updated_at, sync_status, last_synced_at
                  ) VALUES (
                    ?, ?, ?, ?, ?,  ?, ?, ?, ?, ?,  ?, ?, ?, ?, 'synced', strftime('%Y-%m-%dT%H:%M:%fZ','now')
                  )
                `).run(
                  remote.sync_id, localBookingId, amtVal, methodVal, kindVal,
                  receivedById, remote.note, paidOnVal, voidVal, remote.void_reason,
                  voidedById, remote.voided_at, remote.created_at || new Date().toISOString(), remote.updated_at || new Date().toISOString()
                );
              }
              if (localBookingId) affectedBookingIds.add(localBookingId);
            }
          }
        });

        applyTx();
      } catch (err) {
        console.warn(`[Sync] Pull failed for table ${table}:`, err.message);
      }
    }

    // Recalculate totals for merged bookings
    for (const bId of affectedBookingIds) {
      recalculateBookingTotals(bId);
    }

    // Detect and flag any clashes
    const clashesDetected = detectClashes();

    if (newCursor !== cursor) {
      setState('last_pull_cursor', newCursor);
    }

    return { pulled: pulledCount, clashes: clashesDetected };
  }

  // ─── SYNC NOW (ORCHESTRATOR) ──────────────────────────────────────────────
  async function syncNow() {
    if (isSyncing) {
      return { ok: false, message: 'Sync pehle se jari hai...', status: 'syncing' };
    }

    const { url, key } = getCredentials();
    if (!url || !key) {
      setState('sync_status', 'offline');
      return {
        ok: false,
        message: 'Supabase credentials set nahi hain. App offline mode me chal rahi hai.',
        status: 'offline',
        stats: getOutboxStats(db),
      };
    }

    isSyncing = true;
    setState('sync_status', 'syncing');

    try {
      // 1. Push pending local changes
      const pushRes = await pushOutbox();

      if (pushRes.errors > 0 && pushRes.pushed === 0) {
        setState('sync_status', 'offline');
        return {
          ok: false,
          status: 'offline',
          message: 'Cloud sync connection failed (changes queued locally).',
          stats: getOutboxStats(db),
        };
      }

      // 2. Pull remote changes
      const pullRes = await pullFromCloud();

      const nowIso = new Date().toISOString();
      setState('last_sync_time', nowIso);
      setState('last_sync_error', '');

      // Check if clashes exist
      const clashRow = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE clash_flag = 1 AND deleted_at IS NULL`).get();
      const hasClash = (clashRow?.c || 0) > 0;

      const finalStatus = hasClash ? 'clash' : 'synced';
      setState('sync_status', finalStatus);

      return {
        ok: true,
        status: finalStatus,
        pushed: pushRes.pushed,
        pulled: pullRes.pulled,
        clashes: pullRes.clashes,
        lastSyncTime: nowIso,
        stats: getOutboxStats(db),
      };
    } catch (err) {
      setState('sync_status', 'offline');
      setState('last_sync_error', err.message);

      return {
        ok: false,
        status: 'offline',
        message: err.message,
        stats: getOutboxStats(db),
      };
    } finally {
      isSyncing = false;
    }
  }

  // ─── GET LIVE STATUS & BADGE ──────────────────────────────────────────────
  function getStatus() {
    const stats = getOutboxStats(db);
    const syncStatus = getState('sync_status', 'idle');
    const lastSyncTime = getState('last_sync_time', '');
    const deviceId = getState('device_id', 'pc_main');
    const deviceName = getState('device_name', 'Counter 1');
    const blockStart = getState('booking_number_start', '412');
    const lastError = getState('last_sync_error', '');

    const clashRow = db.prepare(`
      SELECT COUNT(*) as c FROM bookings
      WHERE clash_flag = 1 AND deleted_at IS NULL AND status != 'Closed'
    `).get();
    const clashCount = clashRow?.c || 0;

    let badge = 'Saved and synced ✓';
    let badgeType = 'success'; // success | warning | danger | info

    if (clashCount > 0) {
      badge = `Needs a look (${clashCount} clash${clashCount > 1 ? 'es' : ''})`;
      badgeType = 'danger';
    } else if (syncStatus === 'syncing') {
      badge = 'Syncing…';
      badgeType = 'info';
    } else if (stats.pending > 0 || syncStatus === 'offline') {
      badge = stats.pending > 0
        ? `Offline — your work is safe (${stats.pending} changes waiting)`
        : 'Offline mode — local work safe';
      badgeType = 'warning';
    } else if (!lastSyncTime) {
      badge = 'Offline mode — local work safe';
      badgeType = 'warning';
    }

    return {
      badge,
      badgeType,
      syncStatus,
      lastSyncTime,
      deviceId,
      deviceName,
      bookingNumberStart: parseInt(blockStart, 10) || 412,
      pendingCount: stats.pending,
      syncedCount: stats.synced,
      errorCount: stats.errors,
      clashCount,
      lastError,
    };
  }

  // ─── SET DEVICE CONFIGURATION (OWNER ONLY) ────────────────────────────────
  function setDeviceConfig(session, { deviceName, bookingNumberStart }) {
    requireRole(session, [ROLES.OWNER]);

    if (deviceName && typeof deviceName === 'string') {
      setState('device_name', deviceName.trim());
    }

    if (bookingNumberStart !== undefined) {
      const num = parseInt(bookingNumberStart, 10);
      if (!isNaN(num) && num > 0) {
        setState('booking_number_start', String(num));
      }
    }

    return { ok: true, status: getStatus() };
  }

  // ─── RESOLVE CLASH (OWNER/CASHIER) ────────────────────────────────────────
  function resolveClash(session, bookingId) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    db.prepare(`UPDATE bookings SET clash_flag = 0, clash_note = NULL WHERE id = ?`).run(bookingId);
    return { ok: true };
  }

  return {
    syncNow,
    getStatus,
    setDeviceConfig,
    resolveClash,
    pushOutbox,
    pullFromCloud,
    detectClashes,
    recalculateBookingTotals,
    getState,
    setState,
    setApiClient: (mock) => { customClient = mock; },
  };
}

module.exports = { createSyncService };
