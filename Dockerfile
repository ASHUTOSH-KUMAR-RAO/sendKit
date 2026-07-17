# ---- Stage 1: Build ----
FROM oven/bun:1.3.11-slim AS builder
WORKDIR /app

# Copy workspace manifests first (better layer caching)
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/package.json
COPY packages/local-mcp/package.json packages/local-mcp/package.json
COPY packages/remote-mcp/package.json packages/remote-mcp/package.json
COPY packages/cli/package.json packages/cli/package.json

RUN bun install --frozen-lockfile

# Copy the rest of the source
COPY . .

# Build in dependency order: core -> local-mcp -> remote-mcp
RUN bun run --cwd packages/core build
RUN bun run --cwd packages/local-mcp build
RUN bun run --cwd packages/remote-mcp build

# ---- Stage 2: Runtime ----
FROM oven/bun:1.3.11-slim AS runtime
WORKDIR /app

# Only what's needed to run remote-mcp at runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/remote-mcp/dist ./packages/remote-mcp/dist
COPY --from=builder /app/packages/remote-mcp/package.json ./packages/remote-mcp/package.json

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "packages/remote-mcp/dist/index.js"]
