# sendkit

**One core. Every AI interface.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-fbf0df?logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Status](https://img.shields.io/badge/status-work%20in%20progress-orange)](#roadmap)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

sendkit is a messaging toolkit built around a single shared core that powers a CLI, a local MCP server, a remote MCP server, and an Anthropic Skill — write your sending logic once, and use it from a terminal, Claude Desktop, ChatGPT, or any MCP-compatible agent.

The first supported channel is **Telegram**, with more channels planned.

---

## Table of Contents

- [Why sendkit](#why-sendkit)
- [Architecture](#architecture)
- [Project Status](#project-status)
- [Roadmap](#roadmap)
- [Planned Extensions](#planned-extensions)
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

## Project Status

🚧 **Active development.** This project is being built incrementally and in public. Core sending logic and the CLI are functional; MCP servers, OAuth, and packaging are in progress.

## Planned Extensions

Beyond the core roadmap above, the following are planned:

| Feature | Description |
|---|---|
| **Multi-channel support** | WhatsApp, Discord, Slack, and email, in addition to Telegram. |
| **Message templates** | Reusable, named message templates instead of retyping the same text. |
| **Retry with backoff** | Automatic retries with exponential backoff on provider rate limits (e.g. Telegram's `429`). |
| **Send history & logging** | A local record of sent messages — channel, recipient, status, timestamp — for debugging and auditing. |
| **Multi-profile config** | Multiple bot/account profiles, switchable via flag (e.g. `sendkit --profile work telegram ...`). |
| **Two-way communication** | Capture replies sent back by the recipient via webhooks or polling, so conversations aren't one-directional. |

## Tech Stack

- **[Bun](https://bun.sh)** — runtime and monorepo workspace manager
- **TypeScript** — end to end
- **[Commander.js](https://github.com/tj/commander.js)** — CLI framework
- **[Model Context Protocol (MCP)](https://modelcontextprotocol.io)** — local and remote agent integration

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed (`curl -fsSL https://bun.sh/install | bash`)
- A [Telegram Bot Token](https://core.telegram.org/bots#how-do-i-create-a-bot) (via [@BotFather](https://t.me/BotFather))

### Installation

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

## Usage

### CLI

```bash
bun run dev:cli telegram <chatId> "<message>"
```

**Example:**

```bash
bun run dev:cli telegram 8709937518 "Hello from sendkit!"
```

> Don't know your chat ID? Send any message to your bot, then hit `https://api.telegram.org/bot<TOKEN>/getUpdates` to find it under `message.chat.id`.

More usage examples (MCP, Skill) will be added here as those interfaces are completed.

## Project Structure

This is a Bun-managed monorepo. Shared logic lives in a core package; every interface (CLI, MCP servers, Skill) is a separate workspace package that depends on it.

## Contributing

This project is primarily a learning build, but suggestions, issues, and pull requests are welcome. If you spot a bug or have an idea for one of the planned extensions, feel free to open an issue.

## License

Licensed under the [MIT License](./LICENSE).
