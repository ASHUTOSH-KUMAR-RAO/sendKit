import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { sendTelegramMessage } from "sendkit-core";
import { z } from "zod";
import { validateAccessToken } from "sendkit-mcp/oauth-store";
import { getUserById } from "sendkit-mcp/users";
import { authRoutes } from "sendkit-mcp/routes/auth";


// =============================================================================
// OAuth recap (full 8-step flow lives in db.ts / routes/auth.ts):
// This file is responsible for STEP 8 — validating the Bearer token on every
// /mcp request — and for making sure each session's send_telegram_message
// tool uses THAT AUTHENTICATED USER's own bot token, not a shared env var.
// =============================================================================

// -----------------------------------------------------------------------
// Session store
// -----------------------------------------------------------------------
// Remote MCP is stateful: each client gets its own session (identified by
// the `mcp-session-id` header). We keep one { server, transport } pair per
// session in memory. This is fine for a single-instance deployment; if we
// ever run multiple instances behind a load balancer, this map would need
// to move to a shared store (Redis, etc.)
type Session = {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
  userId: string;
};

const sessions = new Map<string, Session>();

// -----------------------------------------------------------------------
// Server factory
// -----------------------------------------------------------------------
// Each session gets its own McpServer instance (fresh tool registrations),
// mirroring how packages/local-mcp registers its tools.
//
// CHANGED FOR OAUTH: this now takes the authenticated user's own
// `botToken` as a parameter, instead of reading a single shared
// TELEGRAM_BOT_TOKEN from the environment. This is what makes the tool
// "per-user" — two different logged-in users calling this same server
// will each send messages through THEIR OWN Telegram bot.
function createMcpServer(botToken: string) {
  const server = new McpServer({
    name: "sendkit-remote",
    version: "1.0.0",
  });

  server.tool(
    "send_telegram_message",
    "Send a message to a Telegram chat using a bot",
    {
      chatId: z
        .string()
        .describe("The Telegram chat ID to send the message to"),
      message: z.string().describe("The message text to send"),
    },
    async ({ chatId, message }) => {
      const result = await sendTelegramMessage({ chatId, message, botToken });

      if (!result.success) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to send message`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Message sent successfully! Message ID: ${result.data.messageId}`,
          },
        ],
      };
    },
  );

  return server;
}

// -----------------------------------------------------------------------
// Session helpers
// -----------------------------------------------------------------------
// CHANGED FOR OAUTH: now takes the authenticated userId + their botToken,
// so the session (and its McpServer's tool) is permanently tied to that
// one user for as long as the session lives.
async function createSession(
  userId: string,
  botToken: string,
): Promise<Session> {
  const server = createMcpServer(botToken);

  let sessionRef: Session;

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      sessions.set(sessionId, sessionRef);
      console.error(
        `[remote-mcp] session initialized: ${sessionId} (user: ${userId})`,
      );
    },
    onsessionclosed: (sessionId) => {
      sessions.delete(sessionId);
      console.error(`[remote-mcp] session closed: ${sessionId}`);
    },
  });

  await server.connect(transport);

  sessionRef = { server, transport, userId };
  return sessionRef;
}

// -----------------------------------------------------------------------
// Auth check helper — STEP 8 of the OAuth flow
// -----------------------------------------------------------------------
// Every /mcp request (whether it's starting a new session or continuing
// an existing one) must carry a valid access token, e.g.:
//   Authorization: Bearer <token from /token response>
//
// Returns the authenticated user (with their telegramBotToken), or null
// if the token is missing/invalid/expired — in which case the caller
// should reject the request with 401.
function authenticateRequest(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length);
  const tokenInfo = validateAccessToken(token);

  if (!tokenInfo) return null;

  const user = getUserById(tokenInfo.userId);

  if (!user || !user.telegramBotToken) return null;

  return user;
}

// -----------------------------------------------------------------------
// Hono app
// -----------------------------------------------------------------------
const app = new Hono();

app.get("/", (c) => c.text("sendkit remote-mcp is running"));

// Mount the OAuth routes: /register, /authorize (GET+POST), /token
// (see routes/auth.ts for the full step-by-step flow)
app.route("/", authRoutes);

app.all("/mcp", async (c) => {
  // STEP 8: reject any request without a valid access token, before we
  // ever touch session/transport logic.
  const user = authenticateRequest(c.req.header("authorization"));

  if (!user) {
    return c.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Unauthorized — missing or invalid access token",
        },
        id: null,
      },
      401,
    );
  }

  const sessionId = c.req.header("mcp-session-id");

  // Existing session: reuse its transport.
  if (sessionId) {
    const existing = sessions.get(sessionId);

    if (!existing) {
      return c.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Session not found" },
          id: null,
        },
        404,
      );
    }

    return existing.transport.handleRequest(c.req.raw);
  }

  // No session ID yet — this should be an initialize request.
  // Create a brand-new server + transport pair, tied to this
  // authenticated user's own Telegram bot token.
  const { transport } = await createSession(user.id, user.telegramBotToken!);

  return transport.handleRequest(c.req.raw);
});

const port = Number(process.env.PORT ?? 3000);

console.error(`[remote-mcp] listening on http://localhost:${port}/mcp`);

export default {
  port,
  fetch: app.fetch,
};
