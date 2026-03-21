# Changelog

This changelog is maintained by Codex from the Git commit log and groups same-day commit runs into release-sized entries.

## Initial Netlify MCP Release - 2026-02-25

Commits: `7ad6113`, `d756433`, `aaa1b94`, `6c06fb9`, `c7efdfc`, `3a39eaf`, `6d75687`, `9da9251`, `b799d99`, `87f2f86`, `c663a28`, `27561d5`

- Bootstrapped the repository and deployment skeleton with `package.json`, `package-lock.json`, `netlify.toml`, `.nvmrc`, `.gitignore`, and the project license.
- Added the first Netlify MCP entrypoint in `netlify/functions/mcp.mjs` and vendored the CKAN MCP runtime under `vendor/ckan-mcp/`, including server wiring, prompts, resources, and the initial package, organization, group, tag, status, datastore, and quality tools.
- Iterated on deployment details during the day by moving builds to `npm ci`, pinning Node 20, switching Netlify bundling to `zisi`, and correcting the upstream import path for the vendored server code.
- Wrote the initial README with deployment and usage guidance, then polished the project presentation with a Netlify status badge.
- Result: the repo became a deployable Netlify-hosted wrapper around a vendored CKAN MCP server.

## Upstream Sync Automation - 2026-02-27

Commits: `d331410`, `7cefaec`

- Refreshed the vendored CKAN MCP code to upstream `0.4.50`, touching the package, datastore, organization, group, tag, status, and utility modules.
- Added repeatable vendor-maintenance infrastructure with `scripts/refresh-vendor.sh`, `.github/workflows/refresh-vendor.yml`, and `vendor/ckan-mcp/.upstream.json`.
- Updated package metadata so the vendor refresh process could be run and automated consistently.
- Result: the project gained a maintainable path for tracking upstream CKAN MCP changes instead of relying on one-off manual vendor drops.

## Open Canada Customization - 2026-02-28

Commits: `d7c8eee`, `38e9989`

- Reworked the vendored MCP defaults and tool surface around Open Canada as the default CKAN target.
- Added a dedicated `scheming` tool module so the server could expose CKAN scheming dataset and organization schema endpoints.
- Adjusted related package, datastore, organization, quality, status, and HTTP utility behavior to match the new portal assumptions and tool registrations.
- Landed the work through PR #1, which formalized the Open Canada and scheming-oriented direction.
- Result: the MCP server moved beyond generic CKAN wrapping and started to encode portal-specific behavior for a concrete public-sector use case.

## CORS Proxy Support - 2026-03-02

Commits: `86bec26`, `1bc0311`

- Added a standalone `cors-proxy` Netlify function for GET and POST forwarding to upstream URLs.
- Updated `netlify.toml` and the README so the new helper endpoint was routed and documented alongside the main `/mcp` endpoint.
- Merged the change through PR #2.
- Result: the deployment grew from a single MCP endpoint into a small support surface for browser-safe access patterns around CKAN and related APIs.

## Upstream Feature Expansion - 2026-03-21

Commits: `0b6afd3`, `53e7992`

- Expanded the vendor refresh script again and then pulled in a large upstream feature refresh across the vendored CKAN MCP codebase.
- Added new MCP capabilities for dataset analysis, CKAN portal discovery, SPARQL querying, and HVD-focused prompting.
- Extended the existing package, organization, group, tag, datastore, quality, and status tools while also updating shared formatting, HTTP, portal configuration, and portal registry data.
- Refreshed `vendor/ckan-mcp/portals.json` and widened the server's open-data coverage from CKAN catalog access into broader discovery and analysis workflows.
- Result: the project evolved into a more complete open-data research toolkit, covering portal discovery, metadata inspection, tabular querying, and linked-data querying from a single Netlify-hosted MCP server.
