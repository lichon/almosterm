import { defineCommand } from 'just-bash';
import { useVfsStore } from '../store/vfsStore';
import { getTerminal, setSshStream, writeTerm } from '../utils';
import { getContainer } from '../fs/configure';
import type { Client } from 'ssh2';

// ---------------------------------------------------------------------------
// Polyfill: patch safer-buffer to use `new Buffer()` instead of `Buffer()`.
// The `buffer` polyfill in almostnode requires `new`; plain Buffer() calls
// inside safer-buffer's Safer.from / Safer.alloc would fail otherwise.
// ---------------------------------------------------------------------------

const SAFER_BUFFER_POLYFILL = `
(function patchSaferBufferAtRequire() {
  // load safer to cache
  var safer = require('safer-buffer');

  for (mid in require.cache) {
    if (mid.endsWith('node_modules/safer-buffer/safer.js')) {
      var module = require.cache[mid]
      if (module.exports.__patched) break; // already patched
      module.exports.__patched = true;
      module.exports.Buffer.isBuffer = function () {
        return true
      }

      module.exports.Buffer.from = function (value, encodingOrOffset, length) {
        if (typeof value === 'number') {
          throw new TypeError('The "value" argument must not be of type number. Received type ' + typeof value);
        }
        if (value && typeof value.length === 'undefined') {
          throw new TypeError('The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type ' + typeof value);
        }
        return new Buffer(value, encodingOrOffset, length);
      };

      // Patch Safer.alloc to use new Buffer()
      module.exports.Buffer.alloc = function (size, fill, encoding) {
        if (typeof size !== 'number') {
          throw new TypeError('The "size" argument must be of type number. Received type ' + typeof size);
        }
        if (size < 0 || size >= 2 * (1 << 30)) {
          throw new RangeError('The value "' + size + '" is invalid for option "size"');
        }
        var buf = new Buffer(size);
        if (!fill || fill.length === 0) {
          buf.fill(0);
        } else if (typeof encoding === 'string') {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
        return buf;
      };
      break;
    }
  }
})();
`;

/**
 * ssh — connect to a remote host via SSH protocol (ssh2 runs client-side).
 *
 * Usage:
 *   ssh <user@host> [-p <port>] [-pw <password>] [-i <identity-file>] [-v]
 *
 * The Worker acts as a pure TCP proxy (WebSocket → raw TCP).
 * All SSH protocol handling — encryption, authentication, key exchange —
 * runs in the browser via the ssh2 library.
 */

// ---------------------------------------------------------------------------
// WebSocketSocket — bridges a browser WebSocket to a Node.js net.Socket-like
// duplex stream. ssh2 uses this as its underlying TCP transport via cfg.sock.
// ---------------------------------------------------------------------------

class WebSocketSocket {
  private _ws: WebSocket;
  private _listeners: Record<string, Array<(...args: any[]) => void>> = {};
  private _closed = false;

  writable: boolean;
  _readableState: { ended: boolean };

  constructor(ws: WebSocket) {
    this._ws = ws;
    this.writable = true;
    this._readableState = { ended: false };

    ws.onmessage = (event) => {
      if (this._closed) return;
      let data: Uint8Array;
      if (event.data instanceof ArrayBuffer) {
        // ssh2 need buffer callback
        data = Buffer.from(event.data);
      } else if (event.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
          if (!this._closed && reader.result instanceof ArrayBuffer) {
            this._emit('data', new Uint8Array(reader.result));
          }
        };
        reader.readAsArrayBuffer(event.data);
        return;
      } else if (typeof event.data === 'string') {
        data = new TextEncoder().encode(event.data);
      } else {
        return;
      }
      this._emit('data', data);
    };

    ws.onclose = () => {
      if (this._closed) return;
      this._closed = true;
      this._emit('close');
    };

