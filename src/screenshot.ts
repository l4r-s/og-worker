import puppeteer from '@cloudflare/puppeteer'

export type ScreenshotResult = {
  bytes: Uint8Array
  contentType: 'image/webp' | 'image/jpeg'
}

export type OgMode = 's' | 'i'

const OG_WIDTH = 1200
const OG_HEIGHT = 630
const DESKTOP_WIDTH = 1920
const DESKTOP_HEIGHT = Math.round((DESKTOP_WIDTH * OG_HEIGHT) / OG_WIDTH)
const DEVICE_SCALE_FACTOR = OG_WIDTH / DESKTOP_WIDTH
const ELEMENT_VIEWPORT_WIDTH = 1280
const ELEMENT_VIEWPORT_HEIGHT = 800
const SCREENSHOT_SELECTOR = '#screenshot'

export async function takeOgScreenshot(
  browserBinding: Fetcher,
  targetUrl: string,
  timeoutMs: number,
  mode: OgMode,
): Promise<ScreenshotResult> {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined

  try {
    browser = await puppeteer.launch(browserBinding)
    const page = await browser.newPage()

    if (mode === 's') {
      await page.setViewport({
        width: DESKTOP_WIDTH,
        height: DESKTOP_HEIGHT,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
      })

      await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: timeoutMs })

      const bytes = (await page.screenshot({
        type: 'webp',
        quality: 95,
        clip: { x: 0, y: 0, width: DESKTOP_WIDTH, height: DESKTOP_HEIGHT },
      })) as Uint8Array

      return { bytes, contentType: 'image/webp' }
    }

    await page.setViewport({
      width: ELEMENT_VIEWPORT_WIDTH,
      height: ELEMENT_VIEWPORT_HEIGHT,
      deviceScaleFactor: 1,
    })

    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: timeoutMs })

    const el = await page.$(SCREENSHOT_SELECTOR)
    if (!el) throw new Error('missing_screenshot_element')

    const bytes = (await el.screenshot({ type: 'webp', quality: 95 })) as Uint8Array

    return { bytes, contentType: 'image/webp' }
  } catch (err) {
    // One retry with JPEG for environments where WebP is unexpectedly unsupported.
    if (!browser) throw err

    const page = await browser.newPage()

    if (mode === 's') {
      await page.setViewport({
        width: DESKTOP_WIDTH,
        height: DESKTOP_HEIGHT,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
      })
      await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: timeoutMs })
      const bytes = (await page.screenshot({
        type: 'jpeg',
        quality: 82,
        clip: { x: 0, y: 0, width: DESKTOP_WIDTH, height: DESKTOP_HEIGHT },
      })) as Uint8Array
      return { bytes, contentType: 'image/jpeg' }
    }

    await page.setViewport({
      width: ELEMENT_VIEWPORT_WIDTH,
      height: ELEMENT_VIEWPORT_HEIGHT,
      deviceScaleFactor: 1,
    })
    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: timeoutMs })

    const el = await page.$(SCREENSHOT_SELECTOR)
    if (!el) throw new Error('missing_screenshot_element')

    const bytes = (await el.screenshot({ type: 'jpeg', quality: 82 })) as Uint8Array
    return { bytes, contentType: 'image/jpeg' }
  } finally {
    try {
      await browser?.close()
    } catch {
      // ignore
    }
  }
}

