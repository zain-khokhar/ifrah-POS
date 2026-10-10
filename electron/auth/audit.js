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
    return result;
  });

  return transaction();
}

module.exports = { withAudit };