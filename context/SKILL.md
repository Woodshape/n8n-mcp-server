---
name: n8n
description: "How to create, update, test, list, inspect, and manage n8n workflows using the local n8n-mcp-server MCP server tools (mcp__n8n-mcp-server__*). Use this skill for ANY n8n operation — including simple ones like 'show me workflow X', 'access workflow Y', 'what nodes does Z have', 'list my workflows', or 'get execution N'. Trigger any time the user mentions n8n, a workflow ID, workflow automation, n8n nodes, or wants to do anything at all with their n8n instance. Do NOT skip this skill just because the task seems simple."
---

# n8n Workflow Management via MCP

## Core Principle: Outline First, Drill Down, Then Act

To minimize token usage, always start with compact views and only fetch full data when needed. **Never call `get_workflow` as a first step** — use `get_workflow_outline` instead.

**Benchmarked (2026-03-11, 19-node workflow):** Using `get_workflow_outline` + targeted `get_workflow_node` calls vs. a single `get_workflow` call — even when fetching 14 of 19 nodes individually:
- **70% less MCP response data** (~17.5K vs ~59K chars)
- **14.5% fewer total LLM tokens** (19K vs 22K)
- **16% faster** (113s vs 135s)
- **Equal knowledge quality** (5/5 on all questions)

The efficiency gap grows with workflow size.

## Available MCP Tools

All n8n operations go through the local MCP server. Never use SSH for n8n operations.

### Reading workflows (use the lightest tool that answers the question)

| Tool | Purpose | Response size (benchmarked) |
|------|---------|---------------------------|
| `mcp__n8n-mcp-server__list_workflows` | List all workflows (optionally filter by active/tag) | ~500 chars |
| `mcp__n8n-mcp-server__get_workflow_outline` | Compact structure: node names, types, connection graph | ~1,500 chars (19-node workflow) |
| `mcp__n8n-mcp-server__get_workflow_node` | Full config of specific node(s) by name or type + connections | ~500-2,200 chars per node |
| `mcp__n8n-mcp-server__get_workflow` | Full raw workflow JSON — use sparingly | ~59,000 chars (19-node workflow) |

### Writing workflows

| Tool | Purpose |
|------|---------|
| `mcp__n8n-mcp-server__create_workflow` | Create a new workflow |
| `mcp__n8n-mcp-server__update_workflow` | Update an existing workflow (merge-update, supports `nodePatches` and `nodeReplacements`) |
| `mcp__n8n-mcp-server__delete_workflow` | Delete a workflow by ID |

### Testing and debugging

| Tool | Purpose |
|------|---------|
| `mcp__n8n-mcp-server__test_workflow` | Trigger a workflow via its webhook/form/chat trigger (supports GET/POST/PUT/DELETE via `httpMethod`) |
| `mcp__n8n-mcp-server__list_executions` | List executions, filter by workflowId and status |
| `mcp__n8n-mcp-server__get_execution` | Get execution details (compact by default, use `nodeName` for full output of specific node) |
| `mcp__n8n-mcp-server__get_node_types` | Search available n8n node types (requires N8N_EMAIL/N8N_PASSWORD for session auth) |

## Node Type Discovery

Always use `get_node_types` to look up exact node type names, versions, and properties before building workflows. Prefer native n8n nodes over HTTP Request "hacks" — only use HTTP Request when no native node exists for the operation.

The `get_node_types` tool uses session auth (separate from the API key) because the `/types/nodes.json` endpoint is internal. It requires `N8N_EMAIL` and `N8N_PASSWORD` env vars configured in `.mcp.json`.

### Native Node Preference

When designing workflows, search for native nodes first. Common native nodes available on this instance:

**Triggers:**
- `n8n-nodes-base.scheduleTrigger` (v1.1) — cron/interval scheduling
- `n8n-nodes-base.webhook` (v2) — HTTP webhook trigger
- `n8n-nodes-base.telegramTrigger` (v1.2) — real-time Telegram updates (requires bot in chat)
- `n8n-nodes-base.manualTrigger` — manual test trigger

**Services:**
- `n8n-nodes-base.telegram` (v1.2) — send messages, download files, manage chats
- `@n8n/n8n-nodes-langchain.openAi` (v2.1) — text, image, audio transcription (Whisper), files
- `@n8n/n8n-nodes-langchain.anthropic` (v1) — text messages, document/image analysis
- `@n8n/n8n-nodes-langchain.lmChatGroq` (v1) — Groq chat model (langchain sub-node only)

**Utilities:**
- `n8n-nodes-base.code` (v2) — JavaScript code execution
- `n8n-nodes-base.httpRequest` (v4.2) — generic HTTP calls (use only when no native node exists)
- `n8n-nodes-base.if` — conditional branching
- `n8n-nodes-base.set` — set/transform fields

### Known Native Node Gaps

These operations have no native n8n node and legitimately require HTTP Request:
- **Telegram getUpdates** — the Telegram node only supports sending, not polling. Use Telegram Trigger instead, or HTTP Request if polling is required.
- **Groq Whisper transcription** — only a Groq Chat Model node exists (langchain sub-node), no standalone Groq audio transcription node. Use HTTP Request to `https://api.groq.com/openai/v1/audio/transcriptions` with multipart form data.

### Existing Credentials on This Instance

When nodes require credentials, reference existing ones by ID:

| ID | Type | Name |
|----|------|------|
| `WnDa04O15AaI4M9O` | telegramApi | Telegram account (bot 1) |
| `hWU4u2ywKCwThtpx` | telegramApi | Telegram account 2 (used by UI) |
| `ic8PqelnStXLX3jw` | groqApi | Groq account |
| `mpNdh3ejcQU7Xlmx` | openRouterApi | OpenRouter account |
| `TS0pF780zMCUiTlb` | ollamaApi | Ollama account |
| `szRARiNGAbgQgB9E` | discordBotApi | Discord Bot account |
| `XcQQm2u7UKqYoqe9` | postgres | Postgres account |
| `Hl9gBnOEwasHgWhk` | githubApi | GitHub account |
| `IccpjeZmVDfNaFgI` | airtableTokenApi | Airtable account |

Credentials are referenced in nodes like:
```json
"credentials": {
  "telegramApi": {
    "id": "WnDa04O15AaI4M9O",
    "name": "Telegram account"
  }
}
```

User has API keys for: Anthropic, Groq, OpenRouter, Ollama. No OpenAI API key.

## Known Workflows

| ID | Name | Active | Description |
|----|------|--------|-------------|
| `tIfbOLa8RBZM9QmB` | Phonemo Transcription | yes | Telegram → ffmpeg split → Groq Whisper → summary → PDF → Telegram |
| `BKDD2LuutzZzMWvm` | Workflow Feedback Bot | yes | Workflow publish/schedule → AI review (OpenRouter) → Discord feedback |

## Workflow for Common Tasks

### Inspecting a Workflow

