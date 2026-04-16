## OG Image Worker

Cloudflare Worker that serves OpenGraph images from R2.

Two modes:

- `GET /s/<target-url>` — **screen** mode: screenshots the page rendered at a 1920px desktop width, scaled to **1200×630** (WebP). Use for any normal page.
- `GET /i/<target-url>` — **island** mode: screenshots **only** the element with `id="screenshot"` at its intrinsic size (no dimension enforcement). Use when the target page already renders an OG-optimized card.

Delivery:

- If the image already exists in **R2**, it’s served from there.
- If missing, it’s generated with **Browser Rendering** (Puppeteer), stored in **R2**, and cached at the edge for **1 day**.

## API

### Request format

`GET /s/<target-url>` or `GET /i/<target-url>`

Examples:

- `GET /s/https://example.com/`
- `GET /s/https://example.com/path?q=1`
- `GET /i/https://example.com/og/card?title=Hello`
- Encoded form also works: `GET /s/https%3A%2F%2Fexample.com%2Fpath`

`/s/` and `/i/` have disjoint R2 cache spaces (keys are prefixed with `s/` or `i/`), so requesting the same target URL under both modes is safe and produces independent cached images.

### Response headers

- `Cache-Control: public, max-age=86400, immutable`
- `CDN-Cache-Control: public, max-age=86400`
- `X-OG-Source: cache-hit | r2-hit | generated`

### Error responses

- `400 Missing or invalid URL` — couldn’t parse a target URL from the path
- `400 Invalid protocol` — target URL is not `http:` or `https:`
- `400 Domain not allowed` — target hostname is not in `ALLOWED_HOSTS`
- `502 Failed to render` — target page didn’t load in time or errored
- `502 Missing #screenshot element` — `/i/` mode couldn’t find `#screenshot` in the DOM when `networkidle0` fired

## Setup

### 1) Install deps

```bash
pnpm install
```

### 2) Configure allowlist

Edit `ALLOWED_HOSTS` in `wrangler.jsonc`:

```jsonc
"vars": {
  "ALLOWED_HOSTS": ["example.com"],
  "SCREENSHOT_TIMEOUT_MS": 25000
}
```

### 3) Create the R2 bucket

The Worker expects a bucket named `og-worker-images`:

```bash
npx wrangler r2 bucket create og-worker-images
```

## Local development

```bash
pnpm run dev
```

Notes:

- Browser Rendering has local limitations; if you need a real remote browser during local dev, configure remote bindings per Cloudflare docs.

## Deploy

### Deploy manually

```bash
pnpm run deploy
```

### Deploy via Cloudflare Workers Builds (GitHub)

1. Push this repo to GitHub.
2. Cloudflare Dashboard → **Workers & Pages** → `og-worker` → **Settings** → **Builds** → **Connect to Git**.
3. Configure:
   - Build command: `pnpm install`
   - Deploy command: `pnpm run deploy`
4. Push to your connected branch (e.g. `main`) to trigger build + deploy.

## Type generation

Whenever `wrangler.jsonc` changes, regenerate bindings types:

```bash
pnpm run cf-typegen
```
