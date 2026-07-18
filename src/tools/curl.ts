import { defineCommand } from 'just-bash';
import { useVfsStore } from '../store/vfsStore';
import { writeTerm } from '../utils';

/**
 * curl — make HTTP requests through the Worker's /api/curl proxy.
 *
 * Usage:
 *   curl <url> [options]    fetch a URL (same-origin only via proxy)
 *
 * When the Worker proxy is available, requests route through /api/curl.
 * Otherwise falls back to direct fetch (subject to CORS).
 */
export const curl = defineCommand('curl', async (args, _ctx) => {
  if (args.length === 0) {
    return { stdout: '', stderr: 'curl: missing URL\nUsage: curl <url>\n', exitCode: 1 };
  }

  const targetUrl = args[0];
  const capabilities = useVfsStore.getState().capabilities;
  const hasCurlProxy = capabilities.includes('curl-proxy');

  let fetchUrl: string;
  if (hasCurlProxy) {
    fetchUrl = `/api/curl?url=${encodeURIComponent(targetUrl)}`;
  } else {
    fetchUrl = targetUrl;
  }

  try {
    const response = await fetch(fetchUrl);
    const body = await response.text();

    if (!response.ok) {
      writeTerm(`${body}\n`, 'stderr');
      return { stdout: '', stderr: '', exitCode: 1 };
    }

    writeTerm(body);
    return { stdout: '', stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `curl: ${err.message}\n`, exitCode: 1 };
  }
});
