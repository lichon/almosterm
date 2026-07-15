import { getVfs } from '../../fs/configure';
import type { CommandHandler } from '../types';

export const mkdirHandler: CommandHandler = async (args, cwd) => {
  try {
    if (args.length === 0) return { stdout: '', stderr: 'mkdir: missing operand\n', exitCode: 1 };
    const vfs = getVfs();
    const createParents = args.includes('-p');
    const dirArgs = args.filter(a => !a.startsWith('-'));

    for (const arg of dirArgs) {
      const tp = arg.startsWith('/') ? arg : (cwd === '/' ? `/${arg}` : `${cwd}/${arg}`);
      if (vfs.existsSync(tp)) return { stdout: '', stderr: `mkdir: cannot create directory '${arg}': File exists\n`, exitCode: 1 };
      vfs.mkdirSync(tp, { recursive: createParents });
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `mkdir: ${err.message}\n`, exitCode: 1 };
  }
};

export const touchHandler: CommandHandler = async (args, cwd) => {
  try {
    if (args.length === 0) return { stdout: '', stderr: 'touch: missing file operand\n', exitCode: 1 };
    const vfs = getVfs();
    for (const arg of args) {
      if (arg.startsWith('-')) continue;
      const tp = arg.startsWith('/') ? arg : (cwd === '/' ? `/${arg}` : `${cwd}/${arg}`);
      if (!vfs.existsSync(tp)) {
        vfs.writeFileSync(tp, '');
      } else {
        try {
          const content = vfs.readFileSync(tp, 'utf-8');
          vfs.writeFileSync(tp, content);
        } catch {
          vfs.writeFileSync(tp, '');
        }
      }
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `touch: ${err.message}\n`, exitCode: 1 };
  }
};
