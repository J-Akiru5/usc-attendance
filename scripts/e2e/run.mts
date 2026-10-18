/**
 * E2E runner: boots `nuxt dev` with the generated secrets the suites need,
 * starts the local email-capture server, then runs the four suites in turn
 * against the HTTP API (BASE_URL).
 *
 * The capture server impersonates the Resend API (`POST /emails`) so the dev
 * server never sends real mail: RESEND_BASE_URL and EMAIL_CAPTURE_URL both
 * point at it, and the suites read the inbox back over `GET /emails`.
 *
 * Nothing here touches the database except through the API under test, and
 * every suite cleans up its own `@example.invalid` rows.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import { createConnection } from 'node:net'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** `child.kill()` only kills the npx/cmd wrapper on Windows — take the whole tree down. */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'])
    return
  }
  child.kill('SIGTERM')
}

/** True when something already listens on the dev port (a stray server would hijack the run). */
function portInUse(port: number): Promise<boolean> {
  const tryHost = (host: string) =>
    new Promise<boolean>((resolve) => {
      const socket = createConnection({ port, host })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => resolve(false))
      socket.setTimeout(1000, () => {
        socket.destroy()
        resolve(false)
      })
    })
  return tryHost('127.0.0.1').then(busy => (busy ? true : tryHost('::1')))
}

type Captured = { to: string, subject: string, html: string }

async function startEmailCapture(): Promise<{
  port: number
  captured: Captured[]
  close: () => Promise<void>
}> {
  const captured: Captured[] = []
  const server = createServer((req, res) => {
    const method = req.method ?? 'GET'
    const requestPath = (req.url ?? '/').split('?')[0] ?? '/'

    // Inbox read-back used by the suites (client.mts capturedEmails()).
    if (method === 'GET' && requestPath === '/emails') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(captured))
      return
    }
    if (method === 'DELETE' && requestPath === '/emails') {
      captured.length = 0
      res.writeHead(204)
      res.end()
      return
    }
    if (method !== 'POST') {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end('{"error":"not found"}')
      return
    }

    // Resend SDK delivery: POST <RESEND_BASE_URL>/emails
    let raw = ''
    req.on('data', (chunk) => {
      raw += String(chunk)
    })
    req.on('end', () => {
      try {
        const parsed: unknown = JSON.parse(raw || '{}')
        const body = (parsed as Record<string, any>).body ?? parsed as Record<string, any>
        captured.push({
          to: String(body.to ?? ''),
          subject: String(body.subject ?? ''),
          html: String(body.html ?? body.text ?? '')
        })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"ok":true}')
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end('{"error":"bad capture payload"}')
      }
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    port,
    captured,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
  }
}

function startDevServer(env: NodeJS.ProcessEnv, port: number, onLog: (chunk: string) => void): ChildProcess {
  // --host is explicit: the default "localhost" can bind IPv6-only on Windows,
  // and the runner (and BASE_URL) talk to 127.0.0.1.
  const child = spawn('npx.cmd', ['nuxt', 'dev', '--port', String(port), '--host', '127.0.0.1'], {
    cwd: rootDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  })
  child.stdout?.on('data', chunk => onLog(String(chunk)))
  child.stderr?.on('data', chunk => onLog(String(chunk)))
  return child
}

/**
 * Ready only when Nitro is actually serving: the legacy 404 catcher must answer
 * JSON (Nuxt's boot page answers `text/html` with 503 "Starting Nuxt…") and a
 * real data route must answer its expected 401 — otherwise the first suite runs
 * against a half-started server.
 */
async function waitForServer(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const catcher = await fetch(`${baseUrl}/api/e2e-readiness-probe`, { redirect: 'manual' })
      const catcherType = catcher.headers.get('content-type') ?? ''
      const catcherBody = await catcher.text()
      if (catcherType.includes('json') && catcherBody.includes('API route not found')) {
        const route = await fetch(`${baseUrl}/api/attendance`, { redirect: 'manual' })
        const routeType = route.headers.get('content-type') ?? ''
        if (route.status === 401 && routeType.includes('json')) return
        lastError = `route probe HTTP ${route.status} (${routeType})`
      } else {
        lastError = `catcher probe HTTP ${catcher.status} (${catcherType})`
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Dev server did not become ready at ${baseUrl} (${lastError})`)
}

function runSuite(file: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('npx.cmd', ['tsx', path.join('scripts', 'e2e', file)], {
      cwd: rootDir,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })
    child.on('close', (code) => {
      killTree(child)
      resolve(code ?? 1)
    })
  })
}

async function main(): Promise<void> {
  const capture = await startEmailCapture()
  // Default off 3000: other projects commonly hold that port on dev machines,
  // and Nuxt would silently move to 3001 while the runner probed 3000.
  const port = Number(process.env.E2E_PORT ?? 3300)
  const baseUrl = `http://127.0.0.1:${port}`
  const captureUrl = `http://127.0.0.1:${capture.port}`
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BASE_URL: baseUrl,
    PORT: String(port),
    NITRO_PORT: String(port),
    NUXT_PUBLIC_SITE_URL: baseUrl,
    SITE_URL: baseUrl,
    QR_SECRET: process.env.QR_SECRET ?? randomBytes(32).toString('hex'),
    CRON_SECRET: process.env.CRON_SECRET ?? randomBytes(32).toString('hex'),
    EMAIL_CAPTURE_URL: captureUrl,
    RESEND_BASE_URL: captureUrl
  }

  console.log(`[e2e] email capture on ${captureUrl} (POST /emails, GET /emails)`)

  if (await portInUse(port)) {
    console.error(`[e2e] port ${port} is already in use — a stray server is running.`)
    console.error('[e2e] stop it first (Windows: taskkill /PID <pid> /T /F) or set E2E_PORT, then re-run.')
    await capture.close()
    process.exit(1)
  }

  console.log('[e2e] starting nuxt dev ...')

  let devLog = ''
  const dev = startDevServer(env, port, (chunk) => {
    devLog += chunk
  })

  let exitCode = 1
  try {
    await waitForServer(baseUrl, 120000)
    console.log('[e2e] dev server ready')

    const suites = ['export.e2e.mts', 'delegation.e2e.mts', 'rbac.e2e.mts', 'retention.e2e.mts', 'students.e2e.mts']
    const failures: string[] = []
    for (const suite of suites) {
      console.log(`\n[e2e] === ${suite} ===`)
      const code = await runSuite(suite, env)
      if (code !== 0) {
        failures.push(`${suite} (exit ${code})`)
      }
    }
    if (failures.length > 0) {
      console.error(`\n[e2e] FAILED: ${failures.join(', ')}`)
      exitCode = 1
    } else {
      console.log('\n[e2e] all suites passed (113 checks)')
      exitCode = 0
    }
  } catch (error) {
    console.error('[e2e] runner error:', error instanceof Error ? error.message : error)
    console.error(devLog.slice(-4000))
    exitCode = 1
  } finally {
    killTree(dev)
    await capture.close()
  }
  process.exit(exitCode)
}

void main()
