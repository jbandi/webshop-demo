import { createServer } from 'node:http'
import { Readable } from 'node:stream'

const port = Number(process.env.PORT || 3000)
const host = '0.0.0.0'

const { default: app } = await import('./dist/server/server.js')

const server = createServer(async (req, res) => {
  const controller = new AbortController()
  const requestUrl = new URL(
    req.url || '/',
    `http://${req.headers.host || `127.0.0.1:${port}`}`,
  )

  req.on('aborted', () => controller.abort())
  req.on('close', () => {
    if (!res.writableEnded) {
      controller.abort()
    }
  })

  const request = new Request(requestUrl, {
    method: req.method,
    headers: new Headers(
      Object.entries(req.headers).flatMap(([key, value]) => {
        if (Array.isArray(value)) {
          return value.map((entry) => [key, entry])
        }

        return value == null ? [] : [[key, value]]
      }),
    ),
    body:
      req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : Readable.toWeb(req),
    duplex: 'half',
    signal: controller.signal,
  })

  try {
    const response = await app.fetch(request)

    res.statusCode = response.status
    res.statusMessage = response.statusText

    const setCookies =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : []

    if (setCookies.length) {
      res.setHeader('set-cookie', setCookies)
    }

    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        return
      }

      res.setHeader(key, value)
    })

    if (!response.body) {
      res.end()
      return
    }

    Readable.fromWeb(response.body).pipe(res)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal Server Error'

    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    }

    res.end(message)
  }
})

server.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`)
})
