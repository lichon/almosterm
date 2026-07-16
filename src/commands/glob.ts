import type { VirtualFS } from 'almostnode';

/**
 * Expand a glob pattern against VFS entries in a directory.
 * Supports: *, *.ext, prefix*, *suffix, *mid*
 * Returns the original pattern unchanged if it contains no glob or dir doesn't exist.
 */
export function expandGlob(vfs: VirtualFS, pattern: string, cwd: string): string[] {
  if (!pattern.includes('*')) return [pattern];

  // Determine base dir and the glob part
  const lastSlash = pattern.lastIndexOf('/');
  const dir = lastSlash >= 0
    ? (pattern.startsWith('/') ? pattern.slice(0, lastSlash) || '/' : `${cwd}/${pattern.slice(0, lastSlash)}`)
    : cwd;
  const glob = lastSlash >= 0 ? pattern.slice(lastSlash + 1) : pattern;
  const prefix = lastSlash >= 0 ? pattern.slice(0, lastSlash + 1) : '';

  if (!vfs.existsSync(dir)) return [pattern];

  try {
    const entries = vfs.readdirSync(dir);
    const results: string[] = [];

    for (const entry of entries) {
      let matches = false;
      if (glob === '*') {
        matches = true;
      } else if (glob.startsWith('*') && glob.endsWith('*')) {
        matches = entry.includes(glob.slice(1, -1));
      } else if (glob.startsWith('*')) {
        matches = entry.endsWith(glob.slice(1));
      } else if (glob.endsWith('*')) {
        matches = entry.startsWith(glob.slice(0, -1));
      }
      if (matches) {
        results.push(prefix ? `${prefix}${entry}` : entry);
      }
    }
    return results.length > 0 ? results : [pattern];
  } catch {
    return [pattern];
  }
}
