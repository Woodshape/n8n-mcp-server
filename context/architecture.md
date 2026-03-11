# n8n MCP Server Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Claude Code                         │
│                   (MCP Client)                          │
└──────────────────────┬──────────────────────────────────┘
                       │ stdio (JSON-RPC)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   src/index.ts                          │
│               McpServer ("n8n" v1.0.0)                  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │              StdioServerTransport                  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │               N8nClient (client.ts)               │  │
│  │         baseUrl + apiKey (from env vars)           │  │
│  │         email + password (for session auth)        │  │
│  │         get<T>() / post<T>() / put<T>()           │  │
│  │         getInternal<T>() (session cookie auth)     │  │
│  │         Header: X-N8N-API-KEY                     │  │
│  └──────────────────┬────────────────────────────────┘  │
│                     │                                   │
│  ┌──────────────────┴────────────────────────────────┐  │
│  │                 8 Tools                            │  │
│  │                                                   │  │
│  │  ┌─────────────────┐  ┌────────────────────────┐  │  │
│  │  │ list_workflows  │  │    get_workflow         │  │  │
│  │  │ GET /api/v1/    │  │ GET /api/v1/            │  │  │
│  │  │   workflows     │  │   workflows/{id}        │  │  │
│  │  └─────────────────┘  └────────────────────────┘  │  │
│  │                                                   │  │
│  │  ┌─────────────────┐  ┌────────────────────────┐  │  │
│  │  │ create_workflow │  │  update_workflow        │  │  │
│  │  │ POST /api/v1/   │  │ GET + PUT /api/v1/      │  │  │
│  │  │   workflows     │  │   workflows/{id}        │  │  │
│  │  │ + optional POST │  │ + optional POST         │  │  │
│  │  │   to activate   │  │   activate/deactivate   │  │  │
│  │  └─────────────────┘  └────────────────────────┘  │  │
│  │                                                   │  │
│  │  ┌─────────────────┐  ┌────────────────────────┐  │  │
│  │  │ test_workflow   │  │   get_node_types       │  │  │
│  │  │ 1. GET workflow │  │ GET /types/            │  │  │
│  │  │ 2. Find trigger │  │   nodes.json           │  │  │
│  │  │ 3. POST activate│  │ (session auth via      │  │  │
│  │  │ 4. POST webhook │  │  getInternal)          │  │  │
│  │  └─────────────────┘  └────────────────────────┘  │  │
│  │                                                   │  │
│  │  ┌─────────────────┐  ┌────────────────────────┐  │  │
│  │  │ get_execution   │  │  list_executions       │  │  │
│  │  │ GET /api/v1/    │  │ GET /api/v1/            │  │  │
│  │  │   executions/   │  │   executions?workflow   │  │  │
│  │  │   {id}?include  │  │   Id=&status=&limit=    │  │  │
│  │  │   Data=true     │  │                         │  │  │
│  │  └─────────────────┘  └────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                       │ HTTPS (native fetch)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              n8n Instance                               │
│          https://your-n8n-instance.example.com                    │
│                                                         │
│  /api/v1/workflows      REST API (API key auth)        │
│  /api/v1/executions     REST API (API key auth)        │
│  /rest/login            Session auth (email/password)  │
│  /types/nodes.json      Internal (session auth)        │
│  /webhook/{path}        Production webhook receiver    │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

Claude Code ←stdio→ McpServer → N8nClient ←HTTPS→ n8n instance

## Auth Chain

**API key auth** (for REST API endpoints):
`~/claude/n8n-mcp-server/.env` → `run.sh` sources it → `process.env` → `X-N8N-API-KEY` header

**Session auth** (for internal endpoints like node types):
`N8N_EMAIL` + `N8N_PASSWORD` from `.env` → POST `/rest/login` → session cookie → `Cookie` header

## Global MCP Setup

- Project location: `~/claude/n8n-mcp-server/`
- Global config: `~/.claude/.mcp.json` → calls `run.sh`
- `run.sh` sources `.env` then runs `node dist/index.js`
- Available from any directory in Claude Code

## Scripts

`scripts/` — legacy deployment artifacts (workflow now uses native n8n nodes):

| File                                    | Purpose                                                  |
| --------------------------------------- | -------------------------------------------------------- |
| `transcribe.py`                         | Python helper: Telethon download, ffmpeg chunk, Whisper (legacy — replaced by native nodes) |
| `phonemo-transcription-workflow.json`   | Original workflow JSON (superseded by current workflow on instance) |

## Current Workflow

The Phonemo Transcription workflow (ID: `tIfbOLa8RBZM9QmB`) has two entry points:

**Telegram path:**
Telegram Trigger → Extract Audio → Get File Info → Read & Split Audio → Transcribe Chunk (Groq Whisper) → Merge Transcripts → Prepare Summary Request → Summarize Transcript (Groq Llama 3.3 70B) → Format Message → Route Output → Send Result (Telegram)

**Webhook test path:**
Webhook (`POST /webhook/phonemo-test`) → Webhook Extract → Read & Split Audio → ... same pipeline ... → Route Output → Respond to Webhook (returns JSON)

Route Output checks `chatId != 'webhook-test'` to decide which path to take.

Features:
- Audio file cleanup: `fs.unlinkSync()` after reading into memory (requires `:rw` volume mount)
- Large file support: ffmpeg splitting for files >24MB
- German system prompt for structured summaries (Zusammenfassung, Kernthemen, Action Items, Zitate)
- Requires: bot in source chat, GROQ_API_KEY, TELEGRAM_BOT_TOKEN
