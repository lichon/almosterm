import { getVfs } from '../../fs/configure';
import type { CommandHandler } from '../types';

export const mvHandler: CommandHandler = async (args, cwd) => {
  const vfs = getVfs();
  const targets = args.filter(a => !a.startsWith('-'));
  if (targets.length < 2) return { stdout: '', stderr: 'mv: missing file operand\n', exitCode: 1 };
  const dest = targets.pop()!;
  let destPath = dest.startsWith('/') ? dest : (cwd === '/' ? `/${dest}` : `${cwd}/${dest}`);

  for (const src of targets) {
    const sp = src.startsWith('/') ? src : (cwd === '/' ? `/${src}` : `${cwd}/${src}`);
    if (!vfs.existsSync(sp)) return { stdout: '', stderr: `mv: cannot stat '${src}': No such file or directory\n`, exitCode: 1 };
    if (vfs.existsSync(destPath) && vfs.statSync(destPath).isDirectory()) destPath = `${destPath}/${sp.split('/').pop()!}`;
    vfs.renameSync(sp, destPath);
  }
  return { stdout: '', stderr: '', exitCode: 0 };
};
