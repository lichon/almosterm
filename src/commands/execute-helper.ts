import type { VirtualFS } from 'almostnode';

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute JS code via almostnode and capture stdout/stderr/exitCode.
 *
 * The raw almostnode `execute()` returns { exports, module }, not shell-style
 * output. This wrapper captures process.stdout.write, process.stderr.write,
 * and console.* calls via the RuntimeOptions callbacks, and catches
 * process.exit() to produce a CommandResult-compatible shape.
 */
export async function executeAndCapture(
  code: string,
  vfs: VirtualFS,
  cwd: string = '/'
): Promise<ExecuteResult> {
  const { Runtime } = await import('almostnode');

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const runtime = new Runtime(vfs, {
    cwd,
    onStdout: (data: string) => {
      stdoutChunks.push(data);
    },
    onStderr: (data: string) => {
      stderrChunks.push(data);
    },
    onConsole: (method: string, args: unknown[]) => {
      // Format console output like Node.js: space-separated args + newline
      const line = args.map(a => {
        if (typeof a === 'string') return a;
        if (a === null || a === undefined) return String(a);
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }).join(' ') + '\n';

      if (method === 'error' || method === 'warn') {
        stderrChunks.push(line);
      } else {
        stdoutChunks.push(line);
      }
    },
  });

  try {
    runtime.execute(code);
    return {
      stdout: stdoutChunks.join(''),
      stderr: stderrChunks.join(''),
      exitCode: 0,
    };
  } catch (err: any) {
    const msg = err.message || String(err);
    // Extract exit code from "Process exited with code N"
    const match = msg.match(/Process exited with code (\d+)/);
    const exitCode = match ? parseInt(match[1], 10) : 1;

    return {
      stdout: stdoutChunks.join(''),
      stderr: stderrChunks.join('') + (msg && !match ? `${msg}\n` : ''),
      exitCode,
    };
  }
}
