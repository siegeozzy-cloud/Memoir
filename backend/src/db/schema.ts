import { boolean, doublePrecision, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

// Column names are snake_case in the database (drizzle `casing`), camelCase here.

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()
const id = () => uuid().primaryKey().defaultRandom()

export const presence = pgEnum('presence', ['online', 'idle', 'dnd', 'offline'])
export const mediaKind = pgEnum('media_kind', ['image', 'video'])

export const users = pgTable(
  'users',
  {
    id: id(),
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
    /** Show friends what you're playing on Spotify. */
    shareActivity: boolean().notNull().default(true),
    /** Sign-in is refused until the confirmation link has been opened. */
    emailVerifiedAt: timestamp({ withTimezone: true }),
    termsAcceptedAt: timestamp({ withTimezone: true }).notNull(),
    /** Hidden until the next sign-in. */
    deactivatedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_key').on(t.email), uniqueIndex('users_unique_id_key').on(t.uniqueId), index('users_name_idx').on(t.name)],
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

/* ---------------- friends ---------------- */

/** Waiting for the other person to accept. Removed once accepted or declined. */
export const friendRequests = pgTable(
  'friend_requests',
  {
    id: id(),
    fromUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('friend_requests_pair_key').on(t.fromUserId, t.toUserId), index('friend_requests_to_idx').on(t.toUserId)],
)

/** Two rows per friendship (one each way), so "my friends" is a single lookup. */
export const friendships = pgTable(
  'friendships',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    friendId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.friendId] })],
)

/* ---------------- messaging ---------------- */

export const conversations = pgTable(
  'conversations',
  {
    id: id(),
    /** For a direct conversation: both user ids, smallest first, so there can only ever be one. */
    dmKey: text(),
    lastActivityAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('conversations_dm_key').on(t.dmKey)],
)

/** One row per person in a conversation, holding the settings only they see. */
export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    nickname: text(),
    color: text().notNull().default('blue'),
    background: text().notNull().default('plain'),
    lastReadAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** "Delete conversation": hidden from this person's list, and messages up to here stay hidden. */
    clearedAt: timestamp({ withTimezone: true }),
    hidden: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index('conversation_members_user_idx').on(t.userId)],
)

export const messages = pgTable(
  'messages',
  {
    id: id(),
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text(),
    /** Sent on from another conversation. */
    forwarded: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)],
)

export const messageAttachments = pgTable(
  'message_attachments',
  {
    id: id(),
    messageId: uuid()
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    kind: mediaKind().notNull(),
    /** File name in UPLOAD_DIR/media. */
    file: text().notNull(),
    name: text().notNull(),
    width: integer(),
    height: integer(),
    position: integer().notNull().default(0),
  },
  (t) => [index('message_attachments_message_idx').on(t.messageId)],
)

/** "Delete for you": the message stays for everyone else. */
export const messageHides = pgTable(
  'message_hides',
  {
    messageId: uuid()
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId] })],
)

/* ---------------- memories (posts and albums) ---------------- */

export const memories = pgTable(
  'memories',
  {
    id: id(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    placeName: text().notNull(),
    country: text().notNull(),
    countryCode: text(),
    lat: doublePrecision().notNull(),
    lon: doublePrecision().notNull(),
    capturedAt: timestamp({ withTimezone: true }).notNull(),
    /** Recently Deleted; emptied after RECENTLY_DELETED_DAYS. */
    deletedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('memories_owner_idx').on(t.ownerId)],
)

export const memoryItems = pgTable(
  'memory_items',
  {
    id: id(),
    memoryId: uuid()
      .notNull()
      .references(() => memories.id, { onDelete: 'cascade' }),
    kind: mediaKind().notNull(),
    /** File name in UPLOAD_DIR/media. */
    file: text().notNull(),
    name: text(),
    width: integer(),
    height: integer(),
    position: integer().notNull().default(0),
  },
  (t) => [index('memory_items_memory_idx').on(t.memoryId)],
)

/** Tagged people. A post is visible to its owner and to these people only. */
export const memoryTags = pgTable(
  'memory_tags',
  {
    memoryId: uuid()
      .notNull()
      .references(() => memories.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.memoryId, t.userId] }), index('memory_tags_user_idx').on(t.userId)],
)

export type UserRow = typeof users.$inferSelect
