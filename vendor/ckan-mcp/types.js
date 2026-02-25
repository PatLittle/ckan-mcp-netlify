/**
 * Type definitions and schemas for CKAN MCP Server
 */
import { z } from "zod";
export var ResponseFormat;
(function (ResponseFormat) {
    ResponseFormat["MARKDOWN"] = "markdown";
    ResponseFormat["JSON"] = "json";
})(ResponseFormat || (ResponseFormat = {}));
export const ResponseFormatSchema = z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable");
export const CHARACTER_LIMIT = 50000;
