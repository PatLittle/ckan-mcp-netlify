import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer, registerAll } from "../../vendor/pibs-my-info/server.mjs";

const MAX_REQUEST_BYTES = 1024 * 1024;

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function handlePost(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_REQUEST_BYTES) {
    return json(
      { jsonrpc: "2.0", error: { code: -32600, message: "Request too large" }, id: null },
      { status: 413 }
    );
  }

  const headers = new Headers(request.headers);
  const accept = headers.get("accept") || "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
    headers.set("accept", "application/json, text/event-stream");
  }

  const server = createServer();
  registerAll(server);
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(new Request(request, { headers }));
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("cache-control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } finally {
    await server.close().catch(() => {});
  }
}

export default async function handler(request) {
  if (request.method === "GET") {
    return json({
      ok: true,
      service: "my-info-canada",
      endpoint: "/my-info/mcp",
      mode: "stateless-streamable-http-json",
      privacy: "No server-side survey session or answer-state storage."
    });
  }
  if (request.method !== "POST") {
    return json(
      { ok: false, error: "Method not allowed" },
      { status: 405, headers: { allow: "GET, POST" } }
    );
  }
  try {
    return await handlePost(request);
  } catch {
    // Do not log request bodies, tool arguments, survey state, or exception payloads.
    console.error("My Info MCP request failed");
    return json(
      { jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null },
      { status: 500 }
    );
  }
}
