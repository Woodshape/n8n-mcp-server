# Benchmark: n8n Skill Token Efficiency

**Date:** 2026-03-11
**Workflow under test:** Phonemo Transcription (`tIfbOLa8RBZM9QmB`, 19 nodes)
**Test:** Answer 5 progressively deeper questions about the workflow using two approaches

## Approaches

- **A: Outline + Node** (skill-recommended) — `get_workflow_outline` first, then `get_workflow_node` for specific nodes as needed
- **B: Full Workflow** — single `get_workflow` call returning entire raw JSON

## Test Questions

1. **Structure** — Describe overall workflow structure, node count, types, flow, both entry points
2. **Audio processing** — Explain audio compression and splitting (format, bitrate, segments, method)
3. **Transcription** — Credentials, API endpoints, model, and parameters for transcription
4. **PDF generation** — Library, formatting/styling, sections, output format
5. **Path differences** — Complete differences between Telegram production and webhook test paths

## Results

### Token Efficiency

| Metric | A: Outline + Node | B: Full Workflow | Delta |
|--------|-------------------|-----------------|-------|
| Total agent tokens | **19,077** | 22,316 | A saves 14.5% |
| MCP response chars | **~17,500** | ~59,200 | A saves 70.4% |
| MCP tool calls | 14 | **1** | B uses fewer calls |
| Total tool uses | 15 | 7 | B uses fewer tools |

### Speed

| Metric | A: Outline + Node | B: Full Workflow | Delta |
|--------|-------------------|-----------------|-------|
| Total duration | **113s** | 135s | A is 16.3% faster |

### Knowledge Quality

| Question | A: Outline + Node | B: Full Workflow |
|----------|-------------------|-----------------|
| 1. Structure | Full | Full |
| 2. Audio processing | Full | Full |
| 3. Transcription | Full | Full |
| 4. PDF generation | Full | Full |
| 5. Path differences | Full | Full |
| **Score** | **5/5** | **5/5** |

Both approaches produced equivalent depth and accuracy across all questions.

## Approach A: Tool Call Breakdown

| # | Tool | Purpose | Est. chars |
|---|------|---------|-----------|
| 1 | `get_workflow_outline` | Overall structure and connections | ~1,500 |
| 2 | `get_workflow_node("Read & Split Audio")` | Audio processing details | ~2,000 |
| 3 | `get_workflow_node("Transcribe Chunk")` | Transcription config | ~800 |
| 4 | `get_workflow_node("Generate PDF")` | PDF generation (production) | ~2,200 |
| 5 | `get_workflow_node("Route Output")` | Routing logic/condition | ~500 |
| 6 | `get_workflow_node("Telegram Trigger")` | Entry point config | ~500 |
| 7 | `get_workflow_node("Webhook")` | Entry point config | ~500 |
| 8 | `get_workflow_node("Test Generate PDF")` | PDF generation (test) | ~1,500 |
| 9 | `get_workflow_node("Send PDF")` | PDF delivery method | ~800 |
| 10 | `get_workflow_node("Send Result")` | Telegram text send | ~800 |
| 11 | `get_workflow_node("Extract Audio")` | Telegram extraction logic | ~900 |
| 12 | `get_workflow_node("Webhook Extract")` | Webhook extraction logic | ~1,100 |
| 13 | `get_workflow_node("Respond to Webhook")` | Webhook response config | ~500 |
| 14 | `get_workflow_node("Prepare Detailed Request")` | Detailed summary prompt/model | ~2,200 |
| | **Total** | | **~15,800** |

## Approach B: Tool Call Breakdown

| # | Tool | Purpose | Est. chars |
|---|------|---------|-----------|
| 1 | `get_workflow` | Entire workflow JSON | ~59,200 |

## Analysis

### Why Approach A wins on tokens despite 14x more calls

The full workflow JSON (~59K chars) contains every node's complete config, positions, IDs, metadata, and connection arrays — most of which is irrelevant to any single question. Approach A fetches only what's needed for each question, keeping the LLM's context window lean.

Even when fetching 14 of 19 nodes individually (an exhaustive audit covering 74% of all nodes), the targeted responses totaled only ~17.5K chars — 70% less data than the full workflow dump.

### Why Approach A is faster

Despite more round-trips, Approach A completed 16% faster. The LLM spends less time processing smaller, focused responses than parsing a single massive JSON blob. The overhead of additional MCP calls is negligible compared to LLM processing time.

### When Approach B might win

- **Very small workflows** (< 5 nodes) where full JSON is compact
- **Tasks requiring every node's config simultaneously** (full export, migration)
- **Single-question lookups** where you'd otherwise need 15+ targeted fetches anyway

### Scaling prediction

The efficiency gap grows with workflow size. A 50-node workflow would produce ~150K+ chars via `get_workflow`, while targeted fetches for a typical 3-5 node investigation would stay under ~5K chars.

## Conclusion

The skill's "outline first, drill down" strategy is validated. For the standard use case of understanding and modifying workflows, `get_workflow_outline` + `get_workflow_node` delivers:
- **14.5% fewer total tokens** (LLM processing)
- **70% less MCP response data** (context window efficiency)
- **16% faster completion** (wall clock time)
- **Equivalent knowledge quality** (5/5 on all questions)
