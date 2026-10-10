/**
 * electron/settings/service.js
 *
 * Settings service for Ifrah Collection POS.
 * Stores and manages shop details, receipt footers, and printer preferences.
 */

const { requireRole, ROLES } = require('../auth/roles');
const { withAudit } = require('../auth/audit');

function createSettingsService(db) {
  function getSettings(session) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const map = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return map;
  }

  function updateSettings(session, newSettings) {
    requireRole(session, [ROLES.OWNER]);

    if (!newSettings || typeof newSettings !== 'object') {
      throw new Error('Settings object is required.');
    }

    const oldSettings = getSettings(session);
    const user = session?.user || session;

    return withAudit(
      db,
      user,
      'SETTINGS_UPDATED',
      'settings',
      1,
      { oldValues: oldSettings, newValues: newSettings },
      () => {
        const upsert = db.prepare(`
          INSERT INTO settings (key, value, updated_at)
          VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `);

        for (const [key, val] of Object.entries(newSettings)) {
          if (val !== undefined && val !== null) {
            upsert.run(key, String(val));
          }
        }

        return { ok: true, data: getSettings(session) };
      }
    );
  }

  return {
    getSettings,
    updateSettings,
  };
}

module.exports = { createSettingsService };
