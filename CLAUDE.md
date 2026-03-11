# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm run build          # tsc → dist/
npm run start          # node dist/index.js (needs env vars)
./run.sh               # sources .env then runs dist/index.js
```

No test framework is configured. No linter is configured.

## Architecture

This is an MCP server that exposes n8n workflow automation as tools for Claude Code. It communicates over **stdio** (JSON-RPC) using `@modelcontextprotocol/sdk`.

**Entry point:** `src/index.ts` — creates `McpServer`, instantiates `N8nClient`, registers all tools, connects via `StdioServerTransport`.

**HTTP client:** `src/client.ts` (`N8nClient`) — two auth modes:
- **API key auth** (`X-N8N-API-KEY` header) for REST API endpoints (`get`, `post`, `put`, `request` methods)
- **Session auth** (`getInternal`) for internal endpoints like `/types/nodes.json` — logs in via `/rest/login` with email/password, caches the session cookie

**Tool pattern:** Each tool lives in `src/tools/<name>.ts` and exports a `register<Name>(server, client)` function that calls `server.tool()` with a name, description, zod schema for params, and an async handler. Tools return `{ content: [{ type: "text", text: string }] }`. Error responses add `isError: true`.

**Global MCP config:** `~/.claude/.mcp.json` points to `run.sh`, making these tools available from any directory.

## Adding a New Tool

1. Create `src/tools/<name>.ts` with a `register<Name>(server: McpServer, client: N8nClient)` export
2. Define params with zod, handler calls `client.get/post/put/request` (API key auth) or `client.getInternal` (session auth)
3. Import and call the register function in `src/index.ts`
4. `npm run build`

## Environment Variables

Required: `N8N_API_URL`, `N8N_API_KEY`
Optional (for internal endpoints): `N8N_EMAIL`, `N8N_PASSWORD`
