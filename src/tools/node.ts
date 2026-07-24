import { defineCommand } from 'just-bash';
import { getContainer } from '../fs/configure';
import { writeTerm } from '../utils';

/**
 * node — run JavaScript files via the almostnode container.
 *
 * Output is streamed in real-time to the terminal.
 *
 * Usage:
 *   node <file>    execute a .js file from the VFS
 */
export const node = defineCommand('node', async (args, ctx) => {
  const container = getContainer();
  // Track streamed output so we don't double-write the final result
  let streamedStdout = '';
  let streamedStderr = '';

  try {
    const result = await container.run(`node ${args.join(' ')}`, {
      cwd: ctx.cwd,
      onStdout: (data: string) => {
        streamedStdout += data;
        writeTerm(data);
      },
      onStderr: (data: string) => {
        streamedStderr += data;
        writeTerm(data, 'stderr');
      },
    });

    // Only return output that wasn't already streamed to the terminal
    return {
      stdout: result.stdout.slice(streamedStdout.length),
      stderr: result.stderr.slice(streamedStderr.length),
      exitCode: result.exitCode,
    };
  } catch (err: any) {
    return { stdout: '', stderr: `${err.message}\n`, exitCode: 1 };
  }
});
