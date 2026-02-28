/**
 * CKAN DataStore tools
 */
import { z } from "zod";
import { ResponseFormat, ResponseFormatSchema } from "../types.js";
import { makeCkanRequest } from "../utils/http.js";
import { truncateText, addDemoFooter } from "../utils/formatting.js";
import { DEFAULT_CKAN_SERVER_URL } from "../utils/constants.js";
export function registerDatastoreTools(server) {
    /**
     * DataStore search
     */
    server.registerTool("ckan_datastore_search", {
        title: "Search CKAN DataStore",
        description: `Query data from a CKAN DataStore resource.

The DataStore allows SQL-like queries on tabular data. Not all resources have DataStore enabled.

Args:
  - server_url (string): Base URL of CKAN server
  - resource_id (string): ID of the DataStore resource
  - q (string): Full-text search query (optional)
  - filters (object): Key-value filters (e.g., { "anno": 2023 })
  - limit (number): Max rows to return (default: 100, max: 32000)
  - offset (number): Pagination offset (default: 0)
  - fields (array): Specific fields to return (optional)
  - sort (string): Sort field with direction (e.g., "anno desc")
  - distinct (boolean): Return distinct values (default: false)
  - response_format ('markdown' | 'json'): Output format

Returns:
  DataStore records matching query

Examples:
  - { server_url: "...", resource_id: "abc-123", limit: 50 }
  - { server_url: "...", resource_id: "...", filters: { "regione": "Sicilia" } }
  - { server_url: "...", resource_id: "...", sort: "anno desc", limit: 100 }

Typical workflow: ckan_package_search → ckan_package_show (find resource_id with datastore_active=true) → ckan_datastore_search`,
        inputSchema: z.object({
            server_url: z.string().url().optional().default(DEFAULT_CKAN_SERVER_URL).describe("Base URL of the CKAN server (default: https://open.canada.ca/data)"),
            resource_id: z.string().min(1).describe("UUID of the DataStore resource (from ckan_package_show resource.id where datastore_active is true)"),
            q: z.string().optional().describe("Full-text search across all fields"),
            filters: z.record(z.any()).optional().describe("Key-value filters for exact matches (e.g., { \"regione\": \"Sicilia\", \"anno\": 2023 })"),
            limit: z.number().int().min(1).max(32000).optional().default(100).describe("Max rows to return (default 100, max 32000)"),
            offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
            fields: z.array(z.string()).optional().describe("Specific field names to return; omit to return all fields"),
            sort: z.string().optional().describe("Sort expression (e.g., 'anno desc', 'nome asc')"),
            distinct: z.boolean().optional().default(false).describe("Return only distinct rows"),
            response_format: ResponseFormatSchema
        }).strict(),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
        }
    }, async (params) => {
        try {
            const apiParams = {
                resource_id: params.resource_id,
                limit: params.limit,
                offset: params.offset,
                distinct: params.distinct
            };
            if (params.q)
                apiParams.q = params.q;
            if (params.filters)
                apiParams.filters = JSON.stringify(params.filters);
            if (params.fields)
                apiParams.fields = params.fields.join(',');
            if (params.sort)
                apiParams.sort = params.sort;
            const result = await makeCkanRequest(params.server_url, 'datastore_search', apiParams);
            if (params.response_format === ResponseFormat.JSON) {
                return {
                    content: [{ type: "text", text: truncateText(JSON.stringify(result, null, 2)) }]
                };
            }
            let markdown = `# DataStore Query Results\n\n`;
            markdown += `**Server**: ${params.server_url}\n`;
            markdown += `**Resource ID**: \`${params.resource_id}\`\n`;
            markdown += `**Total Records**: ${result.total || 0}\n`;
            markdown += `**Returned**: ${result.records ? result.records.length : 0} records\n\n`;
            if (result.fields && result.fields.length > 0) {
                markdown += `## Fields\n\n`;
                markdown += result.fields.map((f) => `- **${f.id}** (${f.type})`).join('\n') + '\n\n';
            }
            if (result.records && result.records.length > 0) {
                markdown += `## Records\n\n`;
                // Create a simple table
                const fields = result.fields.map((f) => f.id);
                const displayFields = fields.slice(0, 8); // Limit columns for readability
                // Header
                markdown += `| ${displayFields.join(' | ')} |\n`;
                markdown += `| ${displayFields.map(() => '---').join(' | ')} |\n`;
                // Rows (limit to 50 for readability)
                for (const record of result.records.slice(0, 50)) {
                    const values = displayFields.map(field => {
                        const val = record[field];
                        if (val === null || val === undefined)
                            return '-';
                        const str = String(val);
                        return str.length > 50 ? str.substring(0, 47) + '...' : str;
                    });
                    markdown += `| ${values.join(' | ')} |\n`;
                }
                if (result.records.length > 50) {
                    markdown += `\n... and ${result.records.length - 50} more records\n`;
                }
                markdown += '\n';
            }
            if (result.total && result.total > params.offset + (result.records?.length || 0)) {
                const nextOffset = params.offset + params.limit;
                markdown += `**More results available**: Use \`offset: ${nextOffset}\` for next page.\n`;
            }
            return {
                content: [{ type: "text", text: truncateText(addDemoFooter(markdown)) }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error querying DataStore: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
    server.registerTool("ckan_datastore_info", {
        title: "Get CKAN DataStore Resource Info",
        description: `Get DataStore metadata for a CKAN resource.

Args:
  - server_url (string): Base URL of CKAN server (default: https://open.canada.ca/data)
  - resource_id (string): DataStore resource UUID
  - response_format ('markdown' | 'json'): Output format

Returns:
  DataStore table metadata including fields and metadata`,
        inputSchema: z.object({
            server_url: z.string().url().optional().default(DEFAULT_CKAN_SERVER_URL).describe("Base URL of the CKAN server (default: https://open.canada.ca/data)"),
            resource_id: z.string().min(1).describe("UUID of the DataStore resource"),
            response_format: ResponseFormatSchema
        }).strict(),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
        }
    }, async (params) => {
        try {
            const result = await makeCkanRequest(params.server_url, 'datastore_info', { id: params.resource_id });
            if (params.response_format === ResponseFormat.JSON) {
                return {
                    content: [{ type: "text", text: truncateText(JSON.stringify(result, null, 2)) }],
                    structuredContent: result
                };
            }
            let markdown = `# DataStore Resource Info\n\n`;
            markdown += `**Server**: ${params.server_url}\n`;
            markdown += `**Resource ID**: \`${params.resource_id}\`\n\n`;
            if (result.fields && result.fields.length > 0) {
                markdown += `## Fields\n\n`;
                markdown += result.fields.map((field) => `- **${field.id}** (${field.type})`).join('\n') + '\n\n';
            }
            if (result.meta) {
                markdown += `## Metadata\n\n`;
                markdown += `\`\`\`json\n${JSON.stringify(result.meta, null, 2)}\n\`\`\`\n\n`;
            }
            return {
                content: [{ type: "text", text: truncateText(addDemoFooter(markdown)) }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error fetching DataStore info: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
}
