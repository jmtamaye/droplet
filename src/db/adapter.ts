/**
 * Compatibility adapter that wraps sql.js with a better-sqlite3-like
 * synchronous API. This lets the rest of the codebase use the same
 * db.prepare(sql).run/get/all pattern without any changes.
 *
 * sql.js is pure WebAssembly — no native compilation required,
 * so it works on every OS/architecture without Visual Studio or build tools.
 */

// @ts-ignore -- sql.js ships without type declarations
import initSqlJs from 'sql.js';
import fs from 'fs';

// ── Statement wrapper ────────────────────────────────────────────────

export class Statement {
  constructor(private db: any, private sql: string) {}

  run(...params: any[]): { changes: number } {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    this.db.run(this.sql, flat);
    return { changes: this.db.getRowsModified() };
  }

  get(...params: any[]): any {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const stmt = this.db.prepare(this.sql);
    try {
      stmt.bind(flat);
      if (stmt.step()) {
        return stmt.getAsObject();
      }
      return undefined;
    } finally {
      stmt.free();
    }
  }

  all(...params: any[]): any[] {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const results: any[] = [];
    const stmt = this.db.prepare(this.sql);
    try {
      stmt.bind(flat);
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
    } finally {
      stmt.free();
    }
    return results;
  }
}

// ── Database wrapper ─────────────────────────────────────────────────

export class Database {
  private db: any;
  private filePath: string | null;

  constructor(db: any, filePath: string | null) {
    this.db = db;
    this.filePath = filePath;
  }

  prepare(sql: string): Statement {
    return new Statement(this.db, sql);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(directive: string): void {
    this.db.exec(`PRAGMA ${directive};`);
  }

  /** Persist the in-memory database to disk (if a file path was given). */
  save(): void {
    if (this.filePath) {
      const data = this.db.export();
      fs.writeFileSync(this.filePath, Buffer.from(data));
    }
  }

  close(): void {
    this.save();
    this.db.close();
  }
}

// ── Factory functions ────────────────────────────────────────────────

let sqlPromise: Promise<any> | undefined;

function getSql(): Promise<any> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs();
  }
  return sqlPromise!;
}

/**
 * Create a Database backed by a file. If the file exists, it is loaded.
 * Must be called with await since sql.js init is async.
 */
export async function openDatabase(filePath: string): Promise<Database> {
  const SQL = await getSql();
  let db: any;

  if (fs.existsSync(filePath)) {
    const buffer = fs.readFileSync(filePath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  return new Database(db, filePath);
}

/**
 * Create an in-memory database (for tests).
 */
export async function openMemoryDatabase(): Promise<Database> {
  const SQL = await getSql();
  const db = new SQL.Database();
  return new Database(db, null);
}
