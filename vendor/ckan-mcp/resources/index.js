/**
 * MCP Resources - Entry point
 *
 * Registers all CKAN resource templates for direct data access.
 */
import { registerDatasetResource } from "./dataset.js";
import { registerResourceResource } from "./resource.js";
import { registerOrganizationResource } from "./organization.js";
import { registerFormatDatasetsResource, registerOrganizationDatasetsResource } from "./dataset-filters.js";
import { registerDatastoreTableUiResource } from "./datastore-table-ui.js";
/**
 * Register all CKAN resource templates
 */
export function registerAllResources(server) {
    registerDatasetResource(server);
    registerResourceResource(server);
    registerOrganizationResource(server);
    registerOrganizationDatasetsResource(server);
    registerFormatDatasetsResource(server);
    registerDatastoreTableUiResource(server);
}
