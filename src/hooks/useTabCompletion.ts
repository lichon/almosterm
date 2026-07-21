import type { IFileSystem } from 'just-bash';
import { useToolStore } from '../store/toolStore';

/** Built-in commands provided by just-bash's bash runtime */
const BUILTIN_COMMANDS = [
  'ls', 'cd', 'pwd', 'cat', 'mkdir', 'touch', 'echo',
  'rm', 'cp', 'mv', 'node', 'clear', 'help', 'test',
  'cmdv', 'node', 'npm', 'reload', 'curl', 'ssh',
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
 *
 * @param input       The full input buffer text
 * @param cwd         Current working directory
 * @param fs          Virtual filesystem instance
 * @param cursorIndex Optional grapheme-cluster cursor position. If provided,
 *                    completes the word at the cursor rather than the last word.
 */
export async function getTabCompletions(
  input: string,
  cwd: string,
  fs: IFileSystem,
  cursorIndex?: number,
): Promise<{ matches: string[]; commonPrefix: string }> {
  if (!input) return { matches: [], commonPrefix: '' };

  // Determine which word to complete based on cursor position
  // Find word boundaries around the cursor (or end of input if no cursor)
  const targetPos = cursorIndex !== undefined ? cursorIndex : input.length;

  // Find the word start: scan left from targetPos to whitespace or start
  let wordStart = targetPos;
  while (wordStart > 0 && input[wordStart - 1] !== ' ' && input[wordStart - 1] !== '\t') {
    wordStart--;
  }

  // Find the word end: scan right from targetPos to whitespace or end
  let wordEnd = targetPos;
  while (wordEnd < input.length && input[wordEnd] !== ' ' && input[wordEnd] !== '\t') {
    wordEnd++;
  }

  const partialWord = input.slice(wordStart, wordEnd);
  const textBeforeCursor = input.slice(0, wordStart);

  // Determine if we're completing a command (first word, no path separators)
  const isFirstWord = wordStart === 0 || (textBeforeCursor.trim() === '');
  const isCompletingCommand = isFirstWord && !partialWord.includes('/') && !partialWord.startsWith('./') && !partialWord.startsWith('../');

  // --- Command completion ---
  if (isCompletingCommand) {
    const prefix = partialWord;
    const commands = getAvailableCommands();
    const matches = commands.filter(c => c.startsWith(prefix)).sort();
    if (!matches.length) return { matches: [], commonPrefix: '' };
    const commonPrefix = computeCommonPrefix(matches);
    return { matches, commonPrefix };
  }

  // --- Path completion ---
  let searchDir: string;
  let prefix: string;

  if (partialWord.includes('/')) {
    const lastSlash = partialWord.lastIndexOf('/');
    const dirPart = partialWord.substring(0, lastSlash + 1);
    const filePart = partialWord.substring(lastSlash + 1);
    searchDir = dirPart.startsWith('/') ? dirPart : (cwd === '/' ? `/${dirPart}` : `${cwd}/${dirPart}`);
    searchDir = searchDir.replace(/\/+$/, '') || '/';
    prefix = filePart;
  } else {
    searchDir = cwd;
    prefix = partialWord;
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
