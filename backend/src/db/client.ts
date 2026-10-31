import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { config } from '../config.ts'
import * as schema from './schema.ts'

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 })
export const db = drizzle(pool, { schema, casing: 'snake_case' })

/** Applies any SQL migrations in src/db/migrations that haven't run yet. */
export function runMigrations() {
  return migrate(db, { migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)) })
}

/** Postgres "unique_violation", e.g. an email that's already registered. */
export const isUniqueViolation = (e: unknown, constraint?: string) => {
  const err = (e as { cause?: unknown })?.cause ?? e
  const pgErr = err as { code?: string; constraint?: string }
  return pgErr?.code === '23505' && (!constraint || pgErr.constraint === constraint)
}
