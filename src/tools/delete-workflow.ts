import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { N8nClient } from "../client.js";

export function registerDeleteWorkflow(server: McpServer, client: N8nClient) {
  server.tool(
    "delete_workflow",
    "Delete an n8n workflow by ID. Returns confirmation with the deleted workflow's name.",
    {
      id: z.string().describe("Workflow ID to delete"),
    },
    async ({ id }) => {
      const deleted = await client.delete<Record<string, unknown>>(
        `/api/v1/workflows/${id}`,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: deleted.id,
                name: deleted.name,
                message: "Workflow deleted successfully",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
