import { defineCommand } from 'just-bash';
import { getContainer } from '../fs/configure';
import { writeTerm } from '../utils';

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
