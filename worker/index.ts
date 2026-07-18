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
      'npm-proxy',
      'curl-proxy',
      'ssh-proxy',
    ],
  });
});

// ---- /api/npm/* → registry.npmjs.org (with tarball URL rewriting) ----
app.all('/api/npm/*', async (c) => {
  const npmPath = c.req.path.replace('/api/npm', '');
  const npmUrl = `https://registry.npmjs.org${npmPath}${new URL(c.req.url).search}`;

  const upstreamHeaders = new Headers(c.req.raw.headers);
  upstreamHeaders.delete('host');
  upstreamHeaders.set('accept', 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8');

  const upstream = await fetch(npmUrl, {
    method: c.req.method,
    headers: upstreamHeaders,
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD'
      ? await c.req.raw.clone().arrayBuffer()
      : undefined,
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.set('access-control-allow-origin', '*');

  // Rewrite absolute npm registry URLs → /api/npm/ so downstream fetches
  // (e.g. almostnode's downloadAndExtract) stay on the proxy and avoid CORS.
  const contentType = upstream.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    let body = await upstream.text();
    body = body.replace(/https:\/\/registry\.npmjs\.org\//g, '/api/npm/');
    return new Response(body, { status: upstream.status, headers: responseHeaders });
  }

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
});

// ---- /api/curl — same-origin HTTP proxy ----
app.all('/api/curl', async (c) => {
  const targetUrl = c.req.query('url');
  if (!targetUrl) {
    return c.json({ error: 'missing "url" query parameter' }, 400);
  }

  let parsed: URL;
  try { parsed = new URL(targetUrl); } catch {
    return c.json({ error: 'invalid URL' }, 400);
  }

  const requestOrigin = new URL(c.req.url).origin;
  if (parsed.origin !== requestOrigin) {
    return c.json({ error: 'cross-origin requests not allowed via /api/curl' }, 403);
  }

  const upstreamHeaders = new Headers(c.req.raw.headers);
  upstreamHeaders.delete('host');

  const upstream = await fetch(targetUrl, {
    method: c.req.method,
    headers: upstreamHeaders,
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD'
      ? await c.req.raw.clone().arrayBuffer()
      : undefined,
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set('access-control-allow-origin', '*');
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
});

// ---- /api/connect — WebSocket-to-TCP SSH pipe ----
app.get('/api/connect', async (c) => {
  const upgradeHeader = c.req.header('Upgrade')
  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return c.json({ error: 'invalid request' }, 400)
  }
  const { searchParams } = new URL(c.req.url);
  const host = searchParams.get('host');
  const port = parseInt(searchParams.get('port') || '22', 10);

  if (!host) {
    return c.json({ error: 'missing "host" query parameter' }, 400);
  }

  // Open TCP connection to the target
  const tcp = connect({ hostname: host, port });
  await tcp.opened

  // Create a WebSocket pair: one end to the client, one for the server side
  const pair = new WebSocketPair();
  const [clientWs, serverWs] = [pair[0], pair[1]];

  // Accept the server-side WebSocket
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
