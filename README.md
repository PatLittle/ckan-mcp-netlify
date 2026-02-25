

# CKAN MCP on Netlify

Deploys @aborruso/ckan-mcp-server as a serverless MCP endpoint.

Endpoint:
  /mcp

Deploy:
1. Push to GitHub
2. Import repo into Netlify
3. No build settings needed

Use in ChatGPT:
Settings → Connectors → Create
URL: https://your-site.netlify.app/mcp

Test:
```bash
curl https://your-site.netlify.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```
