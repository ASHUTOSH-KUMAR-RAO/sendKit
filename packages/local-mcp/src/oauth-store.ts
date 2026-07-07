import { randomBytes } from "node:crypto";
import { db } from "./db";

// =============================================================================
// This file implements steps 4, 6, and 8 of our OAuth flow (see db.ts for the
// full 8-step picture). It's the "read/write" layer for the
// `authorization_codes` and `access_tokens` tables — nothing here talks HTTP,
// that happens later in the routes file.
// =============================================================================

// How long an authorization code stays valid before it must be exchanged
// for an access token. Kept short on purpose — it only needs to survive
// one redirect hop from /authorize to the client's /token call.
const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// How long an access token stays valid before the client must log in again.
// (We're not implementing refresh tokens yet — that's a possible future
// improvement once this base flow works end to end.)
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function generateSecureToken(): string {
  // 32 random bytes -> 64 char hex string. Cryptographically random,
  // unguessable — this is what makes the code/token safe to trust.
  return randomBytes(32).toString("hex");
}

// -----------------------------------------------------------------------
// STEP 4: Create an authorization code
// -----------------------------------------------------------------------
// Called from the /authorize route, right after the user logs in
// successfully. Stores who the code belongs to (user_id), what PKCE
// challenge it's tied to (code_challenge), and where the client should be
// redirected back to (redirect_uri) once /token exchanges this code.
export function createAuthorizationCode(params: {
  userId: string;
  codeChallenge: string;
  redirectUri: string;
}): string {
  const code = generateSecureToken();
  const expiresAt = Date.now() + AUTH_CODE_TTL_MS;

  db.query(
    `INSERT INTO authorization_codes (code, user_id, code_challenge, redirect_uri, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    code,
    params.userId,
    params.codeChallenge,
    params.redirectUri,
    expiresAt,
  );

  return code;
}

// -----------------------------------------------------------------------
// STEP 6 (part 1): Look up + consume an authorization code
// -----------------------------------------------------------------------
// Called from the /token route. Returns the stored row so the caller can
// run the PKCE check (pkce.ts) against `code_challenge`. Marks the code as
// "used" immediately — authorization codes are single-use. If someone
// tries to reuse a code (e.g. it was intercepted), this call will simply
// not find a valid one and the exchange fails.
export function consumeAuthorizationCode(code: string): {
  userId: string;
  codeChallenge: string;
  redirectUri: string;
} | null {
  const row = db
    .query(
      `SELECT user_id, code_challenge, redirect_uri, expires_at, used
       FROM authorization_codes WHERE code = ?`,
    )
    .get(code) as
    | {
        user_id: string;
        code_challenge: string;
        redirect_uri: string;
        expires_at: number;
        used: number;
      }
    | undefined;

  if (!row) return null; // code doesn't exist
  if (row.used) return null; // already used once — reject reuse
  if (Date.now() > row.expires_at) return null; // expired

  // Mark as used right away so it can never be exchanged again.
  db.query("UPDATE authorization_codes SET used = 1 WHERE code = ?").run(code);

  return {
    userId: row.user_id,
    codeChallenge: row.code_challenge,
    redirectUri: row.redirect_uri,
  };
}

// -----------------------------------------------------------------------
// STEP 6 (part 2): Issue an access token
// -----------------------------------------------------------------------
// Called right after PKCE verification succeeds. This is the token the
// client will attach to every future /mcp request.
export function createAccessToken(userId: string): {
  token: string;
  expiresIn: number;
} {
  const token = generateSecureToken();
  const expiresAt = Date.now() + ACCESS_TOKEN_TTL_MS;

  db.query(
    "INSERT INTO access_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(token, userId, expiresAt);

  return { token, expiresIn: ACCESS_TOKEN_TTL_MS / 1000 };
}

// -----------------------------------------------------------------------
// STEP 8: Validate an access token (used on every /mcp request)
// -----------------------------------------------------------------------
// Called from the /mcp route's auth check. Given the Bearer token the
// client sent, returns the associated user_id — or null if the token is
// missing, expired, or was never issued by us.
export function validateAccessToken(token: string): { userId: string } | null {
  const row = db
    .query("SELECT user_id, expires_at FROM access_tokens WHERE token = ?")
    .get(token) as { user_id: string; expires_at: number } | undefined;

  if (!row) return null;
  if (Date.now() > row.expires_at) return null;

  return { userId: row.user_id };
}
