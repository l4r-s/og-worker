import { isAllowedHostname } from './allowlist'
import { buildR2Key } from './keys'
import { takeOgScreenshot, type OgMode } from './screenshot'

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

function withCacheHeaders(headers: Headers, etag: string) {
  headers.set('Cache-Control', 'public, max-age=86400, immutable')
  headers.set('CDN-Cache-Control', 'public, max-age=86400')
  headers.set('ETag', `"${etag}"`)
}

function extractTargetUrlFromRequest(request: Request, prefix: '/s/' | '/i/'): URL {
  const incoming = new URL(request.url)
  // rawPath includes the literal route prefix, and we need to preserve any `?query` meant for the target URL.
  const suffix = incoming.pathname.startsWith(prefix) ? incoming.pathname.slice(prefix.length) : ''
  let raw = `${suffix}${incoming.search}`

  if (!raw) throw new Error('missing_target_url')

  // Some routers collapse the double slash in `https://` when carried in a path.
  // If we see `https:/example.com`, restore it to `https://example.com`.
  raw = raw.replace(/^(https?):\/([^/])/, '$1://$2')

  if (/^https?%3A/i.test(raw)) {
    raw = decodeURIComponent(raw)
  }

  return new URL(raw)
}

export async function handleOgRequest(
  request: Request,
  env: CloudflareBindings,
  mode: OgMode,
): Promise<Response> {
  const cached = await caches.default.match(request)
  if (cached) {
    const headers = new Headers(cached.headers)
    headers.set('X-OG-Source', 'cache-hit')
    return new Response(cached.body, { status: cached.status, headers })
  }

  let target: URL
  try {
    target = extractTargetUrlFromRequest(request, mode === 's' ? '/s/' : '/i/')
  } catch {
    return new Response('Missing or invalid URL', {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return new Response('Invalid protocol', {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  if (!isAllowedHostname(target.hostname, env.ALLOWED_HOSTS)) {
    return new Response('Domain not allowed', {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const key = await buildR2Key(target, mode)
  const existing = await env.OG_BUCKET.get(key)
  if (existing) {
    const headers = new Headers()
    existing.writeHttpMetadata(headers)
    headers.set('Content-Type', existing.httpMetadata?.contentType ?? 'image/webp')
    headers.set('X-OG-Source', 'r2-hit')

    const body = await existing.arrayBuffer()
    const etag = (await sha256Hex(new Uint8Array(body))).slice(0, 16)
    withCacheHeaders(headers, etag)
    const response = new Response(body, { status: 200, headers })
    await caches.default.put(request, response.clone())
    return response
  }

  const timeoutMs =
    typeof env.SCREENSHOT_TIMEOUT_MS === 'number' ? env.SCREENSHOT_TIMEOUT_MS : 25000

  let screenshot
  try {
    screenshot = await takeOgScreenshot(env.BROWSER, target.toString(), timeoutMs, mode)
  } catch (err) {
    if (err instanceof Error && err.message === 'missing_screenshot_element') {
      return new Response('Missing #screenshot element', {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    return new Response('Failed to render', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const etag = (await sha256Hex(screenshot.bytes)).slice(0, 16)

  await env.OG_BUCKET.put(key, screenshot.bytes, {
    httpMetadata: {
      contentType: screenshot.contentType,
      cacheControl: 'public, max-age=86400, immutable',
    },
    customMetadata: {
      sourceUrl: target.toString(),
      generatedAt: new Date().toISOString(),
    },
  })

  const headers = new Headers()
  headers.set('Content-Type', screenshot.contentType)
  headers.set('X-OG-Source', 'generated')
  withCacheHeaders(headers, etag)

  const response = new Response(screenshot.bytes, { status: 200, headers })
  await caches.default.put(request, response.clone())
  return response
}

