import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { sendTelegramMessage } from "sendkit-core";
import { z } from "zod";

// Create the MCP server instance with basic metadata
const server = new McpServer({
  name: "sendkit",
  version: "1.0.0",
});

// Get the Telegram bot token from environment variables
// This should be configured in Claude Desktop's MCP config (or .env for local dev)
function getTelegramBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is required. Configure it in your MCP client environment.",
    );
  }

  return token;
}

// Define the "send_telegram_message" tool
// This is what Claude (or any MCP client) will see and call
server.tool(
  "send_telegram_message",
  "Send a message to a Telegram chat using a bot",
  {
    // Only chatId and message — botToken comes from env, not from user input
    chatId: z.string().describe("The Telegram chat ID to send the message to"),
    message: z.string().describe("The message text to send"),
  },
  async ({ chatId, message }) => {
    // Get bot token from environment — never exposed to the AI client
    const botToken = getTelegramBotToken();

    // Call the shared core function — same logic CLI uses
    const result = await sendTelegramMessage({ chatId, message, botToken });

    if (!result.success) {
      // Return error in MCP-expected format
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

    // Return success in MCP-expected format
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

// Start the server using stdio transport
// Claude Desktop will communicate with this server via stdin/stdout
// Note: server.connect() is a blocking call — it keeps the process alive
// and waits for incoming MCP protocol messages via stdin.
// This is expected behavior — the server is NOT hung, it's listening.
// It will only respond when an MCP client (like Claude Desktop) connects.
const transport = new StdioServerTransport();
await server.connect(transport);
