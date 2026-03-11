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

const NodePatchSchema = z.object({
  name: z.string().describe("Name of the node to patch (must match exactly)"),
  parameters: z
    .record(z.unknown())
    .optional()
    .describe("Parameters to merge into the node (deep merge)"),
  credentials: z
    .record(z.unknown())
    .optional()
    .describe("Credentials to set on the node"),
});

const NodeReplacementSchema = z.object({
  name: z.string().describe("Name of the node to replace (must match exactly)"),
  type: z.string().describe("New node type (e.g. n8n-nodes-base.code)"),
  typeVersion: z.number().default(1).describe("New node type version"),
  parameters: z
    .record(z.unknown())
    .default({})
    .describe("New node parameters (replaces all existing parameters)"),
  credentials: z
    .record(z.unknown())
    .optional()
    .describe("New node credentials"),
});

export function registerUpdateWorkflow(server: McpServer, client: N8nClient) {
  server.tool(
    "update_workflow",
    "Update an existing n8n workflow. Fetches the current workflow, merges your changes, and saves. Only include fields you want to change. Prefer nodePatches over nodes when updating specific nodes — it avoids sending the full nodes array.",
    {
      id: z.string().describe("Workflow ID to update"),
      name: z.string().optional().describe("New workflow name"),
      nodes: z
        .array(NodeSchema)
        .optional()
        .describe("Full node array (replaces all existing nodes). Avoid for large workflows — use nodePatches instead."),
      nodePatches: z
        .array(NodePatchSchema)
        .optional()
        .describe("Patch specific nodes by name. Merges into existing nodes without replacing the full array. Use this instead of nodes when updating one or a few nodes."),
      nodeReplacements: z
        .array(NodeReplacementSchema)
        .optional()
        .describe("Replace specific nodes by name — changes type, typeVersion, and parameters while preserving the node's name, id, and position. Use when you need to change a node's type (e.g. httpRequest → code)."),
      connections: z
        .record(z.unknown())
        .optional()
        .describe("Connection map (replaces all existing connections)"),
      settings: z
        .record(z.unknown())
        .optional()
        .describe("Workflow settings"),
      active: z
        .boolean()
        .optional()
        .describe("Activate or deactivate the workflow"),
    },
    async ({ id, name, nodes, nodePatches, nodeReplacements, connections, settings, active }) => {
      // Fetch current workflow to merge with
      const current = await client.get<Record<string, unknown>>(
        `/api/v1/workflows/${id}`,
      );

      // Only include fields the n8n PUT endpoint accepts (active is read-only on PUT)
      const update: Record<string, unknown> = {
        name: name ?? current.name,
        nodes: current.nodes,
        connections: connections ?? current.connections,
        settings: settings ?? current.settings,
        staticData: current.staticData,
      };

      if (nodes !== undefined) {
        update.nodes = nodes.map((n, i) => ({
          ...n,
          id: n.id ?? crypto.randomUUID(),
          position: n.position ?? [250 * i, 300],
        }));
      }

      if (nodeReplacements !== undefined) {
        const currentNodes = update.nodes as Record<string, unknown>[];
        update.nodes = currentNodes.map((node) => {
          const replacement = nodeReplacements.find((r) => r.name === node.name);
          if (!replacement) return node;
          return {
            id: node.id,
            name: node.name,
            position: node.position,
            type: replacement.type,
            typeVersion: replacement.typeVersion,
            parameters: replacement.parameters,
            ...(replacement.credentials !== undefined && { credentials: replacement.credentials }),
          };
        });
      }

      if (nodePatches !== undefined) {
        const currentNodes = update.nodes as Record<string, unknown>[];
        update.nodes = currentNodes.map((node) => {
          const patch = nodePatches.find((p) => p.name === node.name);
          if (!patch) return node;
          return {
            ...node,
            ...(patch.parameters !== undefined && {
              parameters: { ...(node.parameters as Record<string, unknown>), ...patch.parameters },
            }),
            ...(patch.credentials !== undefined && { credentials: patch.credentials }),
          };
        });
      }

      const updated = await client.put<Record<string, unknown>>(
        `/api/v1/workflows/${id}`,
        update,
      );

      // Handle activation separately if requested
      if (active !== undefined && active !== current.active) {
        const endpoint = active ? "activate" : "deactivate";
        await client.post(`/api/v1/workflows/${id}/${endpoint}`);
        (updated as Record<string, unknown>).active = active;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: updated.id,
                name: updated.name,
                active: updated.active,
                message: "Workflow updated successfully",
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
