function withAudit(db, user, action, tableName, recordId, changes, write) {
  if (!user) throw new Error('A user is required for audited writes.');

  const transaction = db.transaction(() => {
    const result = write();
    const resolvedRecordId = typeof recordId === 'function' ? recordId(result) : recordId;
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      action,
      tableName,
      resolvedRecordId ?? null,
      changes?.oldValues ? JSON.stringify(changes.oldValues) : null,
      changes?.newValues ? JSON.stringify(changes.newValues) : null,
    );

    // Phase 13: Enqueue write to sync_outbox within the same atomic transaction
    if (tableName && resolvedRecordId != null) {
      try {
        let syncId = null;
        let payload = null;

        if (tableName === 'settings') {
          syncId = String(resolvedRecordId);
          payload = changes?.newValues || { key: resolvedRecordId };
        } else {
          // Attempt to fetch full row with sync_id
          const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(resolvedRecordId);
          if (row && row.sync_id) {
            syncId = row.sync_id;
            payload = row;
          }
        }

        if (syncId && payload) {
          const act = String(action).toLowerCase();
          const operation = act.includes('delete') ? 'DELETE'
            : (act.includes('create') || !changes?.oldValues) ? 'INSERT'
            : 'UPDATE';

          db.prepare(`
            INSERT INTO sync_outbox (
              table_name, operation, record_sync_id, payload, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'pending', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          `).run(tableName, operation, syncId, JSON.stringify(payload));
        }
      } catch (syncErr) {
        // Non-blocking if table lacks sync columns
      }
    }

    return result;
  });

  return transaction();
}

module.exports = { withAudit };