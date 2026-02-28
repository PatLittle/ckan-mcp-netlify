/**
 * CKAN Scheming tools
 */
import { z } from "zod";
import { ResponseFormat, ResponseFormatSchema } from "../types.js";
import { makeCkanRequest } from "../utils/http.js";
import { truncateText, addDemoFooter } from "../utils/formatting.js";
import { DEFAULT_CKAN_SERVER_URL } from "../utils/constants.js";

function renderSchemingMarkdown(title, serverUrl, payload) {
    return addDemoFooter(`## ${title}\n\n**Server**: ${serverUrl}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`);
}

export function registerSchemingTools(server) {
    server.registerTool("ckan_scheming_organization_schema_list", {
        title: "List CKAN scheming organization schemas",
        description: "Call action/scheming_organization_schema_list.",
        inputSchema: z.object({
            server_url: z.string().url().optional().default(DEFAULT_CKAN_SERVER_URL),
            response_format: ResponseFormatSchema
        }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async (params) => {
        const result = await makeCkanRequest(params.server_url, "scheming_organization_schema_list", {});
        if (params.response_format === ResponseFormat.JSON) {
            return { content: [{ type: "text", text: truncateText(JSON.stringify(result, null, 2)) }], structuredContent: result };
        }
        return { content: [{ type: "text", text: truncateText(renderSchemingMarkdown("Scheming Organization Schema List", params.server_url, result)) }] };
    });

    server.registerTool("ckan_scheming_organization_schema_show", {
        title: "Show CKAN scheming organization schema",
        description: "Call action/scheming_organization_schema_show.",
        inputSchema: z.object({
            server_url: z.string().url().optional().default(DEFAULT_CKAN_SERVER_URL),
            type: z.string().min(1).default("organization"),
            response_format: ResponseFormatSchema
        }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async (params) => {
        const result = await makeCkanRequest(params.server_url, "scheming_organization_schema_show", { type: params.type });
        if (params.response_format === ResponseFormat.JSON) {
            return { content: [{ type: "text", text: truncateText(JSON.stringify(result, null, 2)) }], structuredContent: result };
        }
        return { content: [{ type: "text", text: truncateText(renderSchemingMarkdown("Scheming Organization Schema", params.server_url, result)) }] };
    });

    server.registerTool("ckan_scheming_dataset_schema_list", {
        title: "List CKAN scheming dataset schemas",
        description: "Call action/scheming_dataset_schema_list.",
        inputSchema: z.object({
            server_url: z.string().url().optional().default(DEFAULT_CKAN_SERVER_URL),
            response_format: ResponseFormatSchema
        }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async (params) => {
        const result = await makeCkanRequest(params.server_url, "scheming_dataset_schema_list", {});
        if (params.response_format === ResponseFormat.JSON) {
            return { content: [{ type: "text", text: truncateText(JSON.stringify(result, null, 2)) }], structuredContent: result };
        }
        return { content: [{ type: "text", text: truncateText(renderSchemingMarkdown("Scheming Dataset Schema List", params.server_url, result)) }] };
    });

    server.registerTool("ckan_scheming_dataset_schema_show", {
        title: "Show CKAN scheming dataset schema",
        description: "Call action/scheming_dataset_schema_show.",
        inputSchema: z.object({
            server_url: z.string().url().optional().default(DEFAULT_CKAN_SERVER_URL),
            type: z.string().min(1).default("dataset"),
            expanded: z.boolean().optional().default(true),
            response_format: ResponseFormatSchema
        }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async (params) => {
        const result = await makeCkanRequest(params.server_url, "scheming_dataset_schema_show", {
            type: params.type,
            expanded: params.expanded
        });
        if (params.response_format === ResponseFormat.JSON) {
            return { content: [{ type: "text", text: truncateText(JSON.stringify(result, null, 2)) }], structuredContent: result };
        }
        return { content: [{ type: "text", text: truncateText(renderSchemingMarkdown("Scheming Dataset Schema", params.server_url, result)) }] };
    });
}
