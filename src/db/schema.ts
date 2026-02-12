/**
 * SQLite schema definitions and database initialization.
 */

import Database from 'better-sqlite3';
import path from 'path';

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
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT
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

export function createDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath || path.join(process.cwd(), 'portfolio.db');
  const db = new Database(resolvedPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(SCHEMA_SQL);

  return db;
}

export function createInMemoryDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}
