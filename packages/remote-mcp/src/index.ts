
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { sendTelegramMessage } from "sendkit-core";
import { z } from "zod";

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
};

const sessions = new Map<string, Session>();

// -----------------------------------------------------------------------
// Bot token
// -----------------------------------------------------------------------
// NOTE: For now this is a single shared token from env, same as local-mcp.
// Once OAuth lands (next on the roadmap), each remote client/session will
// bring its own credentials instead of relying on a server-wide env var.
function getTelegramBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is required. Configure it in the server environment.",
    );
  }

  return token;
}

// -----------------------------------------------------------------------
// Server factory
// -----------------------------------------------------------------------
// Each session gets its own McpServer instance (fresh tool registrations),
// mirroring how packages/local-mcp registers its tools.
function createMcpServer() {
  const server = new McpServer({
    name: "sendkit-remote",
    version: "1.0.0",
  });

  server.tool(
    "send_telegram_message",
    "Send a message to a Telegram chat using a bot",
    {
      chatId: z.string().describe("The Telegram chat ID to send the message to"),
      message: z.string().describe("The message text to send"),
    },
    async ({ chatId, message }) => {
      const botToken = getTelegramBotToken();

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
async function createSession(): Promise<Session> {
  const server = createMcpServer();

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      // Store the session once the SDK has assigned it an ID.
      sessions.set(sessionId, { server, transport });
      console.error(`[remote-mcp] session initialized: ${sessionId}`);
    },
    onsessionclosed: (sessionId) => {
      sessions.delete(sessionId);
      console.error(`[remote-mcp] session closed: ${sessionId}`);
    },
  });

  await server.connect(transport);

  return { server, transport };
}

// -----------------------------------------------------------------------
// Hono app
// -----------------------------------------------------------------------
const app = new Hono();

app.get("/", (c) => c.text("sendkit remote-mcp is running"));

app.all("/mcp", async (c) => {
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
  // Create a brand-new server + transport pair for it.
  const { transport } = await createSession();

  return transport.handleRequest(c.req.raw);
});

const port = Number(process.env.PORT ?? 3000);

console.error(`[remote-mcp] listening on http://localhost:${port}/mcp`);

export default {
  port,
  fetch: app.fetch,
};
