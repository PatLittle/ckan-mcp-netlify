import portalsConfig from "../portals.json" with { type: "json" };
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
export function getPortalApiPath(serverUrl) {
    const portal = getPortalConfig(serverUrl);
    return portal?.api_path || '/api/3/action';
}
