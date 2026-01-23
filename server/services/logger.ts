import type { Request } from 'express';
import db from '../db/index.js';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];
const MAX_LOGS = 1000;

interface CountRow {
  count: number;
}

interface LogRow {
  id: number;
  level: string;
  category: string;
  message: string;
  details: string | null;
  ip: string | null;
  user_id: number | null;
  created_at: string;
  username?: string;
}

interface LevelCount {
  level: string;
  count: number;
}

interface CategoryCount {
  category: string;
  count: number;
}

export function initLogsTable(): void {
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

function cleanOldLogs(): void {
  const row = db.prepare('SELECT COUNT(*) as count FROM logs').get() as CountRow;
  const count = row.count;
  if (count > MAX_LOGS) {
    const deleteCount = count - MAX_LOGS;
    db.prepare(
      `
      DELETE FROM logs WHERE id IN (
        SELECT id FROM logs ORDER BY created_at ASC LIMIT ?
      )
    `
    ).run(deleteCount);
  }
}

function log(
  level: string,
  category: string,
  message: string,
  details: unknown = null,
  req: Request | null = null
): void {
  if (!LOG_LEVELS.includes(level as LogLevel)) level = 'info';

  const ip = req?.ip || null;
  const userId = (req as { session?: { userId?: number } } | null)?.session?.userId ?? null;
  const detailsJson = details ? JSON.stringify(details) : null;

  db.prepare(
    `
    INSERT INTO logs (level, category, message, details, ip, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(level, category, message, detailsJson, ip, userId);

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

interface GetLogsOptions {
  level?: string | undefined;
  category?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export function getLogs(options: GetLogsOptions = {}): LogRow[] {
  const { level, category, limit = 100, offset = 0 } = options;

  let query = 'SELECT l.*, u.username FROM logs l LEFT JOIN users u ON l.user_id = u.id WHERE 1=1';
  const params: (string | number)[] = [];

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

  return db.prepare(query).all(...params) as LogRow[];
}

interface LogStats {
  total: number;
  byLevel: LevelCount[];
  byCategory: CategoryCount[];
}

export function getLogStats(): LogStats {
  const totalRow = db.prepare('SELECT COUNT(*) as count FROM logs').get() as CountRow;
  const total = totalRow.count;
  const byLevel = db
    .prepare(
      `
    SELECT level, COUNT(*) as count FROM logs GROUP BY level
  `
    )
    .all() as LevelCount[];
  const byCategory = db
    .prepare(
      `
    SELECT category, COUNT(*) as count FROM logs GROUP BY category ORDER BY count DESC LIMIT 10
  `
    )
    .all() as CategoryCount[];

  return { total, byLevel, byCategory };
}

export function clearLogs(): number {
  const result = db.prepare('DELETE FROM logs').run();
  return result.changes;
}

export const logger = {
  debug: (category: string, message: string, details?: unknown, req?: Request | null) =>
    log('debug', category, message, details, req ?? null),
  info: (category: string, message: string, details?: unknown, req?: Request | null) =>
    log('info', category, message, details, req ?? null),
  warn: (category: string, message: string, details?: unknown, req?: Request | null) =>
    log('warn', category, message, details, req ?? null),
  error: (category: string, message: string, details?: unknown, req?: Request | null) =>
    log('error', category, message, details, req ?? null),
};
