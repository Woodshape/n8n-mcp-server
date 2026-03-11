import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { N8nClient } from "../client.js";

interface Workflow {
  id: string;
  name: string;
  active: boolean;
  tags?: { name: string }[];
  createdAt?: string;
  updatedAt?: string;
}

interface ListResponse {
  data: Workflow[];
  nextCursor?: string;
}

export function registerListWorkflows(server: McpServer, client: N8nClient) {
  server.tool(
    "list_workflows",
    "List all workflows with id, name, and active status. Optionally filter by active state or tag.",
    {
      active: z.boolean().optional().describe("Filter by active status"),
      tag: z.string().optional().describe("Filter by tag name"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(50)
        .describe("Max results (default 50)"),
    },
    async ({ active, tag, limit }) => {
      const params = new URLSearchParams();
      if (active !== undefined) params.set("active", String(active));
      if (tag) params.set("tags", tag);
      if (limit) params.set("limit", String(limit));

      const qs = params.toString();
      const path = `/api/v1/workflows${qs ? `?${qs}` : ""}`;
      const result = await client.get<ListResponse>(path);

      const summary = result.data.map((w) => ({
        id: w.id,
        name: w.name,
        active: w.active,
        tags: w.tags?.map((t) => t.name) ?? [],
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
