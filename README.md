[![Netlify Status](https://api.netlify.com/api/v1/badges/976e5c64-8ce7-42a5-a195-0076cb9296e1/deploy-status)](https://app.netlify.com/projects/lovely-nasturtium-97f019/deploys)

# CKAN MCP on Netlify

This repository deploys the [ondata/ckan-mcp-server](https://github.com/ondata/ckan-mcp-server/) as a Netlify-hosted MCP endpoint.



## What Comes From Upstream

The majority of the MCP functionality lives in the vendored code under `vendor/ckan-mcp/`, which is sourced from the upstream `ondata/ckan-mcp-server` project.


This repo is primarily a Netlify deployment wrapper around the upstream server, with a local vendoring workflow and a few deployment-specific additions.

## What This Repo Adds

This repository adds the pieces needed to make the upstream server easy to deploy and operate on Netlify:

- a Netlify function entrypoint at `netlify/functions/mcp.mjs`
- redirects so the public MCP URL is `/mcp`
- a `GET /mcp` health response for quick diagnostics
- a standalone `cors-proxy` helper endpoint
- a vendor refresh script that pulls from upstream and transpiles the runtime into local JS
- local override handling so Netlify-specific or project-specific adjustments can survive vendor refreshes

## Why The Upstream Code Is Transpiled To JS

The upstream project is authored in TypeScript. This repository vendors the relevant upstream source and transpiles it into JavaScript under `vendor/ckan-mcp/`.

That is intentional for a few reasons:

- Netlify runs the deployed function by importing JavaScript directly, so vendoring JS keeps the runtime simple and explicit.
- The vendored JS becomes the exact deploy artifact, which makes it easier to inspect, patch, diff, and ship predictably.
- Local customizations can be reapplied after each upstream refresh without turning production deploys into on-the-fly TypeScript builds.

The refresh flow is implemented in `scripts/refresh-vendor.sh`. It clones upstream source, copies the relevant TypeScript files, transpiles them with `tsc`, writes the result into `vendor/ckan-mcp/`, restores local overrides, and records the upstream source in `vendor/ckan-mcp/.upstream.json`.

## Public Endpoints

- `GET /mcp`: lightweight healthcheck JSON for diagnostics
- `POST /mcp`: MCP Streamable HTTP JSON-RPC endpoint
- `GET /cors-proxy`: proxy an upstream URL passed as a query parameter
- `POST /cors-proxy`: proxy an upstream request described in a JSON body
- `OPTIONS /cors-proxy`: CORS preflight support

Internally, Netlify rewrites these public URLs to the function files in `netlify/functions/`.

## Using The MCP Server

### In ChatGPT or Another MCP Client

Use this URL as the remote MCP server:

- `https://<your-site>.netlify.app/mcp`

MCP-aware clients will perform the normal initialization flow automatically. The `/mcp` endpoint is the only URL they should need.

### Quick Health Check

```bash
curl https://<site>.netlify.app/mcp
```

Expected response:

```json
{
  "ok": true,
  "service": "ckan-mcp-netlify",
  "endpoint": "/mcp",
  "mode": "streamable-http-json",
  "transport": "web-standard",
  "note": "POST JSON-RPC requests to this endpoint."
}
```

### List Available MCP Tools

```bash
curl https://<site>.netlify.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### Call A Tool Directly

Most CKAN tools expect a `server_url` argument pointing at the target CKAN portal.

Example: check the status of Open Canada's CKAN instance.

```bash
curl https://<site>.netlify.app/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "id":1,
    "params":{
      "name":"ckan_status_show",
      "arguments":{
        "server_url":"https://open.canada.ca/data"
      }
    }
  }'
```

Example: search datasets on a CKAN portal.

```bash
curl https://<site>.netlify.app/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "id":2,
    "params":{
      "name":"ckan_package_search",
      "arguments":{
        "server_url":"https://open.canada.ca/data",
        "q":"climate",
        "rows":5
      }
    }
  }'
```

Typical usage flow looks like this:

- start with `ckan_status_show` or `ckan_find_portals`
- use `ckan_package_search` or `ckan_find_relevant_datasets`
- inspect a dataset with `ckan_package_show` or `ckan_list_resources`
- query tabular resources with `ckan_datastore_search` or `ckan_datastore_search_sql`

## The Proxy Endpoint

`/cors-proxy` is not part of MCP. It is a separate helper endpoint for forwarding HTTP requests to upstream services that may not have usable browser CORS headers.

It is useful when:

- a browser-based client needs to reach a CKAN API that does not permit cross-origin requests
- you want a simple relay for ad hoc GET or POST calls
- you want to inspect or demo an upstream endpoint without wiring it into MCP first

### GET Usage

Pass a full target URL as the `url` query parameter:

```bash
curl "https://<site>.netlify.app/cors-proxy?url=https%3A%2F%2Fopen.canada.ca%2Fdata%2Fapi%2Faction%2Fstatus_show"
```

### POST Usage

Send a JSON payload describing the upstream request:

```bash
curl https://<site>.netlify.app/cors-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "url":"https://open.canada.ca/data/api/action/status_show",
    "method":"GET"
  }'
```

You can also pass:

- `headers`: extra upstream headers
- `body`: a string or JSON value for non-GET requests

### Proxy Behavior

- accepts only `http` and `https` target URLs
- supports `GET`, `POST`, and `OPTIONS` on the proxy itself
- forwards the upstream status code and content type
- adds permissive CORS headers on the response
- times out upstream requests after 30 seconds

This endpoint is intentionally generic. It can relay CKAN endpoints, but it is not limited to CKAN.

## Deploying On Netlify

1. Push this repository to GitHub.
2. Import it into Netlify.
3. Netlify will install dependencies with `npm ci`.
4. Netlify will expose the functions through the redirects defined in `netlify.toml`.

Runtime assumptions:

- Node 20 is pinned via `.nvmrc` and `package.json`
- Netlify functions are bundled with `zisi`
- `vendor/ckan-mcp/**` is included in the deployed function bundle

## Refreshing From Upstream

To pull in a newer upstream release:

```bash
npm run refresh:vendor
```

That script will:

- clone `https://github.com/ondata/ckan-mcp-server`
- copy the relevant upstream source files
- transpile them to JavaScript
- replace the vendored runtime under `vendor/ckan-mcp/`
- restore local overrides
- update `vendor/ckan-mcp/.upstream.json`

After a refresh, review the resulting diff carefully before deploying.

## Repository Layout

- `netlify/functions/mcp.mjs`: Netlify MCP wrapper
- `netlify/functions/cors-proxy.mjs`: standalone proxy endpoint
- `vendor/ckan-mcp/`: transpiled vendored upstream runtime
- `scripts/refresh-vendor.sh`: upstream refresh and transpile workflow
- `netlify.toml`: function and redirect configuration

## Notes

- `GET /mcp` is for healthcheck only. Real MCP traffic should use `POST /mcp`.
- Most feature behavior matches the upstream `ondata/ckan-mcp-server` project, but testing optimizations for [Open.Canada.ca](https://open.canada.ca) is a primary goal.
- Some functionality not supported by Open.Canada.ca such as datastore_sql, sparql, etc., is filtered out.
