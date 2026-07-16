import { getVfs } from '../../fs/configure';
import { useVfsStore } from '../../store/vfsStore';
import type { CommandHandler } from '../types';

/** Resolve . and .. segments in a path */
function normalizePath(input: string): string {
  const segments = input.replace(/\/+/g, '/').replace(/\/$/, '').split('/').filter(Boolean);
  const resolved: string[] = [];
  for (const seg of segments) {
    if (seg === '..') {
      resolved.pop();
    } else if (seg !== '.') {
      resolved.push(seg);
    }
  }
  return '/' + resolved.join('/');
}

export const cdHandler: CommandHandler = async (args, cwd) => {
  try {
    const vfs = getVfs();
    let target: string;

    if (args.length === 0) {
      target = '/home/user';
    } else if (args[0] === '/') {
      target = '/';
    } else {
      const raw = args[0].startsWith('/') ? args[0] : `${cwd}/${args[0]}`;
      target = normalizePath(raw);
    }

    if (!vfs.existsSync(target)) {
      return { stdout: '', stderr: `cd: ${args[0] || ''}: No such file or directory\n`, exitCode: 1 };
    }
    if (!vfs.statSync(target).isDirectory()) {
      return { stdout: '', stderr: `cd: ${args[0]}: Not a directory\n`, exitCode: 1 };
    }

    useVfsStore.getState().setCwd(target);
    return { stdout: '', stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `cd: ${err.message}\n`, exitCode: 1 };
  }
};
