[![Netlify Status](https://api.netlify.com/api/v1/badges/976e5c64-8ce7-42a5-a195-0076cb9296e1/deploy-status)](https://app.netlify.com/projects/lovely-nasturtium-97f019/deploys)
# CKAN MCP on Netlify

Deploys a vendored CKAN MCP server as a Netlify Function at `/mcp` for ChatGPT connectors.

## What changed

- Does not import internal symbols from `@aborruso/ckan-mcp-server`
- Vendors the required server/tool/resource/prompt code under `vendor/ckan-mcp/`
- Uses MCP Streamable HTTP in JSON response mode for POST requests
- Adds `GET /mcp` health JSON for connector diagnostics

## Endpoint

- `GET /mcp` -> health status JSON
- `POST /mcp` -> MCP JSON-RPC endpoint
- `GET|POST /cors-proxy` -> generic CORS proxy endpoint (outside MCP)

## Deploy (Netlify)

1. Push this repository to GitHub.
2. Import it into Netlify.
3. Netlify will use `npm ci` and the redirect in `netlify.toml`.

## ChatGPT Connector

Create a remote connector with:

- `https://<your-site>.netlify.app/mcp`

## Quick Tests

Health check:

```bash
curl https://<site>.netlify.app/mcp
```

MCP tools list:

```bash
curl https://<site>.netlify.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

CORS proxy (GET with full URL):

```bash
curl "https://<site>.netlify.app/cors-proxy?url=https%3A%2F%2Fopen.canada.ca%2Fdata%2Fapi%2Faction%2Fstatus_show"
```

CORS proxy (POST JSON payload):

```bash
curl https://<site>.netlify.app/cors-proxy \
  -H "Content-Type: application/json" \
  -d '{"url":"https://open.canada.ca/data/api/action/status_show","method":"GET"}'
```

## Notes

- Node runtime is pinned to 20 via `.nvmrc` and `package.json` engines.
- `vendor/ckan-mcp/` is transpiled JS copied from `https://github.com/ondata/ckan-mcp-server` runtime source.
