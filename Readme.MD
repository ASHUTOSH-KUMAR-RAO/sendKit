# sendkit

**One core. Every AI interface.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-fbf0df?logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![npm sendkit-core](https://img.shields.io/npm/v/sendkit-core?label=sendkit-core)](https://www.npmjs.com/package/sendkit-core)
[![npm sendkit-cli](https://img.shields.io/npm/v/sendkit-cli?label=sendkit-cli)](https://www.npmjs.com/package/sendkit-cli)
[![Status](https://img.shields.io/badge/status-work%20in%20progress-orange)](#roadmap)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

sendkit is a messaging toolkit built around a single shared core that powers a CLI, a local MCP server, a remote MCP server, and an Anthropic Skill — write your sending logic once, and use it from a terminal, Claude Desktop, ChatGPT, or any MCP-compatible agent.

The first supported channel is **Telegram**, with more channels planned.

---

## Table of Contents

- [Why sendkit](#why-sendkit)
- [Architecture](#architecture)
- [Packages](#packages)
- [Project Status](#project-status)
- [Roadmap](#roadmap)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Why sendkit

AI tooling keeps shifting under developers' feet — MCP servers one month, Skills the next, agents expecting CLI access after that. The usual response is to write the same "send a message" logic over and over for every new interface.

sendkit takes a different approach: the core logic lives in **one place**, and every interface (CLI, local MCP, remote MCP, Skill) is a thin adapter on top of it. Add a new interface without touching the underlying logic. Fix a bug once, and every interface benefits.

## Architecture

| Layer | Responsibility |
|---|---|
| **Core** | The actual sending/business logic. Has no knowledge of *how* it's invoked. |
| **CLI** | A `commander`-based terminal interface for direct, scriptable use. |
| **Local MCP Server** | Exposes the core over stdio, for clients like Claude Desktop. |
| **Remote MCP Server** | Exposes the core over HTTP/SSE with OAuth, for remote clients like ChatGPT. |
| **Skill** | Exposes the core as an Anthropic Skill. |

```
                ┌─────────────┐
                │  CLI / MCP  │
                │  / Skill    │
                └──────┬──────┘
                       │
               ┌───────▼────────┐
               │   Shared Core  │
               │ (sending logic)│
               └───────┬────────┘
                       │
               ┌───────▼────────┐
               │ Provider APIs  │
               │ (Telegram, …)  │
               └────────────────┘
```

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

## Project Structure

This is a Bun-managed monorepo. Shared logic lives in `packages/core`; every interface (`packages/cli`, `packages/local-mcp`, `packages/remote-mcp`, and the upcoming Skill) is a separate workspace package that depends on it. Each package is published to npm independently — see [Packages](#packages) above.

## Contributing

This project is primarily a learning build, but suggestions, issues, and pull requests are welcome. Planned extensions (additional channels, templates, scheduling, and more) will be documented here as they're actually built.

## License

Licensed under the [MIT License](./LICENSE).
