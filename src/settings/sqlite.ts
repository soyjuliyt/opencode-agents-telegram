import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getRuntimePaths } from "../runtime/paths.js";
import { logger } from "../utils/logger.js";

interface MigrationLogRow {
  source: string;
  operation: string;
  detail: string | null;
  created_at: number;
}

let db: Database.Database | null = null;

function getSettingsDbPath(): string {
  return getRuntimePaths().settingsDbFilePath;
}

export function ensureSettingsDb(): void {
  if (db) {
    return;
  }

  const dbPath = getSettingsDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const database = new Database(dbPath);
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");

  database.exec(`
    CREATE TABLE IF NOT EXISTS settings_store (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      document TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings_migration_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      operation TEXT NOT NULL,
      detail TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  db = database;
}

function getDb(): Database.Database {
  ensureSettingsDb();
  return db as Database.Database;
}

export function readSettingsDocument(): unknown {
  const database = getDb();
  const row = database
    .prepare("SELECT document FROM settings_store WHERE id = 1")
    .get() as { document?: unknown } | undefined;

  if (!row || typeof row.document !== "string") {
    return undefined;
  }

  try {
    return JSON.parse(row.document) as unknown;
  } catch (error) {
    logger.error("[SettingsStorage] Stored settings document is not valid JSON", error);
    return undefined;
  }
}

export function writeSettingsDocument(document: unknown): void {
  const database = getDb();
  const serialized = JSON.stringify(document);
  const updatedAt = Date.now();

  database
    .prepare(
      `
        INSERT INTO settings_store (id, document, updated_at)
        VALUES (1, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          document = excluded.document,
          updated_at = excluded.updated_at
      `,
    )
    .run(serialized, updatedAt);
}

export function logSettingsMigration(source: string, operation: string, detail?: string): void {
  const database = getDb();
  database
    .prepare(
      `
        INSERT INTO settings_migration_log (source, operation, detail, created_at)
        VALUES (?, ?, ?, ?)
      `,
    )
    .run(source, operation, detail ?? null, Date.now());
}

export function getSettingsMigrationLog(): MigrationLogRow[] {
  const database = getDb();
  return database
    .prepare(
      `
        SELECT source, operation, detail, created_at
        FROM settings_migration_log
        ORDER BY id ASC
      `,
    )
    .all() as MigrationLogRow[];
}

export function closeSettingsDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}