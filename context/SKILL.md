---
name: n8n
description: "How to create, update, test, list, inspect, and manage n8n workflows using the n8n-mcp-server MCP server tools (mcp__n8n-mcp-server__*). Use this skill for ANY n8n operation — including simple ones like 'show me workflow X', 'access workflow Y', 'what nodes does Z have', 'list my workflows', or 'get execution N'. Trigger any time the user mentions n8n, a workflow ID, workflow automation, n8n nodes, or wants to do anything at all with their n8n instance. Do NOT skip this skill just because the task seems simple."
---

# n8n Workflow Management via MCP

## Core Principle: Outline First, Drill Down, Then Act

To minimize token usage, always start with compact views and only fetch full data when needed. **Never call `get_workflow` as a first step** — use `get_workflow_outline` instead.

Using `get_workflow_outline` + targeted `get_workflow_node` calls vs. a single `get_workflow` call yields:
- **~70% less MCP response data**
- **~15% fewer total LLM tokens**
- **~16% faster execution**
- **Equal knowledge quality**

The efficiency gap grows with workflow size.

## Available MCP Tools

All n8n operations go through the MCP server.

### Reading workflows (use the lightest tool that answers the question)

| Tool | Purpose | Relative cost |
|------|---------|---------------|
| `mcp__n8n-mcp-server__list_workflows` | List all workflows (optionally filter by active/tag) | Low |
| `mcp__n8n-mcp-server__get_workflow_outline` | Compact structure: node names, types, connection graph | Low |
| `mcp__n8n-mcp-server__get_workflow_node` | Full config of specific node(s) by name or type + connections | Medium |
| `mcp__n8n-mcp-server__get_workflow` | Full raw workflow JSON — use sparingly | High |

### Writing workflows

| Tool | Purpose |
|------|---------|
| `mcp__n8n-mcp-server__create_workflow` | Create a new workflow |
| `mcp__n8n-mcp-server__update_workflow` | Update an existing workflow (merge-update, supports `nodePatches`) |

### Testing and debugging

| Tool | Purpose |
|------|---------|
| `mcp__n8n-mcp-server__test_workflow` | Trigger a workflow via its webhook/form/chat trigger (supports GET/POST/PUT/DELETE via `httpMethod`) |
| `mcp__n8n-mcp-server__list_executions` | List executions, filter by workflowId and status |
| `mcp__n8n-mcp-server__get_execution` | Get execution details and results |
| `mcp__n8n-mcp-server__get_node_types` | Search available n8n node types (requires N8N_EMAIL/N8N_PASSWORD for session auth) |

## Node Type Discovery

Always use `get_node_types` to look up exact node type names, versions, and properties before building workflows. Prefer native n8n nodes over HTTP Request — only use HTTP Request when no native node exists for the operation.

The `get_node_types` tool uses session auth (separate from the API key) because the `/types/nodes.json` endpoint is internal. It requires `N8N_EMAIL` and `N8N_PASSWORD` env vars.

Credentials are referenced in nodes like:
```json
"credentials": {
  "telegramApi": {
    "id": "YOUR_CREDENTIAL_ID",
    "name": "Your credential name"
  }
}
```

## Workflow for Common Tasks

### Inspecting a Workflow

1. Call `get_workflow_outline(id)` to see node names, types, and the connection graph
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

**Prefer `nodePatches` over `nodes` when updating specific nodes.** `nodePatches` lets you update one or a few nodes by name without sending the full array:

```json
{
  "id": "WORKFLOW_ID",
  "nodePatches": [
    {
      "name": "My Code Node",
      "parameters": {
        "jsCode": "... new code ..."
      }
    }
  ]
}
```

Only use `nodes` (full array) when restructuring the entire workflow (adding/removing nodes, reordering).

### Testing a Workflow

Use `test_workflow` with `workflowId` and optional `data`/`message`. The tool auto-detects the trigger type (webhook, form, chat) and sends the appropriate request. Use the `httpMethod` parameter (default: POST) to specify GET, PUT, or DELETE for webhook triggers that expect a different method.

### Debugging a Failed Execution

1. `list_executions(workflowId, status: "error", limit: 5)` to find recent failures
2. `get_execution(executionId)` to see full execution data including error details
3. `get_workflow_node(id, nodeName: "Failing Node")` to inspect the failing node's configuration
4. Fix with `update_workflow` using `nodePatches`
5. Verify with `get_workflow_outline` or `get_workflow_node` — do NOT call `get_workflow` just to confirm a change

## Critical n8n API Knowledge

### Publishing vs. Activating

n8n has a two-tier system: **draft** and **published**. Workflows created via the API start as drafts.

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
- Reference existing credentials by ID
- Have the user create credentials in the n8n UI first
- Use HTTP Request nodes with `$env.*` for API calls when no credential exists yet

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
For simple intervals, use `"field": "hours"` with `"hoursInterval": 2` (every 2 hours). For daily at a specific time, use `cronExpression` as shown above. No credentials needed.

### Webhook Trigger
```json
{
  "name": "Webhook",
  "type": "n8n-nodes-base.webhook",
  "typeVersion": 2,
  "position": [240, 300],
  "parameters": {
    "path": "my-webhook",
    "httpMethod": "POST"
  }
}
```

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
2. **Check credentials** — Verify required credentials exist
3. **Design** — Plan the node chain, preferring native nodes over HTTP Request
4. **Create** — Use `create_workflow` with all nodes, connections, and credential references
5. **Verify** — Use `get_workflow_outline` to confirm structure, `get_workflow_node` to spot-check specific nodes
6. **Activate** — Use `update_workflow` with `active: true`
7. **Publish** (if trigger-based) — Tell user to publish in n8n UI
8. **Test** — Use `test_workflow` to trigger and verify
9. **Debug** — Use `get_execution` to inspect results, `get_workflow_node` to check failing node config

## Anti-patterns to Avoid

- **Calling `get_workflow` to check a workflow's structure** — use `get_workflow_outline`, it's ~30-40x smaller.
- **Calling `get_workflow` to see one node's config** — use `get_workflow_node(id, nodeName: "...")`.
- **Calling `get_workflow` for a deep investigation** — even fetching most nodes individually uses ~70% less data than one `get_workflow` call.
- **Using `update_workflow` with full `nodes` array to change one node** — use `nodePatches` instead.
- **Calling `get_workflow` after an update just to verify** — use `get_workflow_outline` to confirm structure, or `get_workflow_node` to verify the specific node you changed.
