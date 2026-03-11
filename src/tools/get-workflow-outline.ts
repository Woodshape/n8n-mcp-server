import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { N8nClient } from "../client.js";
import type { Workflow } from "../types.js";
import { getOutline } from "../workflow-parser.js";

export function registerGetWorkflowOutline(
  server: McpServer,
  client: N8nClient,
) {
  server.tool(
    "get_workflow_outline",
    "Get a compact overview of a workflow's structure: node names, types, and connection graph. Use this first to understand a workflow before drilling into specific nodes with get_workflow_node.",
    {
      id: z.string().describe("Workflow ID"),
    },
    async ({ id }) => {
      const workflow = await client.get<Workflow>(
        `/api/v1/workflows/${id}`,
      );

      const outline = getOutline(workflow);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(outline, null, 2),
          },
        ],
      };
    },
  );
}
