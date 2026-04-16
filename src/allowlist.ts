export function isAllowedHostname(hostname: string, allowedHosts: readonly string[]): boolean {
  const normalized = hostname.toLowerCase()
  return allowedHosts.some((h) => h.toLowerCase() === normalized)
}

