---
name: og-worker
description: Generate OpenGraph/Twitter card images for a Next.js App Router site using the self-hosted og-worker (Cloudflare Worker + R2). Use when adding OG images, social previews, generateMetadata openGraph.images, twitter.images, or when the user mentions og-worker, og:image, social cards, or link previews.
---

# og-worker (Next.js integration)

This worker serves OpenGraph images by screenshotting a target URL and caching the result (R2 + edge). It has two modes:

- `GET https://og.<your-domain>/s/<target-url>` (screen mode): screenshots the page at desktop width and scales the output to **1200×630**
- `GET https://og.<your-domain>/i/<target-url>` (island mode): screenshots **only** the element with `id="screenshot"` at its intrinsic size (no enforced dimensions)

Both endpoints return `image/webp` (fallback: `image/jpeg`). The response header `X-OG-Source` is one of: `cache-hit | r2-hit | generated`.

## Which mode should I use?

- **Use `/s/`** when you want a “good enough” OG image for any normal page with no extra work.
- **Use `/i/`** when the site already renders an OG-optimized card and exposes it as `<div id="screenshot">...</div>`.

## Prerequisites (must verify)

- **Worker base URL**: each project hosts its own instance (convention: `https://og.<project-domain>`). Replace placeholders in all examples.
- **Allowlist**: the Next.js site’s public hostname must be in the worker’s `ALLOWED_HOSTS` (otherwise you’ll get `400 Domain not allowed`).
- **Public access**: the target URL must be reachable without auth/redirect loops. The worker waits for `networkidle0`, so avoid late client-only fetches that never settle.

## Mode `s` (simplest): screenshot any page URL

Use this when you want OG images everywhere with minimal setup: just point the worker at the real page URL.

### Helper (`lib/og.ts`)

```ts
const OG_WORKER = process.env.NEXT_PUBLIC_OG_WORKER! // e.g. https://og.example.com

export function ogScreenshot(pageUrl: string) {
  // IMPORTANT: encode the *entire* target URL so it survives inside a path segment.
  return `${OG_WORKER}/s/${encodeURI(pageUrl)}`
}
```

### Next.js App Router example (`generateMetadata`)

```ts
import type { Metadata } from 'next'
import { ogScreenshot } from '@/lib/og'

export async function generateMetadata(): Promise<Metadata> {
  const pageUrl = 'https://example.com/blog/hello-world'
  const imageUrl = ogScreenshot(pageUrl)

  return {
    openGraph: {
      images: [{ url: imageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [{ url: imageUrl, width: 1200, height: 630 }],
    },
  }
}
```

### Cache busting

The worker’s R2 key varies by **pathname + a hash of the query string**. To regenerate, append a version query to the *target* URL:

- `https://example.com/blog/hello-world?og=v2`

Then rebuild the worker URL with that updated `pageUrl`.

## Mode `i`: custom OG card via `#screenshot` div

Use this when you want a designed OG card (title/subtitle/brand image) instead of a screenshot of the actual page.

The idea:

1. Create **OG-only pages** under `app/(og)/...` that render exactly a **1200×630** card.
2. Ensure the OG-only page contains a `<div id="screenshot">` that is the card root.
3. Have the worker screenshot those OG-only URLs via `/i/`.
4. Set `openGraph.images` and `twitter.images` to the worker URL (which points at the OG-only page URL).

### Required card root: `#screenshot` (exact OG dimensions)

The worker does **not** enforce dimensions in `/i/` mode. Your OG-only page must render a `#screenshot` element at the exact OG dimensions you want (typically **1200×630**), and it must exist in the DOM when `networkidle0` fires.

```tsx
import type { ReactNode } from 'react'

export default function OgLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>
        <div
          id="screenshot"
          style={{
            width: 1200,
            height: 630,
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          {children}
        </div>
      </body>
    </html>
  )
}
```

### Pattern 1: path-per-page (recommended for real content)

Create an OG route that mirrors your content routes, e.g.:

- Site page: `https://<site>/blog/<slug>`
- OG-only page: `https://<site>/og/blog/<slug>` (implemented under `app/(og)/og/blog/[slug]/page.tsx`)
- Worker image URL: `https://og.<your-domain>/i/https://<site>/og/blog/<slug>`

Implementation notes for the OG-only page:

- Render a single 1200×630 “card” root container.
- Fetch data in a Server Component (or cached `fetch`) so it is ready when the HTML renders.
- Use `next/font` if you need consistent typography (avoid system font drift).

### Pattern 2: one OG template with query params (good for simple cards)

Create a generic card page:

- OG-only page: `https://<site>/og/card?title=...&subtitle=...`
- Worker image URL: `https://og.<your-domain>/i/https://<site>/og/card?title=...&subtitle=...`

In `app/(og)/og/card/page.tsx`, read `searchParams` and render the card from them. Keep the output deterministic (no random IDs, no time-based content) unless you also add a cache-busting param.

### Helper: build “card” targets + worker URL

```ts
const OG_WORKER = process.env.NEXT_PUBLIC_OG_WORKER! // e.g. https://og.example.com
const SITE = process.env.NEXT_PUBLIC_SITE_URL! // e.g. https://example.com

export function ogScreenshot(pageUrl: string) {
  return `${OG_WORKER}/s/${encodeURI(pageUrl)}`
}

export function ogCard(params: Record<string, string>) {
  const target = new URL('/og/card', SITE)
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v)
  return `${OG_WORKER}/i/${encodeURI(target.toString())}`
}
```

### `generateMetadata` template for custom OG cards

```ts
import type { Metadata } from 'next'
import { ogCard } from '@/lib/og'

export async function generateMetadata(): Promise<Metadata> {
  const imageUrl = ogCard({
    title: 'My Post Title',
    subtitle: 'A short description that fits',
  })

  return {
    openGraph: {
      images: [{ url: imageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [{ url: imageUrl, width: 1200, height: 630 }],
    },
  }
}
```

## Gotchas & debugging

- **Slow first hit**: the first render may be slow (browser launch). Later hits should be served from R2 / edge cache.
- **Check source**: inspect `X-OG-Source` to confirm whether it’s cached, from R2, or freshly generated.
- **400 Domain not allowed**: add the hostname to the worker `ALLOWED_HOSTS`.
- **502 Failed to render**: the target is not publicly reachable, is redirecting forever, or is too slow for the worker timeout.
- **502 Missing #screenshot element**: `/i/` mode couldn’t find `#screenshot` on the page.
- **Middleware**: don’t put `(og)` routes behind auth, i18n redirects, or “logged-in only” middleware.
- **Loading behavior**: because the worker waits for `networkidle0`, avoid OG pages that keep polling or streaming data after initial render.

## Anti-patterns (avoid)

- Don’t build the worker URL without encoding the target URL (`encodeURI` is required).
- Don’t rely on the worker to “fix” sizing in `/i/` mode — the `#screenshot` element must be pre-sized by the site.
- Don’t rely on client-only rendering for OG pages (you’ll get blank/partial screenshots).

## Install (symlink)

To make this skill available globally:

```bash
ln -s /Users/lars/code/og-worker/skill ~/.agents/skills/og-worker
```
