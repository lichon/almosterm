import { defineCommand } from 'just-bash';
import { Runtime, VirtualFS } from 'almostnode';
import { getContainer } from '../fs/configure';
import { writeTerm } from '../utils';

/**
 * node — run JavaScript files or evaluate inline code via the almostnode runtime.
 *
 * Output is streamed in real-time to the terminal.
 *
 * Usage:
 *   node <file>          execute a .js file from the VFS
 *   node -e <code>        evaluate inline JavaScript code
 *   node --eval <code>    alias for -e
 */
export const node = defineCommand('node', async (args, ctx) => {
  const container = getContainer();
  const vfs = container.vfs;

  // ---- usage / no args ----
  if (args.length === 0) {
    return {
      stdout: '',
      stderr: 'Usage: node <script.js> [args...]\n       node -e <code>\n',
      exitCode: 1,
    };
  }

  // ---- -e / --eval : inline code evaluation ----
  if (args[0] === '-e' || args[0] === '--eval') {
    const code = args.slice(1).join(' ');
    if (!code.trim()) {
      return { stdout: '', stderr: 'node -e: missing code argument\n', exitCode: 1 };
    }
    return runNodeCode(vfs, code, ctx.cwd, ['node', '-e', code]);
  }

  // ---- <file> : execute a .js file from the VFS ----
  const scriptPath = args[0];
  const resolvedPath = scriptPath.startsWith('/')
    ? scriptPath
    : `${ctx.cwd.replace(/\/$/, '')}/${scriptPath}`.replace(/\/+/g, '/');

  if (!vfs.existsSync(resolvedPath)) {
    return {
      stdout: '',
      stderr: `Error: Cannot find module '${resolvedPath}'\n`,
      exitCode: 1,
    };
  }

  return runNodeCode(
    vfs,
    '',
    ctx.cwd,
    ['node', resolvedPath, ...args.slice(1)],
    resolvedPath,
  );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Execute JavaScript code in a fresh Runtime so stdout/stderr are captured
 * per invocation (same strategy as almostnode's internal child-process runner).
 */
async function runNodeCode(
  vfs: VirtualFS,
  code: string,
  cwd: string,
  argv: string[],
  filename?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  let exitCalled = false;

  // Resolve promise that fulfills when process.exit() is called
  let exitResolve: ((code: number) => void) | null = null;
  const exitPromise = new Promise<number>((resolve) => {
    exitResolve = resolve;
  });

  const appendStdout = (data: string) => {
    writeTerm(data);
  };
  const appendStderr = (data: string) => {
    writeTerm(data, 'stderr');
  };

  const runtime = new Runtime(vfs, {
    cwd,
    onConsole: (method: string, consoleArgs: unknown[]) => {
      const msg = consoleArgs.map((a) => String(a)).join(' ') + '\n';
      if (method === 'error' || method === 'warn') {
        appendStderr(msg);
      } else {
        appendStdout(msg);
      }
    },
    onStdout: (data: string) => appendStdout(data),
    onStderr: (data: string) => appendStderr(data),
  });

  // Wrap process.exit() so it breaks out of sync execution and resolves
  const proc = runtime.getProcess();
  proc.exit = (code = 0) => {
    if (!exitCalled) {
      exitCalled = true;
      exitCode = code;
      proc.emit('exit', code);
      exitResolve!(code);
    }
    throw new Error(`Process exited with code ${code}`);
  };
  proc.argv = argv;

  try {
    if (filename) {
      runtime.runFile(filename);
    } else {
      // Use a rooted path so __dirname resolves to '/' and require() works
      runtime.execute(code, '/eval.js');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Process exited with code')) {
      return { stdout, stderr, exitCode };
    }
    const errorMsg =
      error instanceof Error
        ? `${error.message}\n${error.stack || ''}`
        : String(error);
    return { stdout, stderr: stderr + `${errorMsg}\n`, exitCode: 1 };
  }

  // Drain microtasks so async console output is captured
  if (stdout.length > 0 || stderr.length > 0) {
    await new Promise((r) => setTimeout(r, 0));
  }

  return { stdout, stderr, exitCode };
}
