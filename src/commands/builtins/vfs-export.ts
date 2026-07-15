import { getVfs } from '../../fs/configure';
import { useVfsStore } from '../../store/vfsStore';
import type { CommandHandler } from '../types';

export const vfsExportHandler: CommandHandler = async (args, cwd) => {
  const vfs = getVfs();
  const exportPath = '/';
  if (!vfs.existsSync(exportPath)) return { stdout: '', stderr: 'vfs-export: filesystem not available\n', exitCode: 1 };

  const files: Record<string, any> = {};
  collectFiles(vfs, '/', files);
  const snapshot = { version: 1, exportedAt: new Date().toISOString(), files };
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().split('T')[0];
  const a = document.createElement('a');
  a.href = url; a.download = `almosterm-vfs-${dateStr}.vfs.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const fileCount = Object.values(files).filter((f: any) => f.type === 'file').length;
  const dirCount = Object.values(files).filter((f: any) => f.type === 'directory').length;
  return { stdout: `VFS exported to '${a.download}'\n  Files: ${fileCount}\n  Directories: ${dirCount}\n`, stderr: '', exitCode: 0 };
};

function collectFiles(vfs: ReturnType<typeof getVfs>, dir: string, result: Record<string, any>): void {
  if (!vfs.existsSync(dir)) return;
  try {
    for (const entry of vfs.readdirSync(dir)) {
      const fp = dir === '/' ? `/${entry}` : `${dir}/${entry}`;
      try {
        const stat = vfs.statSync(fp);
        if (stat.isDirectory()) { result[fp] = { type: 'directory' }; collectFiles(vfs, fp, result); }
        else { result[fp] = { type: 'file', content: vfs.readFileSync(fp, 'utf-8'), size: stat.size }; }
      } catch {}
    }
  } catch {}
}

export const vfsImportHandler: CommandHandler = async (_args, _cwd) => {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.vfs.json';
  const file = await new Promise<File | null>(resolve => { input.onchange = () => resolve(input.files?.[0] || null); input.click(); });
  if (!file) return { stdout: '', stderr: 'vfs-import: no file selected\n', exitCode: 1 };
  try {
    const content = await file.text();
    const snapshot = JSON.parse(content);
    if (!snapshot.files) return { stdout: '', stderr: 'vfs-import: invalid snapshot format\n', exitCode: 1 };
    const vfs = getVfs();
    let count = 0;
    for (const [path, entry] of Object.entries(snapshot.files) as [string, any][]) {
      if (entry.type === 'file') {
        const dir = path.substring(0, path.lastIndexOf('/'));
        if (dir && !vfs.existsSync(dir)) vfs.mkdirSync(dir, { recursive: true });
        vfs.writeFileSync(path, entry.content || '');
        count++;
      } else if (entry.type === 'directory') {
        if (!vfs.existsSync(path)) vfs.mkdirSync(path, { recursive: true });
      }
    }
    if (!vfs.existsSync(useVfsStore.getState().cwd)) useVfsStore.getState().setCwd('/home/user');
    return { stdout: `VFS imported: ${count} files restored.\n`, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `vfs-import: ${err.message}\n`, exitCode: 1 };
  }
};
