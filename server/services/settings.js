import db from '../db/index.js';

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value || null;
}

const SENSITIVE_KEYS = ['plex_token', 'overseerr_api_key', 'tautulli_api_key', 'tmdb_api_key', 'session_secret', 'radarr_api_key'];

export function getSafeSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const row of rows) {
    if (SENSITIVE_KEYS.includes(row.key)) {
      result[row.key] = row.value ? '••••••••' : null;
    } else {
      result[row.key] = row.value;
    }
  }
  return result;
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `).run(key, value, value);
}

export function setSettings(settings) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `);

  const transaction = db.transaction((items) => {
    for (const [key, value] of Object.entries(items)) {
      stmt.run(key, value, value);
    }
  });

  transaction(settings);
}

export function isSetupComplete() {
  const plexToken = getSetting('plex_token');
  return !!plexToken;
}

export function getPlexToken() {
  return getSetting('plex_token') || process.env.PLEX_TOKEN;
}

