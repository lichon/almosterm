import { defineCommand } from 'just-bash';

/**
 * reload — reload the web page.
 *
 * Usage:
 *   reload    performs location.reload()
 */
export const reload = defineCommand('reload', async (_args, _ctx) => {
  window.location.reload();
  return { stdout: '', stderr: '', exitCode: 0 };
});
