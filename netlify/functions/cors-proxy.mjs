const DEFAULT_TIMEOUT_MS = 30000;

function withCorsHeaders(headers = {}) {
  const base = new Headers(headers);
  base.set("access-control-allow-origin", "*");
  base.set("access-control-allow-methods", "GET, POST, OPTIONS");
  base.set("access-control-allow-headers", "content-type, authorization, x-requested-with");
  base.set("access-control-max-age", "86400");
  return base;
}

function json(data, init = {}) {
  const headers = withCorsHeaders(init.headers || {});
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

function parseUrlFromRequest(request) {
  const requestUrl = new URL(request.url);
  const queryUrl = requestUrl.searchParams.get("url");
  return queryUrl?.trim() || "";
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

async function readRequestConfig(request) {
  const url = parseUrlFromRequest(request);
  const contentType = request.headers.get("content-type") || "";

  if (request.method === "GET") {
    return { targetUrl: url, targetMethod: "GET", targetBody: undefined, targetHeaders: {} };
  }

  if (!contentType.includes("application/json")) {
    return { targetUrl: url, targetMethod: "POST", targetBody: await request.text(), targetHeaders: {} };
  }

  const body = await request.json().catch(() => ({}));
  const targetUrl = typeof body.url === "string" && body.url.trim() ? body.url.trim() : url;
  const targetMethod = typeof body.method === "string" && body.method.trim() ? body.method.trim().toUpperCase() : "POST";
  const targetBody = typeof body.body === "string" ? body.body : body.body != null ? JSON.stringify(body.body) : undefined;
  const targetHeaders = typeof body.headers === "object" && body.headers ? body.headers : {};

  return { targetUrl, targetMethod, targetBody, targetHeaders };
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: withCorsHeaders()
    });
  }

  if (request.method !== "GET" && request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, {
      status: 405,
      headers: { allow: "GET, POST, OPTIONS" }
    });
  }

  const { targetUrl, targetMethod, targetBody, targetHeaders } = await readRequestConfig(request);

  if (!targetUrl) {
    return json({ ok: false, error: "Missing 'url' parameter" }, { status: 400 });
  }

  if (!isHttpUrl(targetUrl)) {
    return json({ ok: false, error: "Invalid 'url'. Must be a full http(s) URL." }, { status: 400 });
  }

  const upstreamHeaders = new Headers();
  const requestedContentType = request.headers.get("content-type");
  if (requestedContentType && request.method === "POST" && !requestedContentType.includes("multipart/form-data")) {
    upstreamHeaders.set("content-type", requestedContentType);
  }

  for (const [key, value] of Object.entries(targetHeaders || {})) {
    if (typeof value === "string" && key) {
      upstreamHeaders.set(key, value);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const upstream = await fetch(targetUrl, {
      method: targetMethod,
      headers: upstreamHeaders,
      body: targetMethod === "GET" || targetMethod === "HEAD" ? undefined : targetBody,
      signal: controller.signal,
      redirect: "follow"
    });

    const buffer = await upstream.arrayBuffer();
    const responseHeaders = withCorsHeaders();

    const upstreamType = upstream.headers.get("content-type");
    if (upstreamType) {
      responseHeaders.set("content-type", upstreamType);
    }

    const upstreamCacheControl = upstream.headers.get("cache-control");
    if (upstreamCacheControl) {
      responseHeaders.set("cache-control", upstreamCacheControl);
    }

    return new Response(buffer, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return json({
      ok: false,
      error: isTimeout ? "Upstream request timed out" : "Upstream request failed",
      details: error instanceof Error ? error.message : String(error)
    }, { status: isTimeout ? 504 : 502 });
  } finally {
    clearTimeout(timeout);
  }
}
