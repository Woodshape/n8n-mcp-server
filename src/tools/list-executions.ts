import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { N8nClient } from "../client.js";

interface Execution {
  id: string;
  finished: boolean;
  mode: string;
  status: string;
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
  workflowName?: string;
}

interface ListResponse {
  data: Execution[];
  nextCursor?: string;
}

export function registerListExecutions(server: McpServer, client: N8nClient) {
  server.tool(
    "list_executions",
    "List workflow executions. Filter by workflow, status, or date range. Returns id, status, timing, and mode.",
    {
      workflowId: z
        .string()
        .optional()
        .describe("Filter by workflow ID"),
      status: z
        .enum(["error", "success", "waiting"])
        .optional()
        .describe("Filter by execution status"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(20)
        .describe("Max results (default 20)"),
    },
    async ({ workflowId, status, limit }) => {
      const params = new URLSearchParams();
      if (workflowId) params.set("workflowId", workflowId);
      if (status) params.set("status", status);
      params.set("limit", String(limit));
      params.set("includeData", "false");

      const qs = params.toString();
      const result = await client.get<ListResponse>(
        `/api/v1/executions?${qs}`,
      );

      const summary = result.data.map((e) => ({
        id: e.id,
        workflowId: e.workflowId,
        workflowName: e.workflowName,
        status: e.status,
        mode: e.mode,
        startedAt: e.startedAt,
        stoppedAt: e.stoppedAt,
        finished: e.finished,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    },
  );
}
