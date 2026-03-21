import 'dotenv/config'
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const port = Number(process.env.PORT || 8080)
const host = '0.0.0.0'
const rootDir = path.dirname(fileURLToPath(import.meta.url))
const clientDir = path.join(rootDir, 'dist/client')

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const { default: app } = await import('./dist/server/server.js')

async function tryServeStaticAsset(requestUrl, res) {
  const filePath = path.normalize(
    path.join(clientDir, decodeURIComponent(requestUrl.pathname)),
  )

  if (!filePath.startsWith(clientDir)) {
    return false
  }

  try {
    const file = await stat(filePath)
    if (!file.isFile()) {
      return false
    }

    res.writeHead(200, {
      'content-type':
        contentTypes[path.extname(filePath).toLowerCase()] ||
        'application/octet-stream',
      'content-length': file.size,
      'cache-control': 'public, max-age=31536000, immutable',
    })

    createReadStream(filePath).pipe(res)
    return true
  } catch {
    return false
  }
}

const server = createServer(async (req, res) => {
  const controller = new AbortController()
  const requestUrl = new URL(
    req.url || '/',
    `http://${req.headers.host || `127.0.0.1:${port}`}`,
  )

  if (requestUrl.pathname.startsWith('/assets/')) {
    const served = await tryServeStaticAsset(requestUrl, res)
    if (served) {
      return
    }
  }

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
