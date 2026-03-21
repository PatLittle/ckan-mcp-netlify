/**
 * CKAN DataStore tools
 */
import { z } from "zod";
import { RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps/server";
import { ResponseFormat, ResponseFormatSchema } from "../types.js";
import { makeCkanRequest } from "../utils/http.js";
import { truncateText, truncateJson, addDemoFooter, formatBytes } from "../utils/formatting.js";
import { DATASTORE_TABLE_RESOURCE_URI } from "../resources/datastore-table-ui.js";
export function formatDatastoreSearchMarkdown(result, serverUrl, resourceId, offset, limit) {
    let markdown = `# DataStore Query Results\n\n`;
    markdown += `**Server**: ${serverUrl}\n`;
    markdown += `**Resource ID**: \`${resourceId}\`\n`;
    markdown += `**Total Records**: ${result.total || 0}\n`;
    markdown += `**Returned**: ${result.records ? result.records.length : 0} records\n\n`;
    if (result.fields && result.fields.length > 0) {
        markdown += `## Fields\n\n`;
        markdown += result.fields.map((f) => `- **${f.id}** (${f.type})`).join('\n') + '\n\n';
    }
    if (result.records && result.records.length > 0) {
        markdown += `## Records\n\n`;
        const fields = result.fields ? result.fields.map((f) => f.id).filter(id => id !== '_id') : [];
        const displayFields = fields.slice(0, 8);
        markdown += `| ${displayFields.join(' | ')} |\n`;
        markdown += `| ${displayFields.map(() => '---').join(' | ')} |\n`;
        for (const record of result.records.slice(0, 50)) {
            const values = displayFields.map(field => {
                const val = record[field];
                if (val === null || val === undefined)
                    return '-';
                const str = String(val);
                return str.length > 80 ? str.substring(0, 77) + '...' : str;
            });
            markdown += `| ${values.join(' | ')} |\n`;
        }
        if (result.records.length > 50) {
            markdown += `\n... and ${result.records.length - 50} more records\n`;
        }
        markdown += '\n';
    }
    else {
        markdown += 'No records found.\n';
        markdown += '\n> **Note**: No data was found on this portal. Do not use information from other sources to supplement this result.\n';
    }
    if (result.total && result.total > offset + (result.records?.length || 0)) {
        const nextOffset = offset + limit;
        markdown += `**More results available**: Use \`offset: ${nextOffset}\` for next page.\n`;
    }
    return markdown;
}
/**
 * Compact datastore result: filter _id from fields and records.
 */
export function compactDatastoreResult(result) {
    const fields = (result.fields || []).filter((f) => f.id !== '_id');
    const records = (result.records || []).map((record) => {
        const { _id, ...rest } = record;
        return rest;
    });
    return {
        resource_id: result.resource_id || null,
        fields,
        records,
        total: result.total ?? 0
    };
}
export function compactDatastoreInfoResult(result, resourceId) {
    return {
        resource_id: resourceId,
        meta: {
            id: result?.meta?.id || resourceId,
            count: result?.meta?.count ?? 0,
            table_type: result?.meta?.table_type || null,
            size: result?.meta?.size ?? null,
            db_size: result?.meta?.db_size ?? null,
            idx_size: result?.meta?.idx_size ?? null,
            aliases: Array.isArray(result?.meta?.aliases) ? result.meta.aliases : []
        },
        fields: Array.isArray(result?.fields)
            ? result.fields.map((field) => ({
                id: field.id,
                type: field.type,
                info: field.info || {},
                schema: field.schema || {}
            }))
            : []
    };
}
export function formatDatastoreInfoMarkdown(result, serverUrl, resourceId) {
    const meta = result?.meta || {};
    const fields = Array.isArray(result?.fields) ? result.fields : [];
    let markdown = `# DataStore Info\n\n`;
    markdown += `**Server**: ${serverUrl}\n`;
    markdown += `**Resource ID**: \`${resourceId}\`\n`;
    markdown += `**Row Count**: ${meta.count ?? 0}\n`;
    markdown += `**Table Type**: ${meta.table_type || '-'}\n`;
    markdown += `**Table Size**: ${meta.size != null ? `${meta.size} bytes (${formatBytes(meta.size)})` : '-'}\n`;
    markdown += `**Database Size**: ${meta.db_size != null ? `${meta.db_size} bytes (${formatBytes(meta.db_size)})` : '-'}\n`;
    markdown += `**Index Size**: ${meta.idx_size != null ? `${meta.idx_size} bytes (${formatBytes(meta.idx_size)})` : '-'}\n`;
    markdown += `**Aliases**: ${Array.isArray(meta.aliases) && meta.aliases.length > 0 ? meta.aliases.map((alias) => `\`${alias}\``).join(', ') : '-'}\n\n`;
    if (fields.length === 0) {
        markdown += `No field metadata found.\n`;
        markdown += '\n> **Note**: No schema details were returned by this portal for the requested DataStore resource.\n';
        return markdown;
    }
    markdown += `## Fields\n\n`;
    for (const field of fields) {
        const info = field.info || {};
        const schema = field.schema || {};
        markdown += `### ${field.id}\n\n`;
        markdown += `- **Type**: ${field.type || '-'}\n`;
        markdown += `- **Native Type**: ${schema.native_type || '-'}\n`;
        markdown += `- **Required**: ${schema.notnull === true ? 'Yes' : 'No'}\n`;
        markdown += `- **Indexed**: ${schema.is_index === true ? 'Yes' : 'No'}\n`;
        markdown += `- **Unique Key**: ${schema.uniquekey === true ? 'Yes' : 'No'}\n`;
        markdown += `- **Foreign Key**: ${schema.foreignkeys === true ? 'Yes' : 'No'}\n`;
        markdown += `- **Index Name**: ${schema.index_name || '-'}\n`;
        markdown += `- **Label (EN)**: ${info.label_en || '-'}\n`;
        markdown += `- **Label (FR)**: ${info.label_fr || '-'}\n`;
        markdown += `- **Notes (EN)**: ${info.notes_en || '-'}\n`;
        markdown += `- **Notes (FR)**: ${info.notes_fr || '-'}\n`;
        markdown += `- **Type Override**: ${info.type_override || '-'}\n\n`;
    }
    return markdown;
}
export function registerDatastoreTools(server) {
    /**
     * DataStore search
     */
    server.registerTool("ckan_datastore_search", {
        title: "Search CKAN DataStore",
        description: `Query data from a CKAN DataStore resource.

The DataStore allows SQL-like queries on tabular data. Not all resources have DataStore enabled.

The response always includes a Fields section listing all available column names and types.
Use limit=0 to discover column names without fetching data — do this before using filters
to avoid guessing column names and getting HTTP 400 errors.

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
  DataStore records matching query, always including available column names and types

Examples:
  - { server_url: "...", resource_id: "abc-123", limit: 0 }  ← discover columns first
  - { server_url: "...", resource_id: "abc-123", limit: 50 }
  - { server_url: "...", resource_id: "...", filters: { "regione": "Sicilia" } }
  - { server_url: "...", resource_id: "...", sort: "anno desc", limit: 100 }

Typical workflow: ckan_package_search → ckan_package_show (find resource_id with datastore_active=true) → ckan_datastore_search (limit=0 to get columns) → ckan_datastore_search (with filters)`,
        inputSchema: z.object({
            server_url: z.string().url().describe("Base URL of the CKAN server (e.g., https://dati.gov.it/opendata)"),
            resource_id: z.string().min(1).describe("UUID of the DataStore resource (from ckan_package_show resource.id where datastore_active is true)"),
            q: z.string().optional().describe("Full-text search across all fields"),
            filters: z.record(z.any()).optional().describe("Key-value filters for exact matches (e.g., { \"regione\": \"Sicilia\", \"anno\": 2023 })"),
            limit: z.coerce.number().int().min(0).max(32000).optional().default(100).describe("Max rows to return (default 100, max 32000); use 0 to get only column names without data"),
            offset: z.coerce.number().int().min(0).optional().default(0).describe("Pagination offset"),
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
        },
        _meta: {
            [RESOURCE_URI_META_KEY]: DATASTORE_TABLE_RESOURCE_URI
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
                const compact = compactDatastoreResult(result);
                return {
                    content: [{ type: "text", text: truncateJson(compact) }],
                    structuredContent: compact
                };
            }
            const markdown = formatDatastoreSearchMarkdown(result, params.server_url, params.resource_id, params.offset, params.limit);
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
        title: "Get CKAN DataStore Info",
        description: `Get schema and storage metadata for a CKAN DataStore resource.

Use this to inspect DataStore-specific metadata that is not returned by standard resource metadata,
including row count, table size, database size, index size, aliases, and detailed field schema info.

Args:
  - server_url (string): Base URL of CKAN server
  - resource_id (string): ID of the DataStore resource
  - response_format ('markdown' | 'json'): Output format

Returns:
  DataStore table metadata with:
  - meta: count, table type, table size, database size, index size, aliases
  - fields: field type, labels, notes, and schema details

Examples:
  - { server_url: "https://open.canada.ca/data", resource_id: "abc-123" }

Typical workflow: ckan_package_show → ckan_datastore_info (inspect schema and sizes) → ckan_datastore_search (query rows)`,
        inputSchema: z.object({
            server_url: z.string().url().describe("Base URL of the CKAN server"),
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
            const compact = compactDatastoreInfoResult(result, params.resource_id);
            if (params.response_format === ResponseFormat.JSON) {
                return {
                    content: [{ type: "text", text: truncateJson(compact) }],
                    structuredContent: compact
                };
            }
            const markdown = formatDatastoreInfoMarkdown(result, params.server_url, params.resource_id);
            return {
                content: [{ type: "text", text: truncateText(addDemoFooter(markdown)) }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error getting DataStore info: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
}
