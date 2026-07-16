import type { IFileSystem } from 'just-bash';
import { useToolStore } from '../store/toolStore';

/** Built-in commands provided by just-bash's bash runtime */
const BUILTIN_COMMANDS = [
  'ls', 'cd', 'pwd', 'cat', 'mkdir', 'touch', 'echo',
  'rm', 'cp', 'mv', 'node', 'clear', 'help', 'test',
  'tool-register', 'tool-unregister', 'tool-list',
  'vfs-export', 'vfs-import',
];

/** Get all available command names (builtins + custom tools) */
export function getAvailableCommands(): string[] {
  const customTools = Object.keys(useToolStore.getState().tools);
  return [...BUILTIN_COMMANDS, ...customTools].sort();
}

/** Compute the longest common prefix among an array of strings */
export function computeCommonPrefix(strings: string[]): string {
  if (!strings.length) return '';
  let common = strings[0];
  for (let i = 1; i < strings.length; i++) {
    let j = 0;
    while (j < common.length && j < strings[i].length && common[j] === strings[i][j]) j++;
    common = common.substring(0, j);
  }
  return common;
}

/**
 * Get tab completions for the current input line.
 *
 * If the cursor is on the first word, it completes command names.
 * Otherwise, it completes file/directory paths from the VFS.
 */
export async function getTabCompletions(
  input: string,
  cwd: string,
  fs: IFileSystem,
): Promise<{ matches: string[]; commonPrefix: string }> {
  if (!input) return { matches: [], commonPrefix: '' };
  const words = input.split(/\s+/);

  // Determine if we're completing a command (first word or after pipe/separator)
  const isFirstWord = words.length === 1 || (words.length === 2 && input.endsWith(' '));
  const isCompletingCommand = isFirstWord && !input.includes('/') && !input.startsWith('./') && !input.startsWith('../');

  // --- Command completion ---
  if (isCompletingCommand) {
    const prefix = words[0] || '';
    const commands = getAvailableCommands();
    const matches = commands.filter(c => c.startsWith(prefix)).sort();
    if (!matches.length) return { matches: [], commonPrefix: '' };
    const commonPrefix = computeCommonPrefix(matches);
    return { matches, commonPrefix };
  }

  // --- Path completion ---
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
    if (!(await fs.exists(searchDir))) return { matches: [], commonPrefix: '' };
    const stat = await fs.stat(searchDir);
    if (!stat.isDirectory) return { matches: [], commonPrefix: '' };

    const entries = await fs.readdir(searchDir);
    const showHidden = prefix.startsWith('.');
    const matches: string[] = [];

    for (const e of entries.sort()) {
      if (!e.startsWith(prefix)) continue;
      if (!showHidden && e.startsWith('.')) continue;
      const ep = searchDir === '/' ? `/${e}` : `${searchDir}/${e}`;
      try {
        const s = await fs.stat(ep);
        matches.push(s.isDirectory ? e + '/' : e);
      } catch {
        matches.push(e);
      }
    }

    if (!matches.length) return { matches: [], commonPrefix: '' };
    const commonPrefix = computeCommonPrefix(matches);
    return { matches, commonPrefix };
  } catch {
    return { matches: [], commonPrefix: '' };
  }
}
