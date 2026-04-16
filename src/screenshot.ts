import puppeteer from '@cloudflare/puppeteer'

export type ScreenshotResult = {
  bytes: Uint8Array
  contentType: 'image/webp' | 'image/jpeg'
}

const OG_WIDTH = 1200
const OG_HEIGHT = 630

export async function takeOgScreenshot(
  browserBinding: Fetcher,
  targetUrl: string,
  timeoutMs: number,
): Promise<ScreenshotResult> {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined

  try {
    browser = await puppeteer.launch(browserBinding)
    const page = await browser.newPage()

    await page.setViewport({
      width: OG_WIDTH,
      height: OG_HEIGHT,
      deviceScaleFactor: 1,
    })

    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: timeoutMs })

    const bytes = (await page.screenshot({
      type: 'webp',
      quality: 85,
      clip: { x: 0, y: 0, width: OG_WIDTH, height: OG_HEIGHT },
    })) as Uint8Array

    return { bytes, contentType: 'image/webp' }
  } catch (err) {
    // One retry with JPEG for environments where WebP is unexpectedly unsupported.
    if (!browser) throw err

    const page = await browser.newPage()
    await page.setViewport({
      width: OG_WIDTH,
      height: OG_HEIGHT,
      deviceScaleFactor: 1,
    })
    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: timeoutMs })
    const bytes = (await page.screenshot({
      type: 'jpeg',
      quality: 82,
      clip: { x: 0, y: 0, width: OG_WIDTH, height: OG_HEIGHT },
    })) as Uint8Array
    return { bytes, contentType: 'image/jpeg' }
  } finally {
    try {
      await browser?.close()
    } catch {
      // ignore
    }
  }
}

