import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

export interface OpenDatabaseOptions {
  readonly databasePath: string;
}

export interface DatabaseHandle {
  readonly databasePath: string;
  readonly database: BetterSqliteDatabase;
  close(): void;
}

export const openDatabase = ({ databasePath }: OpenDatabaseOptions): DatabaseHandle => {
  if (databasePath.trim().length === 0) {
    throw new Error("databasePath must not be empty");
  }

  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");

  return {
    databasePath,
    database,
    close: () => {
      database.close();
    },
  };
};
