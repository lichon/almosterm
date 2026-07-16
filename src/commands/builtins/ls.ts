import { getVfs } from '../../fs/configure';
import type { CommandHandler } from '../types';
import { expandGlob } from '../glob';

export const lsHandler: CommandHandler = async (args, cwd) => {
  try {
    const vfs = getVfs();
    const showHidden = args.includes('-a');
    const targetArg = args.filter(a => !a.startsWith('-')).join('') || '.';
    // Expand glob, pick first result for listing
    const expanded = expandGlob(vfs, targetArg, cwd);
    const targetDir = expanded[0].startsWith('/') ? expanded[0] : (cwd === '/' ? `/${expanded[0]}` : `${cwd}/${expanded[0]}`);

    // If glob expanded to multiple, show each
    if (expanded.length > 1) {
      const results: string[] = [];
      for (const entry of expanded) {
        const ep = entry.startsWith('/') ? entry : (cwd === '/' ? `/${entry}` : `${cwd}/${entry}`);
        if (!vfs.existsSync(ep)) continue;
        try {
          if (vfs.statSync(ep).isDirectory()) results.push(`\x1b[34m${entry}/\x1b[0m`);
          else results.push(entry);
        } catch { results.push(entry); }
      }
      return { stdout: results.join('  ') + '\n', stderr: '', exitCode: 0 };
    }

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
