import { getVfs } from '../../fs/configure';
import type { CommandHandler } from '../types';

export const lsHandler: CommandHandler = async (args, cwd) => {
  try {
    const vfs = getVfs();
    const showHidden = args.includes('-a');
    const targetArg = args.filter(a => !a.startsWith('-')).join('') || '.';
    const targetDir = targetArg.startsWith('/') ? targetArg : (cwd === '/' ? `/${targetArg}` : `${cwd}/${targetArg}`);

    if (!vfs.existsSync(targetDir)) {
      return { stdout: '', stderr: `ls: cannot access '${targetArg}': No such file or directory\n`, exitCode: 2 };
    }

    const stat = vfs.statSync(targetDir);
    if (stat.isFile()) {
      const name = targetDir.split('/').pop() || targetDir;
      return { stdout: name + '\n', stderr: '', exitCode: 0 };
    }

    let entries = vfs.readdirSync(targetDir);
    if (!showHidden) entries = entries.filter(e => !e.startsWith('.'));

    entries.sort();
    const formatted = entries.map(e => {
      const ep = targetDir === '/' ? `/${e}` : `${targetDir}/${e}`;
      try {
        if (vfs.statSync(ep).isDirectory()) return `\x1b[34m${e}/\x1b[0m`;
      } catch {}
      return e;
    });

    return { stdout: formatted.join('  ') + '\n', stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `ls: ${err.message}\n`, exitCode: 1 };
  }
};
