import { getVfs } from '../fs/configure';

export function getTabCompletions(input: string, cwd: string): { matches: string[]; commonPrefix: string } {
  if (!input) return { matches: [], commonPrefix: '' };
  const vfs = getVfs();
  const words = input.split(/\s+/);
  const lastWord = words[words.length - 1] || '';

  let searchDir: string;
  let prefix: string;

  if (lastWord.includes('/')) {
    const lastSlash = lastWord.lastIndexOf('/');
    const dirPart = lastWord.substring(0, lastSlash + 1);
    const filePart = lastWord.substring(lastSlash + 1);
    searchDir = dirPart.startsWith('/') ? dirPart : (cwd === '/' ? `/${dirPart}` : `${cwd}/${dirPart}`);
    searchDir = searchDir.replace(/\/+$/, '') || '/';
    prefix = filePart;
  } else {
    searchDir = cwd;
    prefix = lastWord;
  }

  try {
    if (!vfs.existsSync(searchDir) || !vfs.statSync(searchDir).isDirectory()) return { matches: [], commonPrefix: '' };
    const entries = vfs.readdirSync(searchDir);
    const matches = entries
      .filter(e => e.startsWith(prefix) && !e.startsWith('.'))
      .map(e => {
        const ep = searchDir === '/' ? `/${e}` : `${searchDir}/${e}`;
        try { return vfs.statSync(ep).isDirectory() ? e + '/' : e; } catch { return e; }
      })
      .sort();

    if (!matches.length) return { matches: [], commonPrefix: '' };
    let commonPrefix = matches[0];
    for (let i = 1; i < matches.length; i++) {
      let j = 0;
      while (j < commonPrefix.length && j < matches[i].length && commonPrefix[j] === matches[i][j]) j++;
      commonPrefix = commonPrefix.substring(0, j);
    }
    return { matches, commonPrefix };
  } catch {
    return { matches: [], commonPrefix: '' };
  }
}
