import db from '../db/index.js';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const MAX_LOGS = 1000;

export function initLogsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      user_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
    CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category);
  `);
}

function cleanOldLogs() {
  const count = db.prepare('SELECT COUNT(*) as count FROM logs').get().count;
  if (count > MAX_LOGS) {
    const deleteCount = count - MAX_LOGS;
    db.prepare(`
      DELETE FROM logs WHERE id IN (
        SELECT id FROM logs ORDER BY created_at ASC LIMIT ?
      )
    `).run(deleteCount);
  }
}

export function log(level, category, message, details = null, req = null) {
  if (!LOG_LEVELS.includes(level)) level = 'info';
  
  const ip = req?.ip || req?.connection?.remoteAddress || null;
  const userId = req?.session?.userId || null;
  const detailsJson = details ? JSON.stringify(details) : null;
  
  db.prepare(`
    INSERT INTO logs (level, category, message, details, ip, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(level, category, message, detailsJson, ip, userId);
  
  cleanOldLogs();
  
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${category}]`;
  if (level === 'error') {
    console.error(prefix, message, details || '');
  } else if (level === 'warn') {
    console.warn(prefix, message, details || '');
  } else {
    console.log(prefix, message, details || '');
  }
}

export function getLogs(options = {}) {
  const { level, category, limit = 100, offset = 0 } = options;
  
  let query = 'SELECT l.*, u.username FROM logs l LEFT JOIN users u ON l.user_id = u.id WHERE 1=1';
  const params = [];
  
  if (level) {
    query += ' AND l.level = ?';
    params.push(level);
  }
  if (category) {
    query += ' AND l.category = ?';
    params.push(category);
  }
  
  query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  return db.prepare(query).all(...params);
}

export function getLogStats() {
  const total = db.prepare('SELECT COUNT(*) as count FROM logs').get().count;
  const byLevel = db.prepare(`
    SELECT level, COUNT(*) as count FROM logs GROUP BY level
  `).all();
  const byCategory = db.prepare(`
    SELECT category, COUNT(*) as count FROM logs GROUP BY category ORDER BY count DESC LIMIT 10
  `).all();
  
  return { total, byLevel, byCategory };
}

export function clearLogs() {
  const result = db.prepare('DELETE FROM logs').run();
  return result.changes;
}

export const logger = {
  debug: (category, message, details, req) => log('debug', category, message, details, req),
  info: (category, message, details, req) => log('info', category, message, details, req),
  warn: (category, message, details, req) => log('warn', category, message, details, req),
  error: (category, message, details, req) => log('error', category, message, details, req)
};
