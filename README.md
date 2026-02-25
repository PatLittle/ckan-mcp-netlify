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

## Notes

- Node runtime is pinned to 20 via `.nvmrc` and `package.json` engines.
- `vendor/ckan-mcp/` is transpiled JS copied from `https://github.com/ondata/ckan-mcp-server` runtime source.
