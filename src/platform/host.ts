const EXEMPT = ["/platform", "/assets", "/health", "/favicon.ico"];

export function verticalForHost(hostname: string, hosts: Record<string, string>): string | null {
  const host = hostname.split(":")[0]?.trim().toLowerCase() ?? "";
  return hosts[host] ?? null;
}

/** Prefix a vertical host's public paths with /v/:id. Tool URLs already include the prefix. */
export function rewriteForVertical(verticalId: string | null, rawUrl: string): string {
  if (!verticalId) return rawUrl;
  const q = rawUrl.indexOf("?");
  const path = q === -1 ? rawUrl : rawUrl.slice(0, q);
  const query = q === -1 ? "" : rawUrl.slice(q);
  if (path.startsWith("/v/") || EXEMPT.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return rawUrl;
  }
  const suffix = path === "/" ? "" : path;
  return `/v/${verticalId}${suffix}${query}`;
}
