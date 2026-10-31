import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

// Column names are snake_case in the database (drizzle `casing`), camelCase here.

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()

export const presence = pgEnum('presence', ['online', 'idle', 'dnd', 'offline'])

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Always stored lowercased. */
    email: text().notNull(),
    passwordHash: text().notNull(),
    name: text().notNull(),
    status: presence().notNull().default('online'),
    /** File name in UPLOAD_DIR/avatars. */
    avatarFile: text(),
    /** Public and permanent, e.g. MMR-7K2Q-9XA4: friends find you by it. */
    uniqueId: text().notNull(),
    notifyMessages: boolean().notNull().default(true),
    notifyTags: boolean().notNull().default(true),
    notifyFriendRequests: boolean().notNull().default(true),
    /** Sign-in is refused until the confirmation link has been opened. */
    emailVerifiedAt: timestamp({ withTimezone: true }),
    termsAcceptedAt: timestamp({ withTimezone: true }).notNull(),
    /** Hidden until the next sign-in. */
    deactivatedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_key').on(t.email), uniqueIndex('users_unique_id_key').on(t.uniqueId)],
)

/** Signed-in browsers. The cookie holds a random token; only its SHA-256 is stored. */
export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    remember: boolean().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

export const emailTokenPurpose = pgEnum('email_token_purpose', ['verify', 'reset'])

/** Links sent by email (confirm address; password reset later). Only the token's SHA-256 is stored. */
export const emailTokens = pgTable(
  'email_tokens',
  {
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: emailTokenPurpose().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('email_tokens_user_idx').on(t.userId)],
)

/** A linked Spotify account. Tokens are encrypted (AES-256-GCM, TOKEN_KEY). */
export const spotifyLinks = pgTable('spotify_links', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  spotifyUserId: text().notNull(),
  displayName: text(),
  accessToken: text().notNull(),
  refreshToken: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  scope: text().notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export type UserRow = typeof users.$inferSelect
