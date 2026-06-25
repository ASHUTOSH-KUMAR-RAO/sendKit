import { Command } from "commander";

type TelegramResponse = {
  ok: boolean;
  result?: {
    message_id?: number;
  };
  description: string;
};

const program = new Command();

program
  .name("sendkit")
  .description("sendkit tutorial cli")
  .command("telegram")
  .description("send a telegram message")
  .argument("<chatId>", "Telegram chat ID")
  .argument("<message>", "Message text to send")
  .action(async (chatId: string, message: string) => {
    // 1. Token check
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error("Error: Missing TELEGRAM_BOT_TOKEN env variable");
      process.exit(1);
    }

    // 2. chatId validation — Telegram chat IDs are numeric (can be negative for groups/channels)
    if (!/^-?\d+$/.test(chatId)) {
      console.error(
        `Error: Invalid chatId "${chatId}". It must be a numeric Telegram chat ID.`,
      );
      process.exit(1);
    }

    // 3. message validation
    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      console.error("Error: Message text cannot be empty.");
      process.exit(1);
    }
    if (trimmedMessage.length > 4096) {
      console.error(
        `Error: Message is too long (${trimmedMessage.length} chars). Telegram limit is 4096 characters.`,
      );
      process.exit(1);
    }

    // 4. API call with proper try/catch
    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: trimmedMessage,
        }),
      });

      let data: TelegramResponse;
      try {
        data = (await res.json()) as TelegramResponse;
      } catch {
        console.error(
          "Error: Failed to parse Telegram API response (invalid JSON).",
        );
        process.exit(1);
      }

      if (!res.ok || !data.ok) {
        // Telegram returns descriptive errors in `description`
        console.error(
          `Telegram API error: ${data.description ?? `HTTP ${res.status}`}`,
        );
        process.exit(1);
      }

      console.log(
        `Message sent successfully (message_id: ${data.result?.message_id ?? "unknown"})`,
      );
    } catch (err) {
      // Network errors, DNS failure, timeout, etc.
      if (err instanceof Error) {
        console.error(`Error: Failed to send message — ${err.message}`);
      } else {
        console.error("Error: Failed to send message due to an unknown error.");
      }
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
