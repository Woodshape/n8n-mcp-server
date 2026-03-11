import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { N8nClient } from "../client.js";
import type { Workflow } from "../types.js";
import { findNodes, getNodeConnections } from "../workflow-parser.js";

export function registerGetWorkflowNode(
  server: McpServer,
  client: N8nClient,
) {
  server.tool(
    "get_workflow_node",
    "Get the full configuration of specific node(s) in a workflow. Search by exact node name or by node type (substring match). Also returns the node's incoming and outgoing connections. Use get_workflow_outline first to find node names.",
    {
      id: z.string().describe("Workflow ID"),
      nodeName: z
        .string()
        .optional()
        .describe("Exact node name to look up"),
      nodeType: z
        .string()
        .optional()
        .describe(
          "Node type substring to match (case-insensitive, e.g. 'webhook', 'code')",
        ),
    },
    async ({ id, nodeName, nodeType }) => {
      if (!nodeName && !nodeType) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Provide at least one of nodeName or nodeType to search for.",
            },
          ],
          isError: true,
        };
      }

      const workflow = await client.get<Workflow>(
        `/api/v1/workflows/${id}`,
      );

      const matched = findNodes(workflow, { name: nodeName, type: nodeType });

      if (matched.length === 0) {
        const available = workflow.nodes.map((n) => n.name);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "No matching nodes found",
                  availableNodes: available,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      const results = matched.map((node) => ({
        ...node,
        connections: getNodeConnections(workflow, node.name),
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                workflowId: workflow.id,
                workflowName: workflow.name,
                nodes: results,
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
