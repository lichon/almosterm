import { getVfs } from '../../fs/configure';
import type { CommandHandler } from '../types';

export const catHandler: CommandHandler = async (args, cwd) => {
  try {
    if (args.length === 0) return { stdout: '', stderr: 'cat: missing file operand\n', exitCode: 1 };
    const vfs = getVfs();

    const results: string[] = [];
    for (const arg of args) {
      if (arg.startsWith('-')) continue;
      const fp = arg.startsWith('/') ? arg : (cwd === '/' ? `/${arg}` : `${cwd}/${arg}`);
      if (!vfs.existsSync(fp)) return { stdout: '', stderr: `cat: ${arg}: No such file or directory\n`, exitCode: 1 };
      if (vfs.statSync(fp).isDirectory()) return { stdout: '', stderr: `cat: ${arg}: Is a directory\n`, exitCode: 1 };
      results.push(vfs.readFileSync(fp, 'utf-8'));
    }

    const out = (results.join('') || '') + '\n';
    return { stdout: out, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `cat: ${err.message}\n`, exitCode: 1 };
  }
};
