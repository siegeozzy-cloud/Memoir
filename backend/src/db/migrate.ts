import { pool, runMigrations } from './client.ts'

// `npm run db:migrate`. The server also runs this on start.
await runMigrations()
await pool.end()
console.log('Database is up to date.')
