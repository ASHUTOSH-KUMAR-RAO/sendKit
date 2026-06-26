import { z } from "zod";

export const telegramMessageInputSchema = z.object({
  chatId: z.string().min(1, "Chat ID is required"),
  message: z.string().min(1, "Message is required"),
});

export const telegramMessageOptionsSchema = telegramMessageInputSchema.extend({
  botToken: z.string().min(1, "Telegram bot token is required"),
});

export const telegramSendMessageRequestSchema = z.object({
  chat_id: z.string().min(1),
  text: z.string().min(1),
});

export const telegramSendMessageResponseSchema = z.object({
  ok: z.boolean(),
  result: z
    .object({
      message_id: z.number(),
    })
    .optional(),
  description: z.string().optional(),
});

export const telegramMessageOutputSchema = z.object({
  ok: z.literal(true),
  chatId: z.string(),
  messageId: z.number(),
});

// ============================================================================
// WHY z.infer<> INSTEAD OF MANUALLY WRITING TYPES:
//
// If we write a type by hand (e.g. `type X = { chatId: string }`), it does
// NOT auto-update when the Zod schema changes. We'd have to remember to
// update the type manually every time the schema changes — easy to forget,
// and a forgotten update causes the type to silently drift out of sync with
// the actual runtime validation (bugs that TypeScript won't catch).
//
// z.infer<typeof schema> derives the type DIRECTLY from the schema. So if
// the schema changes (a field is added, removed, made optional, etc.), the
// inferred type updates automatically — no manual sync needed, ever.
//
// Rule of thumb: the schema is the single source of truth.
// Manual type  -> can go out of sync with the schema. Avoid.
// z.infer type -> always in sync with the schema. Prefer this.
// ============================================================================

export type TelegramMessageInput = z.infer<typeof telegramMessageInputSchema>;
export type TelegramMessageOptions = z.infer<typeof telegramMessageOptionsSchema>;
export type TelegramMessageOutput = z.infer<typeof telegramMessageOutputSchema>;

