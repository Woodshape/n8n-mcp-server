import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { N8nClient } from "../client.js";

export function registerGetWorkflow(server: McpServer, client: N8nClient) {
  server.tool(
    "get_workflow",
    "Get a workflow by ID including its nodes, connections, and settings.",
    {
      id: z.string().describe("Workflow ID"),
    },
    async ({ id }) => {
      const workflow = await client.get<Record<string, unknown>>(
        `/api/v1/workflows/${id}`,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(workflow, null, 2),
          },
        ],
      };
    },
  );
}
