import { defineCommand } from 'just-bash';
import { useVfsStore } from '../store/vfsStore';
import { writeTerm } from '../utils';

/**
 * ssh — connect to a remote host via the Worker's WebSocket SSH proxy.
 *
 * Usage:
 *   ssh <user@host> [-p <port>]
 *
 * Requires the Worker proxy to be running locally (wrangler dev).
 * On deployed instances (free-tier), SSH is unavailable.
 */
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
    return { stdout: '', stderr: 'ssh: missing host\nUsage: ssh <user@host> [-p <port>]\n', exitCode: 1 };
  }

  const target = args[0];
  let port = 22;

  // Parse -p flag
  const pIdx = args.indexOf('-p');
  if (pIdx !== -1 && args[pIdx + 1]) {
    port = parseInt(args[pIdx + 1], 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return { stdout: '', stderr: `ssh: invalid port: ${args[pIdx + 1]}\n`, exitCode: 1 };
    }
  }

  // Parse user@host
  const atIdx = target.lastIndexOf('@');
  const user = atIdx >= 0 ? target.slice(0, atIdx) : '';
  const host = atIdx >= 0 ? target.slice(atIdx + 1) : target;

  if (!host) {
    return { stdout: '', stderr: 'ssh: invalid host\n', exitCode: 1 };
  }

  writeTerm(`ssh: connecting to ${host}:${port}...\r\n`);

  const wsUrl = `${window.location.origin}/api/connect?host=${encodeURIComponent(host)}&port=${port}`;
  const protocol = wsUrl.replace(/^http/, 'ws');

  const ws = new WebSocket(protocol);

  // Await connection open, error, or premature close
  const outcome = await new Promise<'connected' | 'closed' | 'error'>((resolve) => {
    ws.onopen = () => resolve('connected');
    ws.onerror = () => resolve('error');
    ws.onclose = () => resolve('closed');
  });

  if (outcome === 'error' || outcome === 'closed') {
    return {
      stdout: '',
      stderr: `ssh: connection ${outcome === 'error' ? 'error' : 'refused'} — could not reach ${host}:${port}\n`,
      exitCode: 1,
    };
  }

  // Connected — wire up ongoing message handling
  writeTerm('ssh: connected\r\n');

  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      writeTerm(new TextDecoder().decode(event.data));
    } else if (typeof event.data === 'string') {
      writeTerm(event.data);
    }
  };

  ws.onerror = () => {
    writeTerm('ssh: connection error\r\n', 'stderr');
  };

  ws.onclose = () => {
    writeTerm('\r\nssh: disconnected\r\n');
  };

  return { stdout: '', stderr: '', exitCode: 0 };
});
