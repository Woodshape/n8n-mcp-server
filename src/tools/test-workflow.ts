import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { N8nClient } from "../client.js";
import type { Workflow } from "../types.js";

const TRIGGER_TYPES: Record<string, string> = {
  "n8n-nodes-base.webhook": "webhook",
  "n8n-nodes-base.webhookTrigger": "webhook",
  "n8n-nodes-base.formTrigger": "form",
  "@n8n/n8n-nodes-langchain.chatTrigger": "chat",
};

export function registerTestWorkflow(server: McpServer, client: N8nClient) {
  server.tool(
    "test_workflow",
    "Trigger a workflow execution via its webhook/form/chat trigger. Inspects the workflow to find the trigger node, then sends a test request.",
    {
      workflowId: z.string().describe("Workflow ID to test"),
      data: z
        .record(z.unknown())
        .optional()
        .describe("Request payload / form fields / chat data"),
      message: z
        .string()
        .optional()
        .describe("Chat message (for chat trigger workflows)"),
      httpMethod: z
        .enum(["GET", "POST", "PUT", "DELETE"])
        .default("POST")
        .describe("HTTP method for webhook triggers"),
    },
    async ({ workflowId, data, message, httpMethod }) => {
      // 1. Fetch workflow to find trigger
      const workflow = await client.get<Workflow>(
        `/api/v1/workflows/${workflowId}`,
      );

      const triggerNode = workflow.nodes.find((n) => n.type in TRIGGER_TYPES);
      if (!triggerNode) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No supported trigger node found in workflow "${workflow.name}". Supported triggers: webhook, form, chat.`,
            },
          ],
          isError: true,
        };
      }

      const triggerType = TRIGGER_TYPES[triggerNode.type];
      const webhookPath =
        (triggerNode.parameters?.path as string) ?? workflowId;

      // 2. Activate workflow if not active (uses separate activation endpoint)
      if (!workflow.active) {
        try {
          await client.post(`/api/v1/workflows/${workflowId}/activate`);
        } catch (e) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to activate workflow: ${(e as Error).message}`,
              },
            ],
            isError: true,
          };
        }
      }

      // 3. Send test request
      let testPath: string;
      let body: unknown;

      if (triggerType === "chat") {
        testPath = `/webhook/${webhookPath}`;
        body = {
          action: "sendMessage",
          sessionId: `test-${Date.now()}`,
          chatInput: message ?? data?.message ?? "test message",
        };
      } else if (triggerType === "form") {
        testPath = `/form-test/${webhookPath}`;
        body = data ?? {};
      } else {
        testPath = `/webhook/${webhookPath}`;
        body = data ?? {};
      }

      try {
        const result = await client.request<unknown>(httpMethod, testPath, body);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  triggerType,
                  triggerNode: triggerNode.name,
                  webhookPath,
                  response: result,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        const error = e as Error;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  triggerType,
                  triggerNode: triggerNode.name,
                  webhookPath,
                  error: error.message,
                  hint:
                    triggerType === "webhook"
                      ? "Make sure the workflow is in test/listening mode in the n8n UI, or use production webhook path."
                      : "Check that the workflow trigger is properly configured.",
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
