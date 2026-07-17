import { randomUUID } from "node:crypto";
import { db } from "./db";
// -----------------------------------------------------------------------
// Create a new user
// -----------------------------------------------------------------------
// Passwords are hashed using Bun's built-in `Bun.password` API (bcrypt
// under the hood) — we NEVER store the plain text password.
export async function createUser(username, password) {
    const existing = db
        .query("SELECT id FROM users WHERE username = ?")
        .get(username);
    if (existing) {
        throw new Error("Username already taken");
    }
    const id = randomUUID();
    const passwordHash = await Bun.password.hash(password);
    db.query("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)").run(id, username, passwordHash);
    return { id, username, telegramBotToken: null };
}
// -----------------------------------------------------------------------
// Verify username + password (used during login)
// -----------------------------------------------------------------------
export async function verifyUser(username, password) {
    const row = db
        .query("SELECT id, username, password_hash, telegram_bot_token FROM users WHERE username = ?")
        .get(username);
    if (!row)
        return null;
    const passwordMatches = await Bun.password.verify(password, row.password_hash);
    if (!passwordMatches)
        return null;
    return {
        id: row.id,
        username: row.username,
        telegramBotToken: row.telegram_bot_token,
    };
}
// -----------------------------------------------------------------------
// Get a user by ID (used when validating an access token)
// -----------------------------------------------------------------------
export function getUserById(id) {
    const row = db
        .query("SELECT id, username, telegram_bot_token FROM users WHERE id = ?")
        .get(id);
    if (!row)
        return null;
    return {
        id: row.id,
        username: row.username,
        telegramBotToken: row.telegram_bot_token,
    };
}
// -----------------------------------------------------------------------
// Set/update a user's Telegram bot token
// -----------------------------------------------------------------------
export function setTelegramBotToken(userId, botToken) {
    db.query("UPDATE users SET telegram_bot_token = ? WHERE id = ?").run(botToken, userId);
}
