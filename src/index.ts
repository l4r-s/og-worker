import { Hono } from 'hono'
import { handleOgRequest } from './handler'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.get('/', (c) => {
  return c.text('OG image worker. Use GET /og/<url>.')
})

app.get('/og/*', async (c) => {
  return await handleOgRequest(c.req.raw, c.env)
})

export default app
