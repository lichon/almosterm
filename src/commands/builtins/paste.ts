import { getVfs, persistVfs } from '../../fs/configure';
import type { CommandHandler } from '../types';

export const pasteHandler: CommandHandler = async (args, cwd) => {
  try {
    // Try to read text from clipboard
    let content: string;

    try {
      content = await navigator.clipboard.readText();
    } catch {
      return { stdout: '', stderr: 'paste: clipboard access denied or empty\n', exitCode: 1 };
    }

    if (!content) {
      return { stdout: '', stderr: 'paste: clipboard is empty\n', exitCode: 1 };
    }

    // Determine target filename
    let filename: string;
    if (args.length > 0) {
      filename = args[0];
      // If the name doesn't have an extension and looks like a path segment, use as-is
    } else {
      // Generate a default name with timestamp
      const now = new Date();
      const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      filename = `pasted-${ts}.txt`;
    }

    const targetPath = cwd === '/' ? `/${filename}` : `${cwd}/${filename}`;
    const vfs = getVfs();

    // Check if file exists — append number to avoid overwriting
    let finalPath = targetPath;
    if (vfs.existsSync(targetPath)) {
      const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
      const base = filename.includes('.') ? filename.slice(0, filename.lastIndexOf('.')) : filename;
      let counter = 1;
      while (vfs.existsSync(finalPath)) {
        finalPath = cwd === '/' ? `/${base}-${counter}${ext}` : `${cwd}/${base}-${counter}${ext}`;
        counter++;
      }
    }

    vfs.writeFileSync(finalPath, content);
    persistVfs(vfs);

    const lines = content.split('\n').length;
    const size = content.length;
    const sizeFmt = size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
    const displayPath = finalPath.startsWith(cwd) && cwd !== '/' ? `./${finalPath.slice(cwd.length + 1)}` : finalPath;
    return { stdout: `Pasted ${sizeFmt}, ${lines} line(s) → ${displayPath}\n`, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `paste: ${err.message}\n`, exitCode: 1 };
  }
};
