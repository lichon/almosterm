import { getVfs } from '../../fs/configure';
import type { CommandHandler } from '../types';

// Lazy-load almostnode execute
let _execute: any = null;
async function getExecute() {
  if (!_execute) {
    const mod = await import('almostnode');
    _execute = mod.execute;
  }
  return _execute;
}

export const nodeHandler: CommandHandler = async (args, cwd) => {
  try {
    // node --version / node -v
    if (args.includes('--version') || args.includes('-v')) {
      return { stdout: 'almostnode v1.0.0\n', stderr: '', exitCode: 0 };
    }

    // node -e "<code>"
    const eIndex = args.indexOf('-e');
    if (eIndex !== -1 && eIndex + 1 < args.length) {
      const code = args[eIndex + 1];
      try {
        const execute = await getExecute();
        const result = await execute(code, { cwd });
        return { stdout: result.stdout || '', stderr: result.stderr || '', exitCode: result.exitCode ?? 0 };
      } catch (err: any) {
        return { stdout: '', stderr: `node: ${err.message}\n`, exitCode: 1 };
      }
    }

    // node <script> - read from VFS and execute
    if (args.length > 0 && !args[0].startsWith('-')) {
      const vfs = getVfs();
      const scriptArg = args[0];
      const scriptPath = scriptArg.startsWith('/') ? scriptArg : (cwd === '/' ? `/${scriptArg}` : `${cwd}/${scriptArg}`);

      if (!vfs.existsSync(scriptPath)) {
        return { stdout: '', stderr: `node: cannot find module '${scriptArg}'\n`, exitCode: 1 };
      }

      const scriptContent = vfs.readFileSync(scriptPath, 'utf-8');
      const scriptDir = scriptPath.substring(0, scriptPath.lastIndexOf('/')) || '/';

      try {
        const execute = await getExecute();
        const result = await execute(scriptContent, { cwd: scriptDir });
        return { stdout: result.stdout || '', stderr: result.stderr || '', exitCode: result.exitCode ?? 0 };
      } catch (err: any) {
        return { stdout: '', stderr: `node: ${err.message}\n`, exitCode: 1 };
      }
    }

    return {
      stdout: 'Usage: node [options] [script] [arguments]\n       node -e "<code>"\n\nOptions:\n  -e, --eval     Evaluate script\n  -v, --version  Print version\n',
      stderr: '',
      exitCode: 0,
    };
  } catch (err: any) {
    return { stdout: '', stderr: `node: ${err.message}\n`, exitCode: 1 };
  }
};
