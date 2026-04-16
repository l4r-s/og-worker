import type { OgMode } from './screenshot'

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

function sanitizePathname(pathname: string): string {
  const trimmed = pathname.replace(/^\/+/, '')
  if (!trimmed) return '__root'

  return trimmed
    .split('/')
    .map((seg) => {
      try {
        return encodeURIComponent(decodeURIComponent(seg))
      } catch {
        return encodeURIComponent(seg)
      }
    })
    .join('/')
}

export async function buildR2Key(targetUrl: URL, mode: OgMode): Promise<string> {
  const host = targetUrl.hostname.toLowerCase()
  const pathPart = sanitizePathname(targetUrl.pathname)

  let key = `${mode}/${host}/${pathPart}`
  if (targetUrl.search) {
    const qhash = (await sha256Hex(targetUrl.search)).slice(0, 10)
    key = `${key}-${qhash}`
  }
  key = `${key}.webp`

  // Avoid extremely long keys (Cloudflare R2 supports long keys, but keeping this bounded helps tooling).
  if (key.length > 900) {
    const fullHash = (await sha256Hex(targetUrl.toString())).slice(0, 24)
    key = `${mode}/${host}/__hash/${fullHash}.webp`
  }

  return key
}

