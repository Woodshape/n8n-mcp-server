import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { N8nClient } from "./client.js";
import { registerListWorkflows } from "./tools/list-workflows.js";
import { registerGetWorkflow } from "./tools/get-workflow.js";
import { registerCreateWorkflow } from "./tools/create-workflow.js";
import { registerTestWorkflow } from "./tools/test-workflow.js";
import { registerGetExecution } from "./tools/get-execution.js";
import { registerGetNodeTypes } from "./tools/get-node-types.js";
import { registerUpdateWorkflow } from "./tools/update-workflow.js";
import { registerListExecutions } from "./tools/list-executions.js";

const baseUrl = process.env.N8N_API_URL;
const apiKey = process.env.N8N_API_KEY;
const email = process.env.N8N_EMAIL;
const password = process.env.N8N_PASSWORD;

if (!baseUrl || !apiKey) {
  console.error("Missing required env vars: N8N_API_URL, N8N_API_KEY");
  process.exit(1);
}

const client = new N8nClient(baseUrl, apiKey, email, password);

const server = new McpServer({
  name: "n8n",
  version: "1.0.0",
});

registerListWorkflows(server, client);
registerGetWorkflow(server, client);
registerCreateWorkflow(server, client);
registerTestWorkflow(server, client);
registerGetExecution(server, client);
registerGetNodeTypes(server, client);
registerUpdateWorkflow(server, client);
registerListExecutions(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
