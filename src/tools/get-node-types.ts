import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { N8nClient } from "../client.js";

interface NodeType {
  name: string;
  displayName: string;
  description: string;
  group: string[];
  version: number | number[];
  defaults?: { name?: string };
  inputs?: string[];
  outputs?: string[];
  properties?: Array<{ name: string; type: string; displayName?: string }>;
}

export function registerGetNodeTypes(server: McpServer, client: N8nClient) {
  server.tool(
    "get_node_types",
    "Search available n8n node types. Returns matching nodes with name, description, and basic property info.",
    {
      query: z
        .string()
        .optional()
        .describe("Search term to filter node types (matches name/description)"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(20)
        .describe("Max results (default 20)"),
    },
    async ({ query, limit }) => {
      let nodes: NodeType[];
      try {
        nodes = await client.getInternal<NodeType[]>("/types/nodes.json");
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch node types. This endpoint may require session auth instead of API key. Error: ${(e as Error).message}`,
            },
          ],
          isError: true,
        };
      }

      if (query) {
        const q = query.toLowerCase();
        nodes = nodes.filter(
          (n) =>
            n.name.toLowerCase().includes(q) ||
            n.displayName.toLowerCase().includes(q) ||
            n.description.toLowerCase().includes(q),
        );
      }

      const results = nodes.slice(0, limit).map((n) => ({
        name: n.name,
        displayName: n.displayName,
        description: n.description,
        group: n.group,
        version: n.version,
        inputs: n.inputs,
        outputs: n.outputs,
        properties: n.properties?.map((p) => ({
          name: p.name,
          type: p.type,
          displayName: p.displayName,
        })),
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { total: nodes.length, showing: results.length, nodes: results },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
