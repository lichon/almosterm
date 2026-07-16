import { getVfs } from '../../fs/configure';
import type { CommandHandler } from '../types';
import { expandGlob } from '../glob';

export const rmHandler: CommandHandler = async (args, cwd) => {
  const vfs = getVfs();
  if (args.length === 0) return { stdout: '', stderr: 'rm: missing operand\n', exitCode: 1 };
  const recursive = args.includes('-r') || args.includes('-rf');
  const force = args.includes('-f') || args.includes('-rf');
  const rawTargets = args.filter(a => !a.startsWith('-'));

  // Expand glob patterns
  const targets: string[] = [];
  for (const t of rawTargets) {
    targets.push(...expandGlob(vfs, t, cwd));
  }

  if (targets.length === 0) {
    if (force) return { stdout: '', stderr: '', exitCode: 0 };
    return { stdout: '', stderr: 'rm: missing operand\n', exitCode: 1 };
  }

  for (const arg of targets) {
    const tp = arg.startsWith('/') ? arg : (cwd === '/' ? `/${arg}` : `${cwd}/${arg}`);
    if (!vfs.existsSync(tp)) { if (!force) return { stdout: '', stderr: `rm: cannot remove '${arg}': No such file or directory\n`, exitCode: 1 }; continue; }
    if (vfs.statSync(tp).isDirectory()) {
      if (!recursive) return { stdout: '', stderr: `rm: cannot remove '${arg}': Is a directory\n`, exitCode: 1 };
      if (tp === '/') return { stdout: '', stderr: 'rm: refusing to remove root directory\n', exitCode: 1 };
      deleteDir(vfs, tp);
    } else { vfs.unlinkSync(tp); }
  }
  return { stdout: '', stderr: '', exitCode: 0 };
};

function deleteDir(vfs: ReturnType<typeof getVfs>, dir: string): void {
  for (const e of vfs.readdirSync(dir)) {
    const ep = `${dir}/${e}`;
    vfs.statSync(ep).isDirectory() ? deleteDir(vfs, ep) : vfs.unlinkSync(ep);
  }
  vfs.rmdirSync(dir);
}