    ws.onerror = (err) => {
      if (this._closed) return;
      this._emit('error', err);
    };
  }

  write(data: Uint8Array | string, _encoding?: string): boolean {
    if (this._closed) return false;
    if (this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      this._ws.send(data);
      return true;
    } catch {
      return false;
    }
  }

  end(): void {
    if (this._closed) return;
    this._closed = true;
    try { this._ws.close(); } catch {}
    this._emit('close');
  }

  destroy(): void {
    this.end();
  }

  resume(): void {
  }

  pause(): void {
  }

  setNoDelay(_noDelay?: boolean): void {}

  on(event: string, cb: (...args: any[]) => void): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
    return this;
  }

  removeAllListeners(event?: string): void {
    if (event) {
      delete this._listeners[event];
    } else {
      this._listeners = {};
    }
  }

  private _emit(event: string, ...args: any[]): void {
    const cbs = this._listeners[event];
    if (cbs) for (const cb of cbs) cb(...args);
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const ssh = defineCommand('ssh', async (args, _ctx) => {
  const capabilities = useVfsStore.getState().capabilities;
  const hasSshProxy = capabilities.includes('ssh-proxy');

  if (!hasSshProxy) {
    writeTerm(
      'ssh: SSH proxy unavailable.\n' +
        'Run locally with `npm run cf-dev` to enable SSH connections.\n',
      'stderr',
    );
    return { stdout: '', stderr: '', exitCode: 1 };
  }

  if (args.length === 0) {
    return {
      stdout: '',
      stderr:
        'ssh: missing host\n' +
        'Usage: ssh <user@host> [-p <port>] [-pw <password>] [-i <identity-file>] [-v]\n',
      exitCode: 1,
    };
  }

  const target = args[0];
  let port = 22;
  let password: string | undefined;
  let privateKey: string | undefined;
  let verbosity = 0;

  // Parse flags
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '-p' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        return {
          stdout: '',
          stderr: `ssh: invalid port: ${args[i + 1]}\n`,
          exitCode: 1,
        };
      }
      i++;
    } else if (args[i] === '-pw' && args[i + 1]) {
      password = args[i + 1];
      i++;
    } else if (args[i] === '-v' || args[i] === '-vv' || args[i] === '-vvv') {
      verbosity = args[i].match(/^-(v+)$/) ? args[i].length - 1 : 1;
    } else if (args[i] === '-i' && args[i + 1]) {
      const keyPath = args[i + 1];
      try {
        const { getVfs } = await import('../fs/configure');
        const vfs = getVfs();
        if (!vfs.existsSync(keyPath)) {
          return {
            stdout: '',
            stderr: `ssh: identity file not found: ${keyPath}\n`,
            exitCode: 1,
          };
        }
        const raw = vfs.readFileSync(keyPath) as Uint8Array;
        // privateKey = Buffer.from(raw);
      } catch (err: any) {
        return {
          stdout: '',
          stderr: `ssh: could not read identity file: ${err.message}\n`,
          exitCode: 1,
        };
      }
      i++;
    }
  }

  // Parse user@host
  const atIdx = target.lastIndexOf('@');
  const user = atIdx >= 0 ? target.slice(0, atIdx) : '';
  const host = atIdx >= 0 ? target.slice(atIdx + 1) : target;

  if (!host) {
    return { stdout: '', stderr: 'ssh: invalid host\n', exitCode: 1 };
  }

  const username = user || 'root';

  writeTerm(`ssh: connecting to ${username}@${host}:${port}...\r\n`);

  const repl = getContainer().createREPL();
  repl.eval(SAFER_BUFFER_POLYFILL);

  // ---- Step 1: Open WebSocket to Worker (raw TCP proxy) ----
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/connect?host=${encodeURIComponent(host)}&port=${port}`;
  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  const wsOpen = await new Promise<boolean>((resolve) => {
    ws.onopen = () => resolve(true);
    ws.onerror = () => resolve(false);
    ws.onclose = () => resolve(false);
  });

  if (!wsOpen) {
    return {
      stdout: '',
      stderr: `ssh: could not reach ${host}:${port} via proxy\n`,
      exitCode: 1,
    };
  }

  // ---- Step 2: Wrap WebSocket as a socket for ssh2 ----
  const sock = new WebSocketSocket(ws);

  // ---- Step 3: Create ssh2 client ----
  const conn = repl.eval(`new (require('ssh2').Client)()`) as Client;

  const sshReady = new Promise<'ready' | 'error'>((resolve) => {
    conn.on('ready', () => resolve('ready'));
    conn.on('error', (err) => {
      writeTerm(`ssh: ${err.message}\r\n`, 'stderr');
      writeTerm(`Stack trace:\r\n${err.stack}\r\n`, 'stderr');
      resolve('error');
    });
    conn.on('banner', (msg) => {
      if (verbosity > 0) writeTerm(`${msg}\r\n`);
    });
  });

  conn.connect({
    sock: sock as any,
    username,
    password,
    debug: verbosity > 0
      ? (msg) => {
          writeTerm(`debug1: ${msg}\r\n`);
        }
      : undefined,
    algorithms: {
      kex: ['ecdh-sha2-nistp256'],
      serverHostKey: ['rsa-sha2-256'],
      compress: ['none'],
    },
  });

  const result = await sshReady;
  if (result === 'error') {
    sock.destroy();
    return { stdout: '', stderr: '', exitCode: 1 };
  }

  writeTerm(`ssh: connected to ${username}@${host}:${port}\r\n\r\n`);

  // ---- Step 4: Open shell and bridge to terminal ----
  conn.shell({ term: 'xterm-256color' }, (err, stream) => {
    if (err) {
      writeTerm(`ssh: shell open failed: ${err.message}\r\n`, 'stderr');
      conn.end();
      return;
    }

    // Register the stream so Terminal.tsx forwards keystrokes to it.
    // Terminal.onData checks window.__almosterm_ssh_stream at the top
    // of its handler; when set, all keystrokes go directly to SSH.
    setSshStream(stream);
    const term = getTerminal()

    // SSH shell stdout → terminal
    stream.on('data', (data: any) => {
      term.write(data.toString('utf-8'));
    });

    // SSH shell stderr → terminal
    stream.stderr.on('data', (data: any) => {
      term.write(data.toString('utf-8'));
    });

    // Shell closed — clean up and return control to bash
    const teardown = () => {
      setSshStream(null);
      try { conn.end(); } catch {}
    };

    stream.on('close', () => {
      writeTerm('\r\nssh: disconnected\r\n');
      teardown();
    });

    conn.on('close', teardown);
    sock.on('close', teardown);
  });

  conn.on('close', () => {
    setSshStream(null);
  });

  return { stdout: '', stderr: '', exitCode: 0 };
});
