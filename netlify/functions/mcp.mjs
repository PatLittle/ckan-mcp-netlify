import { createServer, registerAll } from "@aborruso/ckan-mcp-server/dist/server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Readable } from "node:stream";

let transportPromise;

/**
 * Initialize MCP server once (cold start cache)
 */
async function getTransport() {
  if (!transportPromise) {
    transportPromise = (async () => {
      const server = createServer();
      registerAll(server);

      const transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true
      });

      await server.connect(transport);
      return transport;
    })();
  }
  return transportPromise;
}

/**
 * Netlify handler
 */
export default async (request) => {
  const transport = await getTransport();

  const bodyText = await request.text();
  const body = bodyText ? JSON.parse(bodyText) : {};

  // Fake Node req/res for MCP transport
  const req = new Readable({
    read() {
      this.push(bodyText);
      this.push(null);
    }
  });

  req.headers = Object.fromEntries(request.headers);
  req.method = request.method;
  req.url = "/mcp";

  let responseBody = "";
  const res = {
    setHeader() {},
    end(chunk) {
      responseBody = chunk;
    }
  };

  await transport.handleRequest(req, res, body);

  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
};
