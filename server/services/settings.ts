import db from '../db/index.js';

interface SettingRow {
  key: string;
  value: string | null;
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | SettingRow
    | undefined;
  return row?.value ?? null;
}

const SENSITIVE_KEYS = [
  'plex_token',
  'overseerr_api_key',
  'tautulli_api_key',
  'tmdb_api_key',
  'session_secret',
  'radarr_api_key',
];

export function getSafeSettings(): Record<string, string | null> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as SettingRow[];
  const result: Record<string, string | null> = {};
  for (const row of rows) {
    if (SENSITIVE_KEYS.includes(row.key)) {
      result[row.key] = row.value ? '••••••••' : null;
    } else {
      result[row.key] = row.value;
    }
  }
  return result;
}

export function setSetting(key: string, value: string | null): void {
  db.prepare(
    `
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `
  ).run(key, value, value);
}

export function setSettings(settings: Record<string, string | null>): void {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `);

  const transaction = db.transaction((items: Record<string, string | null>) => {
    for (const [key, value] of Object.entries(items)) {
      stmt.run(key, value, value);
    }
  });

  transaction(settings);
}

export function isSetupComplete(): boolean {
  const plexToken = getSetting('plex_token');
  return !!plexToken;
}

export function getPlexToken(): string | null {
  return getSetting('plex_token') || process.env.PLEX_TOKEN || null;
}
