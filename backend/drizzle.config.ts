import { defineConfig } from 'drizzle-kit'

// `npm run db:generate` turns changes in src/db/schema.ts into a new SQL migration in src/db/migrations.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://memoir:memoir@127.0.0.1:5432/memoir' },
})
