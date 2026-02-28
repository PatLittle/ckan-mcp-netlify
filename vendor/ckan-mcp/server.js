/**
 * MCP Server configuration
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPackageTools } from "./tools/package.js";
import { registerOrganizationTools } from "./tools/organization.js";
import { registerDatastoreTools } from "./tools/datastore.js";
import { registerSchemingTools } from "./tools/scheming.js";
import { registerStatusTools } from "./tools/status.js";
import { registerQualityTools } from "./tools/quality.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllPrompts } from "./prompts/index.js";
export function createServer() {
    return new McpServer({
        name: "ckan-mcp-server",
        version: "0.4.51"
    });
}
export function registerAll(server) {
    registerPackageTools(server);
    registerOrganizationTools(server);
    registerDatastoreTools(server);
    registerSchemingTools(server);
    registerStatusTools(server);
    registerQualityTools(server);
    registerAllResources(server);
    registerAllPrompts(server);
}
