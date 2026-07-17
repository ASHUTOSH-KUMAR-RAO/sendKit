// ============================================================================
// `sendkit init` — interactive first-time setup
// ============================================================================
//
// WHY THIS EXISTS
// -----------------
// `sendkit config set botToken <token>` works, but it has a gap: it saves
// WHATEVER string the user types, with no check that it's actually a real,
// working Telegram bot token. A typo, an expired token, or a token pasted
// with extra whitespace would get saved silently — and the user would only
// find out something's wrong later, when `sendkit telegram ...` fails with
// a confusing error, disconnected in time from the moment they set it up.
//
// `init` closes that gap: it's a guided flow that
//   1. asks for the bot token,
//   2. asks for a chat ID to send a TEST message to,
//   3. actually calls the Telegram API (via the same sendTelegramMessage
//      used by the `telegram` command — no duplicated logic) to send that
//      test message,
//   4. ONLY saves the token to config if that real send succeeds.
//
// This means: if `sendkit init` finishes successfully, the user has proof
// — an actual delivered Telegram message — that their setup works, not
// just that they typed something into a prompt.
//
// WHY NOT JUST CALL TELEGRAM'S `getMe` ENDPOINT INSTEAD:
// `getMe` would confirm the token is syntactically valid and belongs to a
// real bot, but it would NOT confirm that the bot can actually deliver a
// message to a real chat (e.g. the user hasn't started a conversation with
// their own bot yet, which is a common first-time mistake — Telegram bots
// can't message a user until that user has messaged the bot first). Sending
// a real test message catches that class of problem too, which is the more
// useful thing to validate before saving.
// ============================================================================
import { createInterface } from "node:readline/promises";
import { sendTelegramMessage } from "sendkit-core";
import { getConfigValue, setConfigValue } from "./config";
/**
 * Prompts for a normal (visible) line of input.
 */
async function promptVisible(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await rl.question(question);
        return answer.trim();
    }
    finally {
        rl.close();
    }
}
/**
 * Prompts for a line of input WITHOUT echoing it to the terminal — used for
 * the bot token, so it doesn't end up visible on screen / in a terminal
 * scroll-back / screen recording while the user is typing it.
 *
 * HOW THIS WORKS:
 * Node's readline doesn't have a built-in "password mode", so we implement
 * masking manually: we put stdin into raw mode (so keystrokes come to us
 * one at a time instead of only after Enter is pressed), and for every
 * character typed we print a "*" instead of the real character. We still
 * build up the real string internally — we just never print it.
 *
 * We restore stdin to its normal (non-raw) mode in a `finally` block so a
 * crash or early return doesn't leave the user's terminal in a broken
 * state (raw mode affects how the WHOLE terminal behaves, not just this
 * prompt, so cleanup here is important).
 */
async function promptHidden(question) {
    return new Promise((resolve, reject) => {
        process.stdout.write(question);
        let input = "";
        const stdin = process.stdin;
        const wasRaw = stdin.isRaw;
        // If stdin isn't a TTY (e.g. input is piped in from a script/CI), raw
        // mode isn't available — fall back to a normal visible prompt instead
        // of crashing.
        if (!stdin.isTTY) {
            promptVisible("").then(resolve, reject);
            return;
        }
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding("utf-8");
        const onData = (char) => {
            switch (char) {
                case "\u0003": // Ctrl+C — let the user bail out cleanly
                    cleanup();
                    process.stdout.write("\n");
                    process.exit(130);
                    return;
                case "\r":
                case "\n":
                    cleanup();
                    process.stdout.write("\n");
                    resolve(input.trim());
                    return;
                case "\u007f": // Backspace
                    if (input.length > 0) {
                        input = input.slice(0, -1);
                        // Move cursor back, overwrite the "*" with a space, move back again
                        process.stdout.write("\b \b");
                    }
                    return;
                default:
                    input += char;
                    process.stdout.write("*");
            }
        };
        const cleanup = () => {
            stdin.removeListener("data", onData);
            stdin.setRawMode(wasRaw ?? false);
            stdin.pause();
        };
        stdin.on("data", onData);
    });
}
/**
 * Runs the full interactive init flow. Returns nothing — exits the process
 * with a non-zero code on failure, same convention as the rest of the CLI.
 */
export async function runInit() {
    console.log("sendkit setup\n--------------");
    const existingToken = getConfigValue("botToken");
    if (existingToken) {
        const overwrite = await promptVisible("A bot token is already configured. Replace it? (y/N): ");
        if (overwrite.toLowerCase() !== "y") {
            console.log("Keeping existing config. Nothing changed.");
            return;
        }
    }
    const botToken = await promptHidden("Telegram bot token: ");
    if (!botToken) {
        console.error("Error: bot token cannot be empty.");
        process.exit(1);
    }
    console.log("\nTo validate this token, sendkit will send a real test message.\n" +
        "Tip: the chat ID can be your own Telegram user ID — message your bot\n" +
        "once first (Telegram requires that before a bot can message you).\n");
    const chatId = await promptVisible("Chat ID to send a test message to: ");
    if (!chatId) {
        console.error("Error: chat ID cannot be empty.");
        process.exit(1);
    }
    console.log("\nSending test message...");
    const result = await sendTelegramMessage({
        chatId,
        message: "✅ sendkit setup successful — this bot token is working.",
        botToken,
    });
    if (!result.success) {
        console.error(`\nSetup failed: ${result.error}\n` +
            "The token was NOT saved. Fix the issue above and run `sendkit init` again.");
        process.exit(1);
    }
    // Only reached on a real, confirmed-delivered message — safe to persist.
    setConfigValue("botToken", botToken);
    console.log(`\nTest message delivered (message_id: ${result.data.messageId}).\n` +
        "Bot token saved. You're all set — try:\n" +
        `  sendkit telegram ${chatId} "hello from sendkit"`);
}
