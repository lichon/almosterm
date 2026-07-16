import { getVfs } from '../../fs/configure';
import type { CommandHandler } from '../types';
import { executeAndCapture } from '../execute-helper';

export const nodeHandler: CommandHandler = async (args, cwd) => {
  try {
    // node --version / node -v
    if (args.includes('--version') || args.includes('-v')) {
      return { stdout: 'almostnode v0.0.0\n', stderr: '', exitCode: 0 };
    }

    // node -e "<code>"
    const eIndex = args.indexOf('-e');
    if (eIndex !== -1 && eIndex + 1 < args.length) {
      const code = args[eIndex + 1];
      const vfs = getVfs();
      return executeAndCapture(code, vfs, cwd);
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

      return executeAndCapture(scriptContent, vfs, scriptDir);
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
