/**
 * CKAN Status tools
 */
import { z } from "zod";
import { makeCkanRequest } from "../utils/http.js";
import { DEFAULT_CKAN_SERVER_URL } from "../utils/constants.js";
import { addDemoFooter } from "../utils/formatting.js";
export function registerStatusTools(server) {
    /**
     * Check CKAN server status
     */
    server.registerTool("ckan_status_show", {
        title: "Check CKAN Server Status",
        description: `Check if a CKAN server is available and get version information.

Useful to verify server accessibility before making other requests.

Args:
  - server_url (string): Base URL of CKAN server

Returns:
  Server status and version information

Typical workflow: ckan_status_show (verify server is up) → ckan_package_search (discover datasets)`,
        inputSchema: z.object({
            server_url: z.string().url().optional().default(DEFAULT_CKAN_SERVER_URL).describe("Base URL of the CKAN server (default: https://open.canada.ca/data)")
        }).strict(),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
        }
    }, async (params) => {
        try {
            const result = await makeCkanRequest(params.server_url, 'status_show', {});
            const markdown = `# CKAN Server Status\n\n` +
                `**Server**: ${params.server_url}\n` +
                `**Status**: ✅ Online\n` +
                `**CKAN Version**: ${result.ckan_version || 'Unknown'}\n` +
                `**Site Title**: ${result.site_title || 'N/A'}\n` +
                `**Site URL**: ${result.site_url || 'N/A'}\n`;
            return {
                content: [{ type: "text", text: addDemoFooter(markdown) }],
                structuredContent: result
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Server appears to be offline or not a valid CKAN instance:\n${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
}
