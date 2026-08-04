#!/usr/bin/env node

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const distRoot = resolve(packageRoot, 'dist')
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function option(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Context Canvas 1.0.0')
  console.log('Usage: npx context-canvas [--port 5173] [--host 127.0.0.1]')
  process.exit(0)
}

if (!existsSync(join(distRoot, 'index.html'))) {
  console.error('Context Canvas is missing its production build. Reinstall the package or run pnpm run build.')
  process.exit(1)
}

const host = option('--host', '127.0.0.1')
let port = Number(option('--port', '5173'))
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('Invalid port. Use a number between 0 and 65535.')
  process.exit(1)
}

function serve(request, response) {
  const requestPath = decodeURIComponent((request.url || '/').split('?')[0])
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '')
  const candidate = normalize(join(distRoot, relativePath))
  const safeRoot = `${distRoot}${sep}`
  const filePath = candidate === distRoot || candidate.startsWith(safeRoot) ? candidate : join(distRoot, 'index.html')
  const resolvedPath = existsSync(filePath) && statSync(filePath).isFile() ? filePath : join(distRoot, 'index.html')
  response.setHeader('Content-Type', mimeTypes[extname(resolvedPath).toLowerCase()] || 'application/octet-stream')
  createReadStream(resolvedPath).on('error', () => {
    response.statusCode = 500
    response.end('Unable to read Context Canvas asset.')
  }).pipe(response)
}

function listen() {
  const server = createServer(serve)
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && port < 65535) {
      port += 1
      listen()
      return
    }
    console.error(error.message)
    process.exit(1)
  })
  server.listen(port, host, () => {
    const address = server.address()
    const actualPort = typeof address === 'object' && address ? address.port : port
    console.log(`Context Canvas 1.0.0 is running at http://${host}:${actualPort}/`)
    console.log('Press Ctrl-C to stop.')
  })
  process.once('SIGINT', () => server.close(() => process.exit(0)))
  process.once('SIGTERM', () => server.close(() => process.exit(0)))
}

listen()
