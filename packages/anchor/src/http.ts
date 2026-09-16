export function stripTrailingSlash(url: string): string {
    return url.replace(/\/$/, "");
}

export function buildAuthHeaders(token: string, extraHeaders: Record<string, string> = {}): Headers {
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${token}`);
    for (const [key, value] of Object.entries(extraHeaders)) {
        headers.set(key, value);
    }
    return headers;
}

export function tenantPath(baseUrl: string, tenantId: string, suffix: string): string {
    return `${stripTrailingSlash(baseUrl)}/v1/tenants/${encodeURIComponent(tenantId)}${suffix}`;
}
