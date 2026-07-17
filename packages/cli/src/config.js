// ============================================================================
// CLI CONFIG — persistent settings for the sendkit CLI
// ============================================================================
//
// WHY THIS FILE EXISTS
// ---------------------
// Before this file, the CLI read the Telegram bot token ONLY from an
// environment variable (TELEGRAM_BOT_TOKEN). That's fine for one-off
// terminal sessions, but it has a real usability problem: env variables
// don't persist. Close the terminal, open a new one, and it's gone again —
// unless the user manually edits their shell profile (.bashrc / .zshrc),
// which is fiddly and easy to get wrong.
//
// This file adds a small persistent config store, similar to what tools
// like `git config` or `npm config` do: the user runs a command ONCE
// (`sendkit config set botToken <token>`), and sendkit remembers it forever
// after that, across terminal sessions, reboots, etc.
//
// WHERE THE CONFIG LIVES
// ------------------------
// We store it at: ~/.sendkitrc
//
// This is a single JSON file in the user's home directory. We use the
// "dotfile in home dir" convention (like .gitconfig, .npmrc) instead of the
// more "correct" XDG Base Directory spec (~/.config/sendkit/config.json)
// because:
//   1. It's simpler — one file, no directory creation/nesting logic needed.
//   2. It's a well-understood convention from tools like git, npm, curl.
//   3. This is a small personal CLI tool, not a large system service where
//      XDG compliance really matters for people who care about that spec.
//
// If sendkit ever needs multiple config files (e.g. profiles), migrating to
// a directory-based layout later is a small, isolated change — it only
// touches this file, not the rest of the CLI.
//
// WHAT'S STORED
// ---------------
// Currently just `botToken` (Telegram bot token). The shape is intentionally
// a loose Record so we can add new keys later (e.g. `remoteUrl` for the
// Remote MCP server) without needing to migrate old config files — old
// files simply won't have the new key yet, and that's handled gracefully.
//
// SECURITY NOTE
// ---------------
// This file stores the bot token in PLAIN TEXT on disk. That's the same
// trust model as most CLI tools (e.g. `~/.npmrc`, `gh`'s config, AWS CLI's
// `~/.aws/credentials`) — it relies on OS-level file permissions to protect
// the file from other users on the same machine. We set the file permission
// to 0600 (owner read/write only) when we write it, so other users on a
// shared machine can't read it. This is NOT encryption — if someone gets
// access to the user's account, they get the token. That trade-off is
// acceptable for a local dev CLI tool; production/remote scenarios (Remote
// MCP) already handle secrets differently (hashed passwords, per-user
// tokens in a database — see packages/remote-mcp).
// ============================================================================
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// Path to the config file: ~/.sendkitrc
// homedir() resolves correctly cross-platform (Linux/Mac: /home/user or
// /Users/user, Windows: C:\Users\user) — we don't hardcode "/home".
const CONFIG_PATH = join(homedir(), ".sendkitrc");
/**
 * Reads the config file from disk and returns it as an object.
 *
 * WHY IT NEVER THROWS:
 * If the file doesn't exist yet (first-time user, never ran `config set`),
 * that's not an error condition — it just means "no config yet". We return
 * an empty object `{}` in that case instead of throwing, so callers don't
 * need try/catch for the common case of "nothing configured yet".
 *
 * If the file EXISTS but contains invalid JSON (e.g. user manually edited
 * it and broke it), we also fall back to `{}` rather than crashing the
 * whole CLI — but we log a warning so the user knows something's wrong,
 * since silently ignoring a corrupted config could be confusing.
 */
export function readConfig() {
    if (!existsSync(CONFIG_PATH)) {
        return {};
    }
    try {
        const raw = readFileSync(CONFIG_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        // Defensive check: make sure whatever's in the file is actually an
        // object, not e.g. an array or a raw string, before handing it back.
        if (typeof parsed !== "object" ||
            parsed === null ||
            Array.isArray(parsed)) {
            console.error(`Warning: ${CONFIG_PATH} does not contain a valid config object. Ignoring it.`);
            return {};
        }
        return parsed;
    }
    catch (err) {
        console.error(`Warning: could not parse ${CONFIG_PATH} (${err.message}). Ignoring it.`);
        return {};
    }
}
/**
 * Writes the given config object to disk, fully replacing whatever was
 * there before. Internal helper — external code should use setConfigValue /
 * deleteConfigValue instead of calling this directly, so reads-before-write
 * always go through readConfig() and we don't accidentally clobber keys.
 *
 * FILE PERMISSIONS (mode: 0o600):
 * This restricts the file to "owner can read/write, nobody else can read
 * or write it" (no group/other access). We set this every time we write,
 * not just on first creation, in case the OS default umask would otherwise
 * leave it more permissive.
 */
function writeConfig(config) {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), {
        encoding: "utf-8",
        mode: 0o600,
    });
}
/**
 * Sets a single key in the config file and persists it.
 * Reads the existing config first so other keys aren't lost.
 */
export function setConfigValue(key, value) {
    const config = readConfig();
    config[key] = value;
    writeConfig(config);
}
/**
 * Reads a single key's value from the config file.
 * Returns `undefined` if the key (or the file) doesn't exist — the caller
 * decides how to handle "not set" (e.g. print an error, fall back to an
 * env variable, etc.), this function just reports what's on disk.
 */
export function getConfigValue(key) {
    const config = readConfig();
    return config[key];
}
/**
 * Removes a single key from the config file, if present.
 * No-op (doesn't throw) if the key or the file doesn't exist — deleting
 * something that's already gone is not an error from the user's point of
 * view.
 */
export function deleteConfigValue(key) {
    const config = readConfig();
    delete config[key];
    writeConfig(config);
}
/**
 * Returns the whole config object, for `sendkit config list`.
 * Just a thin re-export of readConfig() for symmetry with the other
 * exported functions, and so index.ts doesn't need to know the internal
 * function name used for the "read everything" case.
 */
export function listConfig() {
    return readConfig();
}
/**
 * Masks a secret value for display purposes, e.g. when running
 * `sendkit config list`, so the raw bot token isn't printed to the
 * terminal / captured in shell history / screen-shared by accident.
 *
 * Shows the first 4 and last 4 characters, replaces the middle with
 * asterisks. For short values (<= 8 chars) it masks the whole thing,
 * since showing 4+4 characters of an 8-character secret barely hides
 * anything.
 */
export function maskSecret(value) {
    if (value.length <= 8) {
        return "*".repeat(value.length);
    }
    const start = value.slice(0, 4);
    const end = value.slice(-4);
    return `${start}${"*".repeat(Math.max(value.length - 8, 4))}${end}`;
}
// Keys whose values should be masked when displayed (e.g. `config list`).
// A simple heuristic: any key name containing "token", "secret", "key", or
// "password" (case-insensitive) is treated as sensitive. This means new
// sensitive keys added later (e.g. a future "apiSecret") are automatically
// masked without needing to update this list by hand.
export function isSensitiveKey(key) {
    return /token|secret|key|password/i.test(key);
}
