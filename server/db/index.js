import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = process.env.DATABASE_PATH || join(__dirname, '../../data/voterr.db');

const dataDir = dirname(dbPath);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export async function initDatabase() {
  db.exec(`
    -- Users table: both Plex users and local users
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plex_id TEXT UNIQUE,
      plex_token TEXT,
      username TEXT NOT NULL,
      email TEXT,
      avatar_url TEXT,
      is_local INTEGER DEFAULT 0,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Groups table: collections of users who watch together
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      max_votes_per_user INTEGER DEFAULT 3,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Group memberships
    CREATE TABLE IF NOT EXISTS group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member',
      joined_at TEXT DEFAULT (datetime('now')),
      UNIQUE(group_id, user_id)
    );

    -- Schedules: recurring or one-off movie nights
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      day_of_week INTEGER,
      time TEXT DEFAULT '20:00',
      recurrence_type TEXT DEFAULT 'weekly',
      advance_count INTEGER DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Movie nights: specific instances of scheduled events
    CREATE TABLE IF NOT EXISTS movie_nights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      time TEXT DEFAULT '20:00',
      host_id INTEGER REFERENCES users(id),
      winning_movie_id INTEGER REFERENCES nominations(id) ON DELETE SET NULL,
      status TEXT DEFAULT 'voting',
      is_cancelled INTEGER DEFAULT 0,
      cancel_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Nominations: movies proposed for a movie night
    CREATE TABLE IF NOT EXISTS nominations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_night_id INTEGER REFERENCES movie_nights(id) ON DELETE CASCADE,
      plex_rating_key TEXT,
      tmdb_id INTEGER,
      media_type TEXT DEFAULT 'plex',
      title TEXT NOT NULL,
      year INTEGER,
      poster_url TEXT,
      overview TEXT,
      runtime INTEGER,
      nominated_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(movie_night_id, plex_rating_key),
      UNIQUE(movie_night_id, tmdb_id)
    );

    -- Votes: user votes on nominations (each user has 3 votes per movie night)
    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nomination_id INTEGER REFERENCES nominations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      vote_count INTEGER DEFAULT 1,
      has_watched INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(nomination_id, user_id)
    );

    -- Blocks: users who watched a movie can block it from being picked
    CREATE TABLE IF NOT EXISTS nomination_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nomination_id INTEGER REFERENCES nominations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(nomination_id, user_id)
    );

    -- Attendance: user presence for movie nights
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_night_id INTEGER REFERENCES movie_nights(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(movie_night_id, user_id)
    );

    -- Guest invites: hashed links for non-Plex users
    CREATE TABLE IF NOT EXISTS guest_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      movie_night_id INTEGER REFERENCES movie_nights(id) ON DELETE CASCADE,
      created_by INTEGER REFERENCES users(id),
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Settings table: application configuration
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
    CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_movie_nights_group ON movie_nights(group_id);
    CREATE INDEX IF NOT EXISTS idx_movie_nights_date ON movie_nights(date);
    CREATE INDEX IF NOT EXISTS idx_nominations_movie_night ON nominations(movie_night_id);
    CREATE INDEX IF NOT EXISTS idx_votes_nomination ON votes(nomination_id);
    CREATE INDEX IF NOT EXISTS idx_votes_user ON votes(user_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_movie_night ON attendance(movie_night_id);
    CREATE INDEX IF NOT EXISTS idx_guest_invites_token ON guest_invites(token);
    CREATE INDEX IF NOT EXISTS idx_schedules_group ON schedules(group_id);
    CREATE INDEX IF NOT EXISTS idx_nomination_blocks_nomination ON nomination_blocks(nomination_id);
  `);

  // Migration: add image_url to groups if not exists
  const groupColumns = db.prepare("PRAGMA table_info(groups)").all();
  if (!groupColumns.some(c => c.name === 'image_url')) {
    db.exec("ALTER TABLE groups ADD COLUMN image_url TEXT");
  }
  if (!groupColumns.some(c => c.name === 'max_votes_per_user')) {
    db.exec("ALTER TABLE groups ADD COLUMN max_votes_per_user INTEGER DEFAULT 3");
  }

  console.log('Database initialized');
}

export default db;
