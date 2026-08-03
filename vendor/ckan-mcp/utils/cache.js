/**
 * HTTP cache layer for CKAN API responses.
 *
 * Provides a runtime-aware read-through cache with two backends:
 * - WorkersCacheApi: Cloudflare Workers edge cache via caches.default
 * - MemoryLruCache: bounded in-memory LRU for Node.js
 *
 * Selection is automatic; callers interact only with the CkanCache interface.
 */
const TTL_METADATA = new Set([
    "package_search",
    "package_show",
    "current_package_list_with_resources",
    "resource_show",
    "organization_show",
    "organization_list",
    "organization_search",
    "group_show",
    "group_list",
    "group_search",
    "tag_list",
    "tag_show",
    "tag_search"
]);
const TTL_STATUS = new Set(["status_show", "site_read"]);
const TTL_DATASTORE = new Set(["datastore_search", "datastore_search_sql"]);
export function getTtlForAction(action, fallback) {
    if (TTL_METADATA.has(action))
        return 300;
    if (TTL_STATUS.has(action))
        return 3600;
    if (TTL_DATASTORE.has(action))
        return 60;
    return fallback;
}
function readEnv(name) {
    if (typeof process === "undefined" || !process.env)
        return undefined;
    const value = process.env[name];
    return value === undefined || value === "" ? undefined : value;
}
export function getCacheConfig() {
    const enabledRaw = readEnv("CKAN_CACHE_ENABLED");
    const isTest = readEnv("VITEST") === "true";
    const enabled = enabledRaw !== undefined ? enabledRaw !== "false" : !isTest;
    const ttlDefault = Number(readEnv("CKAN_CACHE_TTL_DEFAULT")) || 300;
    const maxEntries = Number(readEnv("CKAN_CACHE_MAX_ENTRIES")) || 500;
    const maxEntryBytes = Number(readEnv("CKAN_CACHE_MAX_ENTRY_BYTES")) || 1024 * 1024;
    return { enabled, ttlDefault, maxEntries, maxEntryBytes };
}
/** Recursively sort object keys so serialization is order-independent and type-preserving. */
function canonicalizeValue(value) {
    if (Array.isArray(value))
        return value.map(canonicalizeValue);
    if (value && typeof value === "object") {
        const sorted = {};
        for (const key of Object.keys(value).sort()) {
            sorted[key] = canonicalizeValue(value[key]);
        }
        return sorted;
    }
    return value;
}
/**
 * Serialize params to an unambiguous, injection-proof canonical string. Uses typed JSON
 * (not `k=v` joins), so `{q:"budget",rows:10}` and `{q:"budget&rows=10"}` — and a nested
 * object vs. its stringified form — never collide onto the same cache key (GHSA-78x9).
 */
export function canonicalizeParams(params) {
    const filtered = {};
    for (const key of Object.keys(params)) {
        const value = params[key];
        if (value === undefined || value === null)
            continue;
        filtered[key] = value;
    }
    return JSON.stringify(canonicalizeValue(filtered));
}
async function sha1Hex(input) {
    const data = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const bytes = new Uint8Array(hashBuffer);
    let hex = "";
    for (const b of bytes)
        hex += b.toString(16).padStart(2, "0");
    return hex;
}
export async function buildCacheKey(serverUrl, action, params) {
    // JSON-array framing so serverUrl/action/params boundaries are unambiguous too.
    const raw = JSON.stringify([serverUrl, action, canonicalizeParams(params)]);
    return sha1Hex(raw);
}
export class MemoryLruCache {
    maxEntries;
    store = new Map();
    constructor(maxEntries) {
        this.maxEntries = maxEntries;
    }
    async get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return undefined;
        if (entry.expiresAt <= Date.now()) {
            this.store.delete(key);
            return undefined;
        }
        this.store.delete(key);
        this.store.set(key, entry);
        return entry.value;
    }
    async set(key, value, ttlSeconds) {
        if (ttlSeconds <= 0)
            return;
        if (this.store.has(key))
            this.store.delete(key);
        this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
        while (this.store.size > this.maxEntries) {
            const oldest = this.store.keys().next().value;
            if (oldest === undefined)
                break;
            this.store.delete(oldest);
        }
    }
    clear() {
        this.store.clear();
    }
    size() {
        return this.store.size;
    }
}
export class WorkersCacheApi {
    origin = "https://ckan-mcp-cache.internal";
    async get(key) {
        try {
            const response = await caches.default.match(`${this.origin}/${key}`);
            if (!response)
                return undefined;
            return await response.json();
        }
        catch {
            return undefined;
        }
    }
    async set(key, value, ttlSeconds) {
        if (ttlSeconds <= 0)
            return;
        try {
            const body = JSON.stringify(value);
            const response = new Response(body, {
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": `public, s-maxage=${ttlSeconds}`
                }
            });
            await caches.default.put(`${this.origin}/${key}`, response);
        }
        catch {
            // Silent failure: caching is best-effort.
        }
    }
}
let sharedCache = null;
export function getCache() {
    if (sharedCache)
        return sharedCache;
    const hasWorkersCaches = typeof caches !== "undefined" &&
        typeof caches.default !== "undefined";
    const isNode = typeof process !== "undefined" &&
        !!process.versions?.node;
    if (hasWorkersCaches && !isNode) {
        sharedCache = new WorkersCacheApi();
    }
    else {
        sharedCache = new MemoryLruCache(getCacheConfig().maxEntries);
    }
    return sharedCache;
}
/**
 * Reset the shared cache instance. Intended for tests.
 */
export function __resetCacheForTests() {
    sharedCache = null;
}
