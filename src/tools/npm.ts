import { defineCommand } from 'just-bash';
import { getContainer } from '../fs/configure';

/** Normalize LF to CRLF for proper xterm rendering */
function normalizeEol(data: string): string {
  return data.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

function getTerminal() {
  return (window as any).__almosterm_terminal;
}

/** Write a chunk directly to the terminal (streaming output) */
function writeTerm(data: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
  const term = getTerminal();
  if (!term || !data) return;
  let text = normalizeEol(data);
  if (!text.endsWith('\r\n')) text += '\r\n';
  if (stream === 'stderr') term.write(`\x1b[31m${text}\x1b[0m`);
  else term.write(text);
}

/**
 * npm — run npm commands via the almostnode container.
 *
 * Output is streamed in real-time to the terminal.
 *
 * Usage:
 *   npm <args...>    run an npm command (install, init, etc.)
 */
export const npm = defineCommand('npm', async (args, ctx) => {
  const container = getContainer();

  let streamedStdout = '';
  let streamedStderr = '';

  try {
    const result = await container.run(`npm ${args.join(' ')}`, {
      cwd: ctx.cwd,
      onStdout: (data) => {
        streamedStdout += data;
        writeTerm(data);
      },
      onStderr: (data) => {
        streamedStderr += data;
        writeTerm(data, 'stderr');
      },
    });

    return {
      stdout: result.stdout.slice(streamedStdout.length),
      stderr: result.stderr.slice(streamedStderr.length),
      exitCode: result.exitCode,
    };
  } catch (err: any) {
    return { stdout: '', stderr: `${err.message}\n`, exitCode: 1 };
  }
});
