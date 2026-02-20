/**
 * SQLite schema definitions and database initialization.
 */

import path from 'path';
import { Database, openDatabase, openMemoryDatabase } from './adapter';

export type { Database };

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS institutions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  symbol TEXT,
  name TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  current_price REAL,
  price_as_of TEXT,
  metadata TEXT,  -- JSON blob
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS holdings (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  quantity REAL NOT NULL,
  cost_basis REAL NOT NULL DEFAULT 0,
  current_value REAL NOT NULL DEFAULT 0,
  as_of_date TEXT NOT NULL DEFAULT (date('now')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  UNIQUE(name, category)
);

CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  weight REAL NOT NULL DEFAULT 1.0,
  source TEXT NOT NULL DEFAULT 'manual',
  PRIMARY KEY (asset_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_accounts_institution ON accounts(institution_id);
CREATE INDEX IF NOT EXISTS idx_holdings_account ON holdings(account_id);
CREATE INDEX IF NOT EXISTS idx_holdings_asset ON holdings(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_tags_asset ON asset_tags(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_tags_tag ON asset_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol);
`;

/** Migrate the tags table from UNIQUE(name) to UNIQUE(name, category) if needed. */
function migrateTags(db: Database): void {
  // Check if old unique index on just 'name' exists (sqlite_master stores the original DDL)
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tags'").get() as any;
  if (!tableInfo) return; // table doesn't exist yet, will be created fresh
  // If the DDL has 'UNIQUE(name, category)' we're already migrated
  if (tableInfo.sql && /UNIQUE\s*\(\s*name\s*,\s*category\s*\)/i.test(tableInfo.sql)) return;

  // Rebuild the table with the new constraint
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      UNIQUE(name, category)
    );
    INSERT OR IGNORE INTO tags_new SELECT * FROM tags;
    DROP TABLE tags;
    ALTER TABLE tags_new RENAME TO tags;
  `);
  db.pragma('foreign_keys = ON');
}

export async function createDatabase(dbPath?: string): Promise<Database> {
  const resolvedPath = dbPath || path.join(process.cwd(), 'portfolio.db');
  const db = await openDatabase(resolvedPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrateTags(db);
  db.exec(SCHEMA_SQL);

  return db;
}

export async function createInMemoryDatabase(): Promise<Database> {
  const db = await openMemoryDatabase();
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}
