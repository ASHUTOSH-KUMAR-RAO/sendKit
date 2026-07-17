import { Hono } from "hono";
import { createUser, verifyUser, setTelegramBotToken } from "../users";
import { createAuthorizationCode, consumeAuthorizationCode, createAccessToken, } from "../oauth-store";
import { verifyPkce } from "../pkce";
// =============================================================================
// This file wires the full OAuth flow to actual HTTP endpoints.
// Recap of the 8 steps (see db.ts for the original breakdown):
//
//   1. Client  -> GET  /authorize?client_id&redirect_uri&code_challenge&state
//   2. Server  -> shows login form            <-- handled here (GET /authorize)
//   3. User    -> submits username + password <-- handled here (POST /authorize)
//   4. Server  -> creates authorization_codes row, redirects back with ?code
//   5. Client  -> POST /token { code, code_verifier }
//   6. Server  -> verifies PKCE, issues access_token                <-- POST /token
//   7. Client  -> sends Authorization: Bearer <token> on every /mcp call
//   8. Server  -> validates token (this part lives in index.ts, not here)
//
// Registration (creating a brand new user + their Telegram bot token) isn't
// part of the official OAuth dance — it's a prerequisite step so a user
// actually exists before step 2 can happen.
// =============================================================================
export const authRoutes = new Hono();
// -----------------------------------------------------------------------
// POST /register
// -----------------------------------------------------------------------
// Prerequisite step: a person needs an account (username + password) AND
// a Telegram bot token registered against that account before they can
// ever log in through /authorize. This is what makes the whole system
// "per-user" instead of one shared TELEGRAM_BOT_TOKEN env variable.
authRoutes.post("/register", async (c) => {
    const body = await c.req.json();
    if (!body.username || !body.password || !body.telegramBotToken) {
        return c.json({ error: "username, password, and telegramBotToken are all required" }, 400);
    }
    try {
        const user = await createUser(body.username, body.password);
        setTelegramBotToken(user.id, body.telegramBotToken);
        return c.json({ id: user.id, username: user.username }, 201);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Registration failed";
        return c.json({ error: message }, 400);
    }
});
// -----------------------------------------------------------------------
// GET /authorize  — STEP 1 + 2
// -----------------------------------------------------------------------
// The client (e.g. an MCP client app) redirects the user's browser here
// with four query params:
//   - client_id     (which app is asking — unused for now, we only support
//                     one client, but the param is part of the OAuth spec
//                     shape so we accept it)
//   - redirect_uri  (where to send the user back to once they log in)
//   - code_challenge (the PKCE hash — see pkce.ts)
//   - state         (a random value the client uses to prevent CSRF；we
//                     just need to echo it back unchanged in step 4)
//
// We respond with a plain HTML login form. The four query params are
// carried forward as hidden inputs so step 3 (POST /authorize) still has
// them.
authRoutes.get("/authorize", (c) => {
    const redirectUri = c.req.query("redirect_uri") ?? "";
    const codeChallenge = c.req.query("code_challenge") ?? "";
    const state = c.req.query("state") ?? "";
    const clientId = c.req.query("client_id") ?? "";
    if (!redirectUri || !codeChallenge) {
        return c.text("Missing redirect_uri or code_challenge", 400);
    }
    return c.html(`
    <html>
      <body>
        <h2>Sign in to sendkit</h2>
        <form method="POST" action="/authorize">
          <input type="hidden" name="redirect_uri" value="${redirectUri}" />
          <input type="hidden" name="code_challenge" value="${codeChallenge}" />
          <input type="hidden" name="state" value="${state}" />
          <input type="hidden" name="client_id" value="${clientId}" />
          <input type="text" name="username" placeholder="Username" required /><br/>
          <input type="password" name="password" placeholder="Password" required /><br/>
          <button type="submit">Log in</button>
        </form>
      </body>
    </html>
  `);
});
// -----------------------------------------------------------------------
// POST /authorize — STEP 3 + 4
// -----------------------------------------------------------------------
// The login form above submits here. We verify the username/password,
// and if correct, create a short-lived authorization code (oauth-store.ts)
// tied to this user + the code_challenge the client originally sent.
// Then we redirect the browser back to the client's redirect_uri with
// ?code=...&state=... — this is the client's cue to move to step 5.
authRoutes.post("/authorize", async (c) => {
    const form = await c.req.parseBody();
    const username = String(form.username ?? "");
    const password = String(form.password ?? "");
    const redirectUri = String(form.redirect_uri ?? "");
    const codeChallenge = String(form.code_challenge ?? "");
    const state = String(form.state ?? "");
    const user = await verifyUser(username, password);
    if (!user) {
        return c.text("Invalid username or password", 401);
    }
    const code = createAuthorizationCode({
        userId: user.id,
        codeChallenge,
        redirectUri,
    });
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set("code", code);
    redirectUrl.searchParams.set("state", state);
    return c.redirect(redirectUrl.toString());
});
// -----------------------------------------------------------------------
// POST /token — STEP 5 + 6
// -----------------------------------------------------------------------
// The client exchanges the authorization code (from step 4) for an actual
// access token. It must also send the ORIGINAL code_verifier (the secret
// it generated before step 1) — we hash it and compare against the
// code_challenge we stored, proving this is the same client that started
// the flow (see pkce.ts for the full explanation).
authRoutes.post("/token", async (c) => {
    const body = await c.req.json();
    if (!body.code || !body.code_verifier) {
        return c.json({ error: "code and code_verifier are required" }, 400);
    }
    const stored = consumeAuthorizationCode(body.code);
    if (!stored) {
        return c.json({ error: "Invalid, expired, or already-used code" }, 400);
    }
    const pkceValid = await verifyPkce(body.code_verifier, stored.codeChallenge);
    if (!pkceValid) {
        return c.json({ error: "PKCE verification failed" }, 400);
    }
    const { token, expiresIn } = createAccessToken(stored.userId);
    return c.json({
        access_token: token,
        token_type: "Bearer",
        expires_in: expiresIn,
    });
});
