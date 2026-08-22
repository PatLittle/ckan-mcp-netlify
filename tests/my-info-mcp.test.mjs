import assert from "node:assert/strict";
import test from "node:test";

import handler from "../netlify/functions/my-info-mcp.mjs";

async function rpc(body) {
  const response = await handler(new Request("http://localhost/my-info/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  }));
  assert.equal(response.status, 200);
  return response.json();
}

test("My Info Netlify adapter discovers and calls four tools", async () => {
  const initialized = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "netlify-adapter-test", version: "1.0.0" }
    }
  });
  assert.equal(initialized.result.serverInfo.name, "my-info-canada");

  const listed = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.deepEqual(
    listed.result.tools.map((tool) => tool.name).sort(),
    [
      "my_info_advance",
      "my_info_evaluate",
      "my_info_explain_result",
      "my_info_get_manifest"
    ]
  );

  const called = await rpc({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "my_info_get_manifest", arguments: {} }
  });
  assert.equal(called.result.structuredContent.tool_api_version, "0.2.0");
  assert.equal(called.result.structuredContent.question_count, 21);
});
