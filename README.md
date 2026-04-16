## OG Image Worker

Cloudflare Worker that serves OpenGraph images from R2.

- `GET /og/<target-url>` returns a **1200×630** screenshot (WebP) of `target-url`
- If it already exists, it’s served from **R2**
- If missing, it’s generated with **Browser Rendering** (Puppeteer), stored in **R2**, and cached at the edge for **1 day**

## API

### Request format

`GET /og/<target-url>`

Examples:

- `GET /og/https://example.com/`
- `GET /og/https://example.com/path?q=1`
- Encoded form also works: `GET /og/https%3A%2F%2Fexample.com%2Fpath`

### Response headers

- `Cache-Control: public, max-age=86400, immutable`
- `CDN-Cache-Control: public, max-age=86400`
- `X-OG-Source: cache-hit | r2-hit | generated`

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
