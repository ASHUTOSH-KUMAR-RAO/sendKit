// better-sqlite3 may not have TypeScript types installed in some setups.
// Import via require so TS falls back to `any` instead of erroring.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { Database } from "bun:sqlite";
// -----------------------------------------------------------------------
// SQLite database setup
// -----------------------------------------------------------------------
// `bun:sqlite` is built into Bun — no npm package needed.
// The database file will be created at the project root as `sendkit.db`
// the first time this file runs.
export const db = new Database("sendkit.db", { create: true });

// Enable WAL mode for better concurrent read/write performance.
db.exec("PRAGMA journal_mode = WAL;");

// -----------------------------------------------------------------------
// Users table
// -----------------------------------------------------------------------
// Each user has:
// - a unique username
// - a hashed password (never store plain text passwords!)
// - their own Telegram bot token (this is the "per-user credentials" part)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    telegram_bot_token TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// =============================================================================
// OAuth 2.1 + PKCE flow — full picture (see pkce.ts for the PKCE-specific part)
// =============================================================================
//   1. Client  -> GET /authorize?client_id&redirect_uri&code_challenge&state
//   2. Server  -> shows a login form (if user isn't logged in yet)
//   3. User    -> submits username + password
//   4. Server  -> creates a row in `authorization_codes` (short-lived, ~5 min)
//                 and redirects the client back to `redirect_uri` with
//                 ?code=...&state=...
//   5. Client  -> POST /token with { code, code_verifier }
//   6. Server  -> checks the code hasn't expired/been used, verifies PKCE
//                 (pkce.ts), then creates a row in `access_tokens` and
//                 returns { access_token, expires_in }
//   7. Client  -> every /mcp request now sends `Authorization: Bearer <token>`
//   8. Server  -> looks up the token in `access_tokens`, finds the user_id,
//                 and uses THAT user's `telegram_bot_token` instead of a
//                 shared env variable — this is what makes it "per-user".
// =============================================================================

// -----------------------------------------------------------------------
// authorization_codes table — step 4 above
// -----------------------------------------------------------------------
// Authorization codes are intentionally SHORT-LIVED and SINGLE-USE.
// They only exist to be immediately exchanged for an access token at
// /token — they are never used to directly authenticate a request.
db.exec(`
  CREATE TABLE IF NOT EXISTS authorization_codes (
    code TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// -----------------------------------------------------------------------
// access_tokens table — step 6/7/8 above
// -----------------------------------------------------------------------
// This is what the client actually sends on every /mcp request
// (as `Authorization: Bearer <token>`). Longer-lived than an
// authorization code, but still has an expiry for safety.
db.exec(`
  CREATE TABLE IF NOT EXISTS access_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);
