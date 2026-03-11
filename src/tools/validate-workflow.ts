import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { N8nClient } from "../client.js";
import type { WorkflowNode, WorkflowConnections } from "../types.js";
import { validateWorkflow } from "../workflow-parser.js";

export function registerValidateWorkflow(server: McpServer, client: N8nClient) {
  server.tool(
    "validate_workflow",
    "Validate workflow structure without saving. Checks that all connection references point to existing nodes and warns about orphaned nodes. Use BEFORE create_workflow or update_workflow to catch structural problems early. Provide either workflowId (to validate an existing workflow) or nodes + connections (to validate a proposed structure).",
    {
      workflowId: z.string().optional()
        .describe("Validate an existing workflow by ID (fetches current state)"),
      nodes: z.array(z.object({
        name: z.string().describe("Node name"),
        type: z.string().describe("Node type"),
      }).passthrough()).optional()
        .describe("Proposed nodes array to validate"),
      connections: z.record(z.unknown()).optional()
        .describe("Proposed connections to validate"),
    },
    async ({ workflowId, nodes, connections }) => {
      let nodesToValidate: WorkflowNode[];
      let connectionsToValidate: WorkflowConnections;

      if (workflowId) {
        const workflow = await client.get<Record<string, unknown>>(
          `/api/v1/workflows/${workflowId}`,
        );
        nodesToValidate = workflow.nodes as WorkflowNode[];
        connectionsToValidate = workflow.connections as WorkflowConnections;
      } else if (nodes && connections) {
        nodesToValidate = nodes as unknown as WorkflowNode[];
        connectionsToValidate = connections as WorkflowConnections;
      } else {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "Provide either workflowId or both nodes and connections",
            }),
          }],
          isError: true,
        };
      }

      const result = validateWorkflow(nodesToValidate, connectionsToValidate);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            valid: result.valid,
            ...(result.errors.length > 0 && { errors: result.errors }),
            ...(result.warnings.length > 0 && { warnings: result.warnings }),
            nodeCount: nodesToValidate.length,
          }, null, 2),
        }],
        ...(result.valid ? {} : { isError: true }),
      };
    },
  );
}
