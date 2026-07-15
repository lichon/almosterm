import { getVfs } from '../../fs/configure';
import type { CommandHandler } from '../types';

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
        try { const c = vfs.readFileSync(tp, 'utf-8'); vfs.writeFileSync(tp, c); } catch { vfs.writeFileSync(tp, ''); }
      }
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `touch: ${err.message}\n`, exitCode: 1 };
  }
};

export const echoHandler: CommandHandler = async (args, _cwd) => {
  const text = args.join(' ');
  return { stdout: text + '\n', stderr: '', exitCode: 0 };
};

export const rmHandler: CommandHandler = async (args, cwd) => {
  try {
    if (args.length === 0) return { stdout: '', stderr: 'rm: missing operand\n', exitCode: 1 };
    const vfs = getVfs();
    const recursive = args.includes('-r') || args.includes('-rf');
    const force = args.includes('-f') || args.includes('-rf');
    const targets = args.filter(a => !a.startsWith('-'));

    for (const arg of targets) {
      const tp = arg.startsWith('/') ? arg : (cwd === '/' ? `/${arg}` : `${cwd}/${arg}`);
      if (!vfs.existsSync(tp)) { if (!force) return { stdout: '', stderr: `rm: cannot remove '${arg}': No such file or directory\n`, exitCode: 1 }; continue; }
      if (vfs.statSync(tp).isDirectory()) {
        if (!recursive) return { stdout: '', stderr: `rm: cannot remove '${arg}': Is a directory\n`, exitCode: 1 };
        if (tp === '/') return { stdout: '', stderr: 'rm: refusing to remove root directory\n', exitCode: 1 };
        deleteDir(vfs, tp);
      } else {
        vfs.unlinkSync(tp);
      }
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `rm: ${err.message}\n`, exitCode: 1 };
  }
};

function deleteDir(vfs: ReturnType<typeof getVfs>, dirPath: string): void {
  const entries = vfs.readdirSync(dirPath);
  for (const entry of entries) {
    const ep = `${dirPath}/${entry}`;
    if (vfs.statSync(ep).isDirectory()) {
      deleteDir(vfs, ep);
    } else {
      vfs.unlinkSync(ep);
    }
  }
  vfs.rmdirSync(dirPath);
}

export const cpHandler: CommandHandler = async (args, cwd) => {
  try {
    const vfs = getVfs();
    const targets = args.filter(a => !a.startsWith('-'));
    if (targets.length < 2) return { stdout: '', stderr: 'cp: missing file operand\n', exitCode: 1 };
    const dest = targets.pop()!;
    const destPath = dest.startsWith('/') ? dest : (cwd === '/' ? `/${dest}` : `${cwd}/${dest}`);
    const recursive = args.includes('-r');

    for (const src of targets) {
      const srcPath = src.startsWith('/') ? src : (cwd === '/' ? `/${src}` : `${cwd}/${src}`);
      if (!vfs.existsSync(srcPath)) return { stdout: '', stderr: `cp: cannot stat '${src}': No such file or directory\n`, exitCode: 1 };
      if (vfs.statSync(srcPath).isDirectory() && !recursive) return { stdout: '', stderr: `cp: -r not specified; omitting directory '${src}'\n`, exitCode: 1 };
      copyNode(vfs, srcPath, destPath);
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `cp: ${err.message}\n`, exitCode: 1 };
  }
};

function copyNode(vfs: ReturnType<typeof getVfs>, src: string, dest: string): void {
  if (vfs.statSync(src).isDirectory()) {
    const name = src.split('/').pop()!;
    const newDest = `${dest}/${name}`;
    if (!vfs.existsSync(newDest)) vfs.mkdirSync(newDest, { recursive: true });
    for (const e of vfs.readdirSync(src)) copyNode(vfs, `${src}/${e}`, newDest);
  } else {
    const name = src.split('/').pop()!;
    const destFile = vfs.existsSync(dest) && vfs.statSync(dest).isDirectory() ? `${dest}/${name}` : dest;
    vfs.writeFileSync(destFile, vfs.readFileSync(src, 'utf-8'));
  }
}

export const mvHandler: CommandHandler = async (args, cwd) => {
  try {
    const vfs = getVfs();
    const targets = args.filter(a => !a.startsWith('-'));
    if (targets.length < 2) return { stdout: '', stderr: 'mv: missing file operand\n', exitCode: 1 };
    const dest = targets.pop()!;
    let destPath = dest.startsWith('/') ? dest : (cwd === '/' ? `/${dest}` : `${cwd}/${dest}`);

    for (const src of targets) {
      const srcPath = src.startsWith('/') ? src : (cwd === '/' ? `/${src}` : `${cwd}/${src}`);
      if (!vfs.existsSync(srcPath)) return { stdout: '', stderr: `mv: cannot stat '${src}': No such file or directory\n`, exitCode: 1 };
      if (vfs.existsSync(destPath) && vfs.statSync(destPath).isDirectory()) destPath = `${destPath}/${src.split('/').pop()!}`;
      vfs.renameSync(srcPath, destPath);
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `mv: ${err.message}\n`, exitCode: 1 };
  }
};
