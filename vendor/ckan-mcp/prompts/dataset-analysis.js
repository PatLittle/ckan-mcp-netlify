import { z } from "zod";
import { createTextPrompt } from "./types.js";
export const DATASET_ANALYSIS_PROMPT_NAME = "ckan-analyze-dataset";
export const buildDatasetAnalysisPromptText = (serverUrl, id) => `# Guided analysis: dataset

## Step 1: Get dataset metadata
Use \`ckan_package_show\` to load full metadata and resources:

ckan_package_show({
  server_url: "${serverUrl}",
  id: "${id}"
})

## Step 2: Inspect resources
For each resource, use \`ckan_resource_show\` to confirm fields like format, url, and datastore availability:

ckan_resource_show({
  server_url: "${serverUrl}",
  id: "<resource-id>"
})

## Step 3: Explore DataStore (if available)
If a resource has \`datastore_active=true\`, use:

ckan_datastore_info({
  server_url: "${serverUrl}",
  resource_id: "<resource-id>"
})

Then query rows with:

ckan_datastore_search({
  server_url: "${serverUrl}",
  resource_id: "<resource-id>",
  limit: 10
})`;
export const registerDatasetAnalysisPrompt = (server) => {
    server.registerPrompt(DATASET_ANALYSIS_PROMPT_NAME, {
        title: "Analyze a dataset",
        description: "Guided prompt to inspect dataset metadata and explore DataStore tables.",
        argsSchema: {
            server_url: z.string().url().describe("Base URL of the CKAN server"),
            id: z.string().min(1).describe("Dataset id or name (CKAN package id)")
        }
    }, async ({ server_url, id }) => createTextPrompt(buildDatasetAnalysisPromptText(server_url, id)));
};
