import portalsConfig from '../portals.json' with { type: "json" };
function normalizeUrl(url) {
    return url.replace(/\/$/, '');
}
function extractHostname(url) {
    try {
        return new URL(url).hostname;
    }
    catch {
        return null;
    }
}
export function getPortalConfig(serverUrl) {
    const cleanServerUrl = normalizeUrl(serverUrl);
    const portal = portalsConfig.portals.find((p) => {
        const mainUrl = normalizeUrl(p.api_url);
        const aliases = (p.api_url_aliases || []).map(normalizeUrl);
        return mainUrl === cleanServerUrl || aliases.includes(cleanServerUrl);
    });
    return portal || null;
}
export function getPortalSearchConfig(serverUrl) {
    const portal = getPortalConfig(serverUrl);
    const defaults = portalsConfig.defaults?.search || {};
    return {
        force_text_field: portal?.search?.force_text_field ?? defaults.force_text_field ?? false
    };
}
/** Returns true if the portal has an explicit force_text_field setting in portals.json */
export function isPortalSearchExplicitlyConfigured(serverUrl) {
    const portal = getPortalConfig(serverUrl);
    return portal?.search?.force_text_field !== undefined;
}
export function normalizePortalUrl(serverUrl) {
    return normalizeUrl(serverUrl);
}
export function getPortalApiUrlForHostname(hostname) {
    const portal = portalsConfig.portals.find((p) => {
        const urls = [p.api_url, ...(p.api_url_aliases || [])];
        return urls.some((url) => extractHostname(url) === hostname);
    });
    return portal ? normalizeUrl(portal.api_url) : null;
}
export function getPortalHvdConfig(serverUrl) {
    const portal = getPortalConfig(serverUrl);
    return portal?.hvd ?? null;
}
/** Lookup by SPARQL endpoint URL (used by sparql.ts to determine method) */
export function getSparqlConfig(endpointUrl) {
    const cleanUrl = normalizeUrl(endpointUrl);
    const portal = portalsConfig.portals.find((p) => p.sparql && normalizeUrl(p.sparql.endpoint_url) === cleanUrl);
    return portal?.sparql ?? null;
}
/** Lookup by CKAN server URL (used by status.ts to show SPARQL endpoint) */
export function getPortalSparqlConfig(serverUrl) {
    const portal = getPortalConfig(serverUrl);
    return portal?.sparql ?? null;
}
export function getPortalApiPath(serverUrl) {
    const portal = getPortalConfig(serverUrl);
    return portal?.api_path || '/api/3/action';
}
export function requiresMultilingualNormalization(serverUrl) {
    const portal = getPortalConfig(serverUrl);
    return portal?.normalize === 'multilingual';
}
