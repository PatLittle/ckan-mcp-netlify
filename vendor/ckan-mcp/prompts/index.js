/**
 * MCP Prompt registration
 */
import { registerThemePrompt } from "./theme.js";
import { registerOrganizationPrompt } from "./organization.js";
import { registerFormatPrompt } from "./format.js";
import { registerRecentPrompt } from "./recent.js";
import { registerDatasetAnalysisPrompt } from "./dataset-analysis.js";
export const registerAllPrompts = (server) => {
    registerThemePrompt(server);
    registerOrganizationPrompt(server);
    registerFormatPrompt(server);
    registerRecentPrompt(server);
    registerDatasetAnalysisPrompt(server);
};
