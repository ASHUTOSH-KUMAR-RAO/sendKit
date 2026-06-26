import {
  telegramMessageOutputSchema,
  telegramMessageOptionsSchema,
  telegramSendMessageRequestSchema,
  telegramSendMessageResponseSchema,
  type TelegramMessageOptions,
  type TelegramMessageOutput,
} from "./schemas";

export type SendTelegramMessageResult =
  | { success: true; data: TelegramMessageOutput }
  | { success: false; error: string };

// ============================================================================
// WHY .parse() vs .safeParse() — TWO WAYS TO VALIDATE WITH A ZOD SCHEMA:
//
// schema.parse(input)
//   - Validates `input` against the schema.
//   - If invalid -> THROWS a ZodError (the function call itself crashes).
//   - If valid   -> returns the parsed/validated data directly.
//   - Whoever calls a function using `.parse()` internally MUST wrap that
//     call in try/catch, or an invalid input will crash the program /
//     produce an unhandled rejection.
//   - Good fit when something else up the chain (e.g. an MCP SDK) already
//     expects to catch thrown errors and convert them into a proper
//     error response automatically.
//
// schema.safeParse(input)
//   - Validates `input` against the schema.
//   - NEVER throws. Always returns an object:
//       { success: true,  data: ... }   on valid input
//       { success: false, error: ... }  on invalid input
//   - Whoever calls a function using `.safeParse()` internally just needs
//     to check `if (!result.success)` — no try/catch required.
//   - Good fit when we want the function itself to fully own error
//     handling and always return a predictable, crash-proof result.
//
// Neither one is "wrong" — it's a design choice about WHERE error handling
// responsibility lives: inside this function (.safeParse) or pushed up to
// every caller of this function (.parse + try/catch).
// ============================================================================

export async function sendTelegramMessage(
  options: TelegramMessageOptions,
): Promise<SendTelegramMessageResult> {
  // 1. Validate the input (chatId, message, botToken)
  const parsedOptions = telegramMessageOptionsSchema.safeParse(options);

  if (!parsedOptions.success) {
    return {
      success: false,
      error: parsedOptions.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { chatId, message, botToken } = parsedOptions.data;

  // 2. Build the Telegram API request body (camelCase -> snake_case)
  const parsedRequestBody = telegramSendMessageRequestSchema.safeParse({
    chat_id: chatId,
    text: message,
  });

  if (!parsedRequestBody.success) {
    return {
      success: false,
      error:
        parsedRequestBody.error.issues[0]?.message ?? "Invalid request body",
    };
  }

  try {
    // 3. Call the Telegram API
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedRequestBody.data),
      },
    );

    let rawData: unknown;
    try {
      rawData = await res.json();
    } catch {
      return {
        success: false,
        error: "Failed to parse Telegram API response (invalid JSON).",
      };
    }

    // 4. Validate the shape of Telegram's response
    const parsedResponse = telegramSendMessageResponseSchema.safeParse(rawData);

    if (!parsedResponse.success) {
      return {
        success: false,
        error: "Unexpected response shape from Telegram API.",
      };
    }

    const data = parsedResponse.data;

    // 5. Handle Telegram-level errors (ok: false, or missing result)
    if (!res.ok || !data.ok || !data.result) {
      return {
        success: false,
        error: data.description ?? `Telegram API error (HTTP ${res.status})`,
      };
    }

    // 6. Build the clean, guaranteed-success output
    const output = telegramMessageOutputSchema.parse({
      ok: true,
      chatId,
      messageId: data.result.message_id,
    });

    return { success: true, data: output };
  } catch (err) {
    // Network errors, DNS failure, fetch rejection, etc.
    //
    // WHY `instanceof Error`:
    // In a catch block, `err` has type `unknown` — TypeScript doesn't know
    // what was thrown (it could be an Error, a string, a number, anything).
    // So we can't directly access `err.message` without checking first.
    //
    // `err instanceof Error` is a runtime check: "is this actually an Error
    // object?" If true, TypeScript narrows the type and safely allows
    // `err.message`. If false (something non-standard was thrown), we fall
    // back to a generic message instead of crashing.
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `Network error: ${msg}` };
  }
}
