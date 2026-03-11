import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { N8nClient } from "../client.js";

interface ExecutionData {
  id: string;
  finished: boolean;
  mode: string;
  status: string;
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
  data?: {
    resultData?: {
      runData?: Record<
        string,
        Array<{
          startTime: number;
          executionTime: number;
          data?: { main?: Array<Array<{ json: unknown }>> };
          error?: { message: string; stack?: string };
        }>
      >;
      error?: { message: string };
    };
  };
}

export function registerGetExecution(server: McpServer, client: N8nClient) {
  server.tool(
    "get_execution",
    "Get execution details by ID. Shows status, timing, node results, and errors for debugging.",
    {
      id: z.string().describe("Execution ID"),
    },
    async ({ id }) => {
      const exec = await client.get<ExecutionData>(
        `/api/v1/executions/${id}?includeData=true`,
      );

      // Build a concise debug summary
      const summary: Record<string, unknown> = {
        id: exec.id,
        status: exec.status,
        finished: exec.finished,
        mode: exec.mode,
        workflowId: exec.workflowId,
        startedAt: exec.startedAt,
        stoppedAt: exec.stoppedAt,
      };

      const runData = exec.data?.resultData?.runData;
      if (runData) {
        const nodes: Record<string, unknown> = {};
        for (const [name, runs] of Object.entries(runData)) {
          const last = runs[runs.length - 1];
          nodes[name] = {
            executionTime: last.executionTime,
            error: last.error?.message ?? null,
            outputItems:
              last.data?.main?.reduce(
                (sum, branch) => sum + branch.length,
                0,
              ) ?? 0,
            outputSample: last.data?.main?.[0]?.slice(0, 3).map((i) => i.json),
          };
        }
        summary.nodes = nodes;
      }

      if (exec.data?.resultData?.error) {
        summary.error = exec.data.resultData.error.message;
      }

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
