import { Hono } from 'hono'
import { handleOgRequest } from './handler'

const app = new Hono<{ Bindings: Env }>()

app.get('/', (c) => {
  return c.text('OG image worker. Use GET /s/<url> or /i/<url>.')
})

app.get('/s/*', async (c) => {
  return await handleOgRequest(c.req.raw, c.env, 's')
})

app.get('/i/*', async (c) => {
  return await handleOgRequest(c.req.raw, c.env, 'i')
})

export default app
