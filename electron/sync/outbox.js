/**
 * electron/sync/outbox.js
 *
 * Local outbox queue management for Phase 13 offline sync.
 * Guarantees every write is queued within the same SQLite transaction.
 */

/**
 * Enqueue a change into sync_outbox.
 * @param {import('better-sqlite3').Database} db
 * @param {string} tableName
 * @param {'INSERT'|'UPDATE'|'DELETE'} operation
 * @param {string} recordSyncId
 * @param {object|string} payload
 */
function enqueueOutbox(db, tableName, operation, recordSyncId, payload) {
  if (!db || !tableName || !recordSyncId) return null;

  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
  const stmt = db.prepare(`
    INSERT INTO sync_outbox (table_name, operation, record_sync_id, payload, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `);

  return stmt.run(tableName, operation, recordSyncId, payloadStr);
}

/**
 * Fetch pending items in outbox sorted by ID.
 * Priority order: parents before children
 * (customers/dresses/users/lists -> bookings -> booking_items -> payments -> settings/audit)
 */
function getPendingOutbox(db, limit = 100) {
  const TABLE_PRIORITY = `
    CASE table_name
      WHEN 'shops' THEN 1
      WHEN 'users' THEN 2
      WHEN 'cities' THEN 3
      WHEN 'casts' THEN 4
      WHEN 'relation_types' THEN 5
      WHEN 'dress_categories' THEN 6
      WHEN 'customers' THEN 7
      WHEN 'dresses' THEN 8
      WHEN 'bookings' THEN 9
      WHEN 'booking_items' THEN 10
      WHEN 'payments' THEN 11
      WHEN 'settings' THEN 12
      ELSE 20
    END
  `;

  return db.prepare(`
    SELECT * FROM sync_outbox
    WHERE status IN ('pending', 'failed') AND attempts < 10
    ORDER BY ${TABLE_PRIORITY} ASC, id ASC
    LIMIT ?
  `).all(limit);
}

/**
 * Mark an outbox row as processed and update entity sync_status.
 */
function markOutboxDone(db, outboxId, tableName, recordSyncId) {
  const updateOutbox = db.prepare(`
    UPDATE sync_outbox
    SET status = 'done', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `);

  const updateEntity = tableName && recordSyncId ? db.prepare(`
    UPDATE ${tableName}
    SET sync_status = 'synced', last_synced_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE sync_id = ?
  `) : null;

  const tx = db.transaction(() => {
    updateOutbox.run(outboxId);
    if (updateEntity) {
      try { updateEntity.run(recordSyncId); } catch {}
    }
  });

  return tx();
}

/**
 * Mark an outbox item as failed with error details and backoff.
 */
function markOutboxFailed(db, outboxId, errorMessage) {
  return db.prepare(`
    UPDATE sync_outbox
    SET status = 'failed',
        attempts = attempts + 1,
        last_error = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).run(String(errorMessage || 'Unknown sync error').slice(0, 500), outboxId);
}

/**
 * Get count statistics of pending, done, and failed outbox items.
 */
function getOutboxStats(db) {
  const row = db.prepare(`
    SELECT
      COUNT(CASE WHEN status IN ('pending', 'failed') THEN 1 END) AS pending_count,
      COUNT(CASE WHEN status = 'done' THEN 1 END) AS synced_count,
      COUNT(CASE WHEN status = 'failed' AND attempts >= 10 THEN 1 END) AS error_count,
      COUNT(*) AS total_count
    FROM sync_outbox
  `).get();

  return {
    pending: row?.pending_count || 0,
    synced: row?.synced_count || 0,
    errors: row?.error_count || 0,
    total: row?.total_count || 0,
  };
}

module.exports = {
  enqueueOutbox,
  getPendingOutbox,
  markOutboxDone,
  markOutboxFailed,
  getOutboxStats,
};