1. Call `get_workflow_outline(id)` to see node names, types, and the connection graph (~1,500 chars for a 19-node workflow)
2. If you need details on specific nodes, call `get_workflow_node(id, nodeName: "My Node")` for exact match or `get_workflow_node(id, nodeType: "code")` to find by type
3. Only call `get_workflow(id)` if you genuinely need the entire raw JSON (rare — e.g. full export, or you need every node's parameters at once)

**Decision heuristic — when to use `get_workflow` instead:**
- Workflow has <= 4 nodes (full JSON is small enough, one call is simpler)
- You need every node's config simultaneously (full migration, export)
- You'll inspect 80%+ of all nodes anyway AND the workflow is small (< 8 nodes)

For anything else, outline + targeted node fetches wins.

### Creating a Workflow

1. Use `get_node_types` to look up exact node type names and parameters
2. Use `create_workflow` with nodes and connections
3. Every node needs: `name`, `type`, `typeVersion`, `position`, `parameters`
4. Nodes requiring credentials need a `credentials` field referencing existing credential IDs
5. Positions should space nodes ~240px apart horizontally

### Updating a Workflow

1. Start with `get_workflow_outline(id)` to see the current structure
2. Use `get_workflow_node(id, nodeName: "Target Node")` to read the node(s) you plan to change
3. Use `update_workflow` with `nodePatches` to modify specific nodes — this avoids sending the full node array
4. Only use `update_workflow` with `nodes` when replacing the entire node set

**Prefer `nodePatches` over `nodes` when updating specific nodes.** `nodePatches` lets you update one or a few nodes by name without sending the full array — which would be too large to pass inline:

```json
{
  "id": "tIfbOLa8RBZM9QmB",
  "nodePatches": [
    {
      "name": "Read & Split Audio",
      "parameters": {
        "jsCode": "... new code ..."
      }
    }
  ]
}
```

**Use `nodeReplacements` when you need to change a node's type** (e.g. httpRequest → code). This preserves the node's name, id, and position while replacing type, typeVersion, and parameters:

```json
{
  "id": "tIfbOLa8RBZM9QmB",
  "nodeReplacements": [
    {
      "name": "Transcribe Chunk",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "parameters": {
        "jsCode": "... new code ..."
      }
    }
  ]
}
```

Only use `nodes` (full array) when restructuring the entire workflow (adding/removing nodes, reordering). When you do need the full array, use an Agent to handle the large payload.

### Testing a Workflow

Use `test_workflow` with `workflowId` and optional `data`/`message`. The tool auto-detects the trigger type (webhook, form, chat) and sends the appropriate request. Use the `httpMethod` parameter (default: POST) to specify GET, PUT, or DELETE for webhook triggers that expect a different method.

### Debugging a Failed Execution

1. `list_executions(workflowId, status: "error", limit: 5)` to find recent failures
2. `get_execution(executionId)` — returns compact summary with truncated output samples (strings capped at 200 chars)
3. `get_execution(executionId, nodeName: "Failing Node")` — returns full (untruncated) output for that specific node
4. `get_workflow_node(id, nodeName: "Failing Node")` to inspect the failing node's configuration
5. Fix with `update_workflow` using `nodePatches` (or `nodeReplacements` if the node type needs changing)
6. Verify with `get_workflow_outline` or `get_workflow_node` — do NOT call `get_workflow` just to confirm a change

## Critical n8n 2.x Knowledge

These are hard-won lessons from working with the n8n API. Ignoring them leads to confusing failures.

### Publishing vs. Activating

n8n 2.x has a two-tier system: **draft** and **published**. Workflows created via the API start as drafts.

- **Cron/schedule triggers** work on draft workflows (they run server-side)
- **Webhook triggers** and **Telegram triggers** only register for **published** workflows
- **Publishing requires the n8n UI** — there is no API endpoint for it
- After creating a trigger-based workflow via API, tell the user: "Open the workflow in the n8n UI, save it in the editor, and click Publish"

### The `active` Field is Read-Only on PUT

The n8n PUT `/api/v1/workflows/{id}` endpoint rejects requests containing `active`. To change activation state, use separate endpoints:

- **Activate:** `POST /api/v1/workflows/{id}/activate`
- **Deactivate:** `POST /api/v1/workflows/{id}/deactivate`

The `update_workflow` MCP tool handles this automatically — pass `active: true/false` and it calls the right endpoint.

### webhookId Property

Webhook nodes need a `webhookId` property at the node level for production webhook registration. This is auto-generated when you save a workflow in the n8n UI editor. API-created webhook nodes don't get it, which means:

- The webhook URL won't be registered even after publishing
- Fix: User must open the workflow in the n8n UI editor, save it (which generates webhookId), then publish

### Extra Properties on PUT

The n8n PUT endpoint only accepts these fields: `name`, `nodes`, `connections`, `settings`, `staticData`. Sending extra fields (like `createdAt`, `updatedAt`, `shared`, `versionId`) causes a 400 error. The `update_workflow` MCP tool already handles this correctly.

### Credential Validation on Save

n8n validates that all nodes have required credentials when saving. You cannot save a workflow with nodes that reference missing or non-existent credentials. Either:
- Reference existing credentials by ID (see table above)
- Have the user create credentials in the n8n UI first
- Use HTTP Request nodes with `$env.*` for API calls when no credential exists yet

## Code Node Capabilities

Task runners are **disabled** on this instance (`N8N_RUNNERS_MODE` not set to external). This means Code nodes run in the main n8n process and have full Node.js access:

- `require('child_process')` — available, use for shell commands
- `require('fs')` — available, use for file access
- `require('https')`, `require('url')` — available, use for HTTP requests
- `$env.MY_VAR` — environment variables accessible directly
- External packages: only those installed in the n8n container are available

**Sandbox restrictions — NO Web API globals:** The Code node sandbox does NOT expose `Blob`, `FormData`, `fetch`, or `URL` as globals, even with task runners disabled. For HTTP requests from Code nodes, use `require('https')` with manual multipart form data construction via `Buffer.concat()`. For URL parsing, use `const { URL } = require('url')`.

**Binary data access in "Run Once for All Items" mode:**
```javascript
// Access binary data by item index
const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, 'data');
// Create binary output
const binaryData = await this.helpers.prepareBinaryData(buffer, 'file.pdf', 'application/pdf');
```

```javascript
// Shell commands work in Code nodes on this instance
const { execSync } = require('child_process');
const result = execSync('ffmpeg -version', { encoding: 'utf-8' });
return [{ json: { output: result } }];
```

Note: ffmpeg is available at the system level (custom Dockerfile with static ffmpeg from `mwader/static-ffmpeg:7.1`).

## Infrastructure Notes

- **Telegram Bot API:** Local server running in Docker (`aiogram/telegram-bot-api`) with `--local` mode. Files downloaded to shared volume, accessible at `/telegram-files` in the n8n container. This bypasses the 20MB Telegram file download limit.
- **n8n container:** Added to group 101 (telegram-bot-api) for file read access from shared volume.

## Node Configuration Examples

### Schedule Trigger
```json
{
  "name": "Daily 9am Trigger",
  "type": "n8n-nodes-base.scheduleTrigger",
  "typeVersion": 1.1,
  "position": [240, 300],
  "parameters": {
    "rule": {
      "interval": [
        {
          "field": "cronExpression",
          "expression": "0 9 * * *"
        }
      ]
    }
  }
}
```
For simple intervals, use `"field": "hours"` with `"hoursInterval": 2` (every 2 hours). For daily at a specific time, use `cronExpression` as shown above. No credentials needed. Set `"timezone": "Europe/Berlin"` in workflow `settings` to ensure correct local time.

### Telegram Trigger
```json
{
  "name": "Telegram Trigger",
  "type": "n8n-nodes-base.telegramTrigger",
  "typeVersion": 1.2,
  "position": [240, 300],
  "parameters": {
    "updates": ["message"],
    "additionalFields": {}
  },
  "credentials": {
    "telegramApi": { "id": "WnDa04O15AaI4M9O", "name": "Telegram account" }
  }
}
```
Note: Bot must be in the chat. For groups, disable group privacy via @BotFather (`/setprivacy` → Disable).

### Telegram Send Message
```json
{
  "name": "Send Message",
  "type": "n8n-nodes-base.telegram",
  "typeVersion": 1.2,
  "position": [500, 300],
  "parameters": {
    "resource": "message",
    "operation": "sendMessage",
    "chatId": "={{ $json.chatId }}",
    "text": "={{ $json.text }}",
    "additionalFields": { "parse_mode": "Markdown" }
  },
  "credentials": {
    "telegramApi": { "id": "WnDa04O15AaI4M9O", "name": "Telegram account" }
  }
}
```
The `resource` and `operation` fields are required — omitting them causes silent failures. All Telegram action nodes need both.

**Finding a chat ID:** The easiest way is to add a Telegram Trigger to a test workflow and send a message to the bot — the trigger output includes `message.chat.id`. Alternatively, use the bot's `getUpdates` endpoint via HTTP Request. Rasmus's personal chat ID can be found in existing Phonemo workflow executions.

### Telegram Download File
```json
{
  "name": "Download File",
  "type": "n8n-nodes-base.telegram",
  "typeVersion": 1.2,
  "position": [500, 300],
  "parameters": {
    "resource": "file",
    "operation": "get",
    "fileId": "={{ $json.fileId }}",
    "download": true
  },
  "credentials": {
    "telegramApi": { "id": "WnDa04O15AaI4M9O", "name": "Telegram account" }
  }
}
```
Note: Standard Telegram Bot API limits file downloads to 20MB. Use the local Telegram Bot API server (files at `/telegram-files`) for larger files.

### Groq Whisper Transcription (via HTTP Request)
```json
{
  "name": "Transcribe Audio",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [750, 300],
  "parameters": {
    "method": "POST",
    "url": "https://api.groq.com/openai/v1/audio/transcriptions",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "Authorization", "value": "=Bearer {{ $env.GROQ_API_KEY }}" }
      ]
    },
    "sendBody": true,
    "contentType": "multipart-form-data",
    "bodyParameters": {
      "parameters": [
        { "parameterType": "formBinaryData", "name": "file", "inputDataFieldName": "data" },
        { "parameterType": "formData", "name": "model", "value": "whisper-large-v3" },
        { "parameterType": "formData", "name": "response_format", "value": "verbose_json" }
      ]
    },
    "options": { "timeout": 300000 }
  }
}
```
Note: Max 25MB file size per request. No native Groq transcription node exists.

### Code Node (JavaScript)
```json
{
  "name": "Process Data",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [500, 300],
  "parameters": {
    "jsCode": "const items = $input.all();\nreturn items;"
  }
}
```

### IF Node (Conditional)
```json
{
  "name": "Check Condition",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2,
  "position": [500, 300],
  "parameters": {
    "conditions": {
      "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose" },
      "conditions": [
        {
          "leftValue": "={{ $json.status }}",
          "rightValue": "active",
          "operator": { "type": "string", "operation": "equals" }
        }
      ],
      "combinator": "and"
    }
  }
}
```
IF v2 outputs to two branches: index 0 (true) and index 1 (false). Connect both in `connections`.

### Set Node (Edit Fields)
```json
{
  "name": "Set Fields",
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.4,
  "position": [500, 300],
  "parameters": {
    "mode": "manual",
    "fields": {
      "values": [
        { "name": "greeting", "stringValue": "Hello!", "type": "stringValue" },
        { "name": "count", "numberValue": 42, "type": "numberValue" }
      ]
    },
    "options": {}
  }
}
```

### Connections Format

Connections map output node names to input node names:

```json
{
  "Trigger Node": {
    "main": [[{ "node": "Next Node", "type": "main", "index": 0 }]]
  },
  "Next Node": {
    "main": [[{ "node": "Final Node", "type": "main", "index": 0 }]]
  }
}
```

## Workflow Pattern: Step-by-Step

When building a workflow from scratch:

1. **Research** — Use `get_node_types` to find native nodes for each operation
2. **Check credentials** — Verify required credentials exist (see table above)
3. **Design** — Plan the node chain, preferring native nodes over HTTP Request
4. **Create** — Use `create_workflow` with all nodes, connections, and credential references
5. **Verify** — Use `get_workflow_outline` to confirm structure, `get_workflow_node` to spot-check specific nodes
6. **Activate** — Use `update_workflow` with `active: true`
7. **Publish** (if trigger-based) — Tell user to publish in n8n UI
8. **Test** — Use `test_workflow` to trigger and verify
9. **Debug** — Use `get_execution` to inspect results, `get_workflow_node` to check failing node config

## Anti-patterns to Avoid

- **Calling `get_workflow` to check a workflow's structure** — use `get_workflow_outline`. Benchmarked: ~1,500 chars vs ~59,000 chars for a 19-node workflow (39x smaller).
- **Calling `get_workflow` to see one node's config** — use `get_workflow_node(id, nodeName: "...")`. A single node fetch is ~500-2,200 chars vs the full ~59,000.
- **Calling `get_workflow` for a deep investigation** — even fetching 14 of 19 nodes individually uses 70% less data than one `get_workflow` call.
- **Using `update_workflow` with full `nodes` array to change one node** — use `nodePatches` instead.
- **Calling `get_workflow` after an update just to verify** — use `get_workflow_outline` to confirm structure, or `get_workflow_node` to verify the specific node you changed.

## Instance Details

- **URL:** Configured via `N8N_API_URL` env var
- **Version:** n8n v2.8.3
- **Auth:** API key via `X-N8N-API-KEY` header (configured in MCP server env)
- **Session auth:** N8N_EMAIL + N8N_PASSWORD (for internal endpoints like node type lookup)
- **Database:** PostgreSQL with pgvector extension
- **Deployment:** Docker with Traefik reverse proxy
- **Task runners:** Disabled — Code nodes run in main process with full Node.js access
