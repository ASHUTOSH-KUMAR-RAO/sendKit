import { randomUUID } from "node:crypto";
import type { } from "bun";
import { db } from "./db";

export type User = {
  id: string;
  username: string;
  telegramBotToken: string | null;
};

// -----------------------------------------------------------------------
// Create a new user
// -----------------------------------------------------------------------
// Passwords are hashed using Bun's built-in `Bun.password` API (bcrypt
// under the hood) — we NEVER store the plain text password.
export async function createUser(
  username: string,
  password: string,
): Promise<User> {
  const existing = db
    .query("SELECT id FROM users WHERE username = ?")
    .get(username);

  if (existing) {
    throw new Error("Username already taken");
  }

  const id = randomUUID();
  const passwordHash = await Bun.password.hash(password);

  db.query(
    "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
  ).run(id, username, passwordHash);

  return { id, username, telegramBotToken: null };
}

// -----------------------------------------------------------------------
// Verify username + password (used during login)
// -----------------------------------------------------------------------
export async function verifyUser(
  username: string,
  password: string,
): Promise<User | null> {
  const row = db
    .query(
      "SELECT id, username, password_hash, telegram_bot_token FROM users WHERE username = ?",
    )
    .get(username) as
    | {
        id: string;
        username: string;
        password_hash: string;
        telegram_bot_token: string | null;
      }
    | undefined;

  if (!row) return null;

  const passwordMatches = await Bun.password.verify(
    password,
    row.password_hash,
  );

  if (!passwordMatches) return null;

  return {
    id: row.id,
    username: row.username,
    telegramBotToken: row.telegram_bot_token,
  };
}

// -----------------------------------------------------------------------
// Get a user by ID (used when validating an access token)
// -----------------------------------------------------------------------
export function getUserById(id: string): User | null {
  const row = db
    .query("SELECT id, username, telegram_bot_token FROM users WHERE id = ?")
    .get(id) as
    | { id: string; username: string; telegram_bot_token: string | null }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    telegramBotToken: row.telegram_bot_token,
  };
}

// -----------------------------------------------------------------------
// Set/update a user's Telegram bot token
// -----------------------------------------------------------------------
export function setTelegramBotToken(userId: string, botToken: string): void {
  db.query("UPDATE users SET telegram_bot_token = ? WHERE id = ?").run(
    botToken,
    userId,
  );
}
