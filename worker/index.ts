import { Hono } from 'hono';
import { connect } from 'cloudflare:sockets';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppEnv {
  Bindings: {
    ASSETS?: { fetch: typeof fetch };
  };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono<AppEnv>();

// ---- /api/status ----
app.get('/api/status', (c) => {
  return c.json({
    capabilities: [
      'curl-proxy',
      'ssh-proxy',
    ],
  });
});

// ---- /api/curl — HTTP proxy (bypasses browser CORS for tarball downloads, etc.) ----
app.all('/api/curl', async (c) => {
  const targetUrl = c.req.query('url');
  if (!targetUrl) {
    return c.json({ error: 'missing "url" query parameter' }, 400);
  }

  try { new URL(targetUrl); } catch {
    return c.json({ error: 'invalid URL' }, 400);
  }

  const upstreamHeaders = new Headers(c.req.raw.headers);
  upstreamHeaders.delete('host');
  upstreamHeaders.set('accept-encoding', 'gzip');

  const upstream = await fetch(targetUrl, {
    method: c.req.method,
    headers: upstreamHeaders,
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD'
      ? await c.req.raw.clone().arrayBuffer()
      : undefined,
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set('access-control-allow-origin', '*');
  // Allow binary transfer for tarballs — no charset mangling
  responseHeaders.set('access-control-expose-headers', '*');
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
});

// ---- /api/connect — WebSocket-to-TCP raw proxy (pure SOCKS-style tunnel) ----
app.get('/api/connect', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return c.json({ error: 'invalid request' }, 400);
  }

  const { searchParams } = new URL(c.req.url);
  const host = searchParams.get('host');
  const port = parseInt(searchParams.get('port') || '22', 10);

  if (!host) {
    return c.json({ error: 'missing "host" query parameter' }, 400);
  }

  // Open TCP connection to the target
  const tcp = connect({ hostname: host, port });
  await tcp.opened;

  // Create a WebSocket pair
  const pair = new WebSocketPair();
  const [clientWs, serverWs] = [pair[0], pair[1]];
  serverWs.accept();

  // TCP → WebSocket
  tcp.readable.pipeTo(new WritableStream<Uint8Array>({
    write(chunk) { serverWs.send(chunk); },
    close() { serverWs.close(); },
    abort() { serverWs.close(); },
  })).catch(() => {});

  // WebSocket → TCP
  const tcpWriter = tcp.writable.getWriter();
  serverWs.addEventListener('message', (event: MessageEvent) => {
    try {
      if (event.data instanceof ArrayBuffer) {
        tcpWriter.write(new Uint8Array(event.data));
      } else if (typeof event.data === 'string') {
        tcpWriter.write(new TextEncoder().encode(event.data));
      }
    } catch { /* connection closed */ }
  });
  serverWs.addEventListener('close', () => {
    try { tcpWriter.close(); } catch {}
    try { (tcp as any).close?.(); } catch {}
  });
  serverWs.addEventListener('error', () => {
    try { tcpWriter.close(); } catch {}
    try { (tcp as any).close?.(); } catch {}
  });

  return new Response(null, { status: 101, webSocket: clientWs });
});

// ---- SPA fallback — serve static assets / index.html ----
app.get('/*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Static assets not available. Run via `npm run dev`.', 404);
});

export default app;
