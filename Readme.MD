Each interface only translates *its* input format into a call to the core, and translates the core's result back into *its* expected output format (stdout for CLI, JSON-RPC for MCP, etc.).

## Packages

All packages are published on npm and can be installed independently, depending on which interface you need.

| Package | npm | Description |
|---|---|---|
| `sendkit-core` | [npm](https://www.npmjs.com/package/sendkit-core) | Shared sending logic, used internally by every other package. |
| `sendkit-mcp` | [npm](https://www.npmjs.com/package/sendkit-mcp) | Local MCP server (stdio) — for Claude Desktop and similar clients. |
| `sendkit-remote-mcp` | [npm](https://www.npmjs.com/package/sendkit-remote-mcp) | Remote MCP server (HTTP + OAuth 2.1/PKCE) — for remote agent clients. |
| `sendkit-cli` | [npm](https://www.npmjs.com/package/sendkit-cli) | Terminal CLI. Installs as the `sendkit` command. |

## Project Status

🚧 **Active development.** This project is being built incrementally and in public. Core sending logic, the CLI, and both MCP servers are functional and published to npm. OAuth deployment, the Anthropic Skill, and additional channels are in progress.

## Tech Stack

- **[Bun](https://bun.sh)** — runtime and monorepo workspace manager
- **TypeScript** — end to end
- **[Commander.js](https://github.com/tj/commander.js)** — CLI framework
- **[Model Context Protocol (MCP)](https://modelcontextprotocol.io)** — local and remote agent integration
- **[Hono](https://hono.dev)** — remote MCP server's HTTP layer
- **[Zod](https://zod.dev)** — schema validation across every package

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed (`curl -fsSL https://bun.sh/install | bash`) — needed if you're working on the monorepo itself
- [Node.js](https://nodejs.org) — needed if you're just installing the published packages via npm
- A [Telegram Bot Token](https://core.telegram.org/bots#how-do-i-create-a-bot) (via [@BotFather](https://t.me/BotFather))

### Option A — Install the CLI from npm (quickest)

```bash
npm install -g sendkit-cli
sendkit init
```

### Option B — Clone and run the monorepo (for development)

```bash
git clone https://github.com/ASHUTOSH-KUMAR-RAO/sendKit.git
cd sendKit
bun install
```

### Environment Setup

Copy the example environment file and add your Telegram bot token:

```bash
cp .env.example .env
```

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

Alternatively, if you installed the CLI via npm, you can run `sendkit init` to be prompted for a bot token interactively, or set it with `sendkit config set botToken <token>`.

## Usage

### CLI (installed via npm)

```bash
sendkit telegram <chatId> "<message>"
```

**Example:**

```bash
sendkit telegram 8709937518 "Hello from sendkit!"
```

### CLI (from the monorepo, during development)

```bash
bun run dev:cli telegram <chatId> "<message>"
```

> Don't know your chat ID? Send any message to your bot, then hit `https://api.telegram.org/bot<TOKEN>/getUpdates` to find it under `message.chat.id`.

More usage examples (MCP, Skill) will be added here as those interfaces are completed.

## Running with Docker

`sendkit-remote-mcp` (the OAuth-secured remote MCP server) can be built and run as a Docker container. This is the recommended way to run it outside of local development.

### Build the image

From the repo root:

```bash
docker build -t sendkit-remote-mcp .
```

This is a multi-stage build: it builds `sendkit-core`, `sendkit-mcp`, and `sendkit-remote-mcp` in order, then produces a lean runtime image containing only the built `remote-mcp` output and its production dependencies.

### Run the container

```bash
docker run -p 3000:3000 -e DATABASE_PATH=/app/sendkit.db sendkit-remote-mcp
```

- **`PORT`** — port the server listens on (defaults to `3000`; Railway and similar platforms set this automatically).
- **`DATABASE_PATH`** — path to the SQLite database file used for OAuth users/tokens. Defaults to `sendkit.db` in the working directory if unset. In a container, point this at a mounted volume so data survives restarts (e.g. `/data/sendkit.db`).

Once running, a quick health check:

```bash
curl http://localhost:3000/
# → sendkit remote-mcp is running
```

> **Cloud deployment (Railway, etc.):** a step-by-step guide for deploying this image to a hosting platform with a persistent volume will be added here once that deployment is live.

## Project Structure

This is a Bun-managed monorepo. Shared logic lives in `packages/core`; every interface (`packages/cli`, `packages/local-mcp`, `packages/remote-mcp`, and the upcoming Skill) is a separate workspace package that depends on it. Each package is published to npm independently — see [Packages](#packages) above.

## Contributing

This project is primarily a learning build, but suggestions, issues, and pull requests are welcome. Planned extensions (additional channels, templates, scheduling, and more) will be documented here as they're actually built.

## License

Licensed under the [MIT License](./LICENSE).
