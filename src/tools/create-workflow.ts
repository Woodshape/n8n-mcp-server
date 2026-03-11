import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { N8nClient } from "../client.js";

const NodeSchema = z.object({
  id: z.string().optional().describe("Node ID (auto-generated if omitted)"),
  name: z.string().describe("Node display name"),
  type: z.string().describe("Node type (e.g. n8n-nodes-base.webhook)"),
  typeVersion: z.number().default(1).describe("Node type version"),
  position: z
    .tuple([z.number(), z.number()])
    .describe("Canvas position [x, y]"),
  parameters: z
    .record(z.unknown())
    .default({})
    .describe("Node configuration parameters"),
  credentials: z
    .record(z.unknown())
    .optional()
    .describe("Credential references"),
});

export function registerCreateWorkflow(server: McpServer, client: N8nClient) {
  server.tool(
    "create_workflow",
    "Create a new n8n workflow with nodes and connections. Returns the created workflow with its ID.",
    {
      name: z.string().describe("Workflow name"),
      nodes: z.array(NodeSchema).describe("Array of workflow nodes"),
      connections: z
        .record(z.unknown())
        .default({})
        .describe(
          "Connection map: { sourceNodeName: { main: [[{ node: targetName, type: 'main', index: 0 }]] } }",
        ),
      active: z
        .boolean()
        .default(false)
        .describe("Activate workflow after creation"),
      settings: z
        .record(z.unknown())
        .optional()
        .describe("Workflow settings (timezone, executionOrder, etc.)"),
    },
    async ({ name, nodes, connections, active, settings }) => {
      // Assign IDs to nodes that don't have them
      const nodesWithIds = nodes.map((n, i) => ({
        ...n,
        id: n.id ?? crypto.randomUUID(),
        position: n.position ?? [250 * i, 300],
      }));

      const body: Record<string, unknown> = {
        name,
        nodes: nodesWithIds,
        connections,
        settings: settings ?? { executionOrder: "v1" },
      };

      const created = await client.post<Record<string, unknown>>(
        "/api/v1/workflows",
        body,
      );

      // Activate if requested
      if (active && created.id) {
        try {
          await client.put(`/api/v1/workflows/${created.id}`, {
            ...created,
            active: true,
          });
          (created as Record<string, unknown>).active = true;
        } catch (e) {
          (created as Record<string, unknown>).activationError = (
            e as Error
          ).message;
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: created.id,
                name: created.name,
                active: created.active,
                nodeCount: nodesWithIds.length,
                message: "Workflow created successfully",
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
