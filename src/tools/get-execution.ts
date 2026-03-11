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

function truncateStrings(obj: unknown, maxLen: number): unknown {
  if (typeof obj === "string") {
    return obj.length > maxLen ? obj.slice(0, maxLen) + "…" : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => truncateStrings(item, maxLen));
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = truncateStrings(value, maxLen);
    }
    return result;
  }
  return obj;
}

export function registerGetExecution(server: McpServer, client: N8nClient) {
  server.tool(
    "get_execution",
    "Get execution details by ID. Shows status, timing, node results, and errors for debugging. By default returns compact summaries with truncated output samples. Use nodeName to get full output for specific nodes.",
    {
      id: z.string().describe("Execution ID"),
      nodeName: z
        .string()
        .optional()
        .describe("Filter to a specific node by name — returns full (untruncated) output for that node"),
    },
    async ({ id, nodeName }) => {
      const exec = await client.get<ExecutionData>(
        `/api/v1/executions/${id}?includeData=true`,
      );

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
          if (nodeName && name !== nodeName) continue;
          const last = runs[runs.length - 1];
          const outputItems =
            last.data?.main?.reduce(
              (sum, branch) => sum + branch.length,
              0,
            ) ?? 0;
          const rawSample = last.data?.main?.[0]?.slice(0, 3).map((i) => i.json);
          const outputSample = nodeName
            ? rawSample
            : truncateStrings(rawSample, 200);

          nodes[name] = {
            executionTime: last.executionTime,
            error: last.error?.message ?? null,
            outputItems,
            outputSample,
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
