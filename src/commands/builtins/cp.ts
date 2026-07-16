import { getVfs } from '../../fs/configure';
import type { CommandHandler } from '../types';
import { expandGlob } from '../glob';

export const cpHandler: CommandHandler = async (args, cwd) => {
  const vfs = getVfs();
  const rawTargets = args.filter(a => !a.startsWith('-'));
  if (rawTargets.length < 2) return { stdout: '', stderr: 'cp: missing file operand\n', exitCode: 1 };
  const dest = rawTargets.pop()!;
  // Expand globs in sources (not destination)
  const targets: string[] = [];
  for (const t of rawTargets) {
    targets.push(...expandGlob(vfs, t, cwd));
  }
  const destPath = dest.startsWith('/') ? dest : (cwd === '/' ? `/${dest}` : `${cwd}/${dest}`);
  const recursive = args.includes('-r');

  for (const src of targets) {
    const sp = src.startsWith('/') ? src : (cwd === '/' ? `/${src}` : `${cwd}/${src}`);
    if (!vfs.existsSync(sp)) return { stdout: '', stderr: `cp: cannot stat '${src}': No such file or directory\n`, exitCode: 1 };
    if (vfs.statSync(sp).isDirectory() && !recursive) return { stdout: '', stderr: `cp: -r not specified; omitting directory '${src}'\n`, exitCode: 1 };
    copyNode(vfs, sp, destPath);
  }
  return { stdout: '', stderr: '', exitCode: 0 };
};

function copyNode(vfs: ReturnType<typeof getVfs>, src: string, dest: string): void {
  if (vfs.statSync(src).isDirectory()) {
    const name = src.split('/').pop()!;
    const nd = `${dest}/${name}`;
    if (!vfs.existsSync(nd)) vfs.mkdirSync(nd, { recursive: true });
    for (const e of vfs.readdirSync(src)) copyNode(vfs, `${src}/${e}`, nd);
  } else {
    const name = src.split('/').pop()!;
    const df = vfs.existsSync(dest) && vfs.statSync(dest).isDirectory() ? `${dest}/${name}` : dest;
    vfs.writeFileSync(df, vfs.readFileSync(src, 'utf-8'));
  }
}
