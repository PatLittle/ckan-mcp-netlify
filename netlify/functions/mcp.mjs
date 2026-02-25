import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer, registerAll } from "../../vendor/ckan-mcp/server.js";

let serverPromise;
let requestQueue = Promise.resolve();

async function getServer() {
  if (!serverPromise) {
    serverPromise = (async () => {
      const server = createServer();
      registerAll(server);
      return server;
    })();
  }
  return serverPromise;
}

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

function enqueue(fn) {
  const next = requestQueue.then(fn, fn);
  requestQueue = next.catch(() => {});
  return next;
}

async function handlePost(request) {
  const queuedRequest = request.clone();

  return enqueue(async () => {
    const server = await getServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: undefined
    });

    const headers = new Headers(queuedRequest.headers);
    if (!headers.has("accept")) {
      headers.set("accept", "application/json, text/event-stream");
    }
    const mcpRequest = new Request(queuedRequest, { headers });

    await server.connect(transport);

    try {
      return await transport.handleRequest(mcpRequest);
    } finally {
      try {
        await server.close();
      } catch (error) {
        console.error("Failed to close MCP server transport", error);
      }
    }
  });
}

export default async function handler(request) {
  if (request.method === "GET") {
    return json(
      {
        ok: true,
        service: "ckan-mcp-netlify",
        endpoint: "/mcp",
        mode: "streamable-http-json",
        transport: "web-standard",
        note: "POST JSON-RPC requests to this endpoint."
      },
      {
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  }

  if (request.method !== "POST") {
    return json(
      {
        ok: false,
        error: "Method not allowed"
      },
      {
        status: 405,
        headers: {
          allow: "GET, POST"
        }
      }
    );
  }

  try {
    return await handlePost(request);
  } catch (error) {
    console.error("MCP function error", error);
    return json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal error"
        },
        id: null
      },
      { status: 500 }
    );
  }
}
