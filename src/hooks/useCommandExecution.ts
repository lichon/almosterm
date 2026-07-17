import { useCallback } from 'react';
import { useVfsStore } from '../store/vfsStore';
import { useSessionStore } from '../store/sessionStore';
import { useJustBash } from './useJustBash';
import { persistVfs, getVfs } from '../fs/configure';
import { getTabCompletions } from './useTabCompletion';
import { getTerminal, writeTerm } from '../utils';

function writePrompt(cmd: string | null = '', reset: boolean = false): void {
  const cwd = useVfsStore.getState().cwd;
  const term = getTerminal();
  if (!term) return;
  if (reset) term.write(`\r\x1b[K`);
  term.write(`\x1b[34m${cwd}\x1b[0m$ ${cmd}`);
}

export function useCommandExecution() {
  const { bash, exec } = useJustBash();
  const { addToHistory, navigateHistory, resetHistoryNavigation } = useSessionStore();

  const handleInput = useCallback(async (command: string) => {
    addToHistory(command);
    resetHistoryNavigation();

    const trimmed = command.trim();
    if (!trimmed.length) {
      writePrompt();
      return;
    }

    // Listen for VFS mutations from any source (adapter, container, node, etc.)
    let vfsChanged = false;
    const onVfsChange = () => { vfsChanged = true; };
    const vfs = getVfs();
    vfs.on('change', onVfsChange);
    vfs.on('delete', onVfsChange);

    try {
      const currentCwd = useVfsStore.getState().cwd;
      const result = await exec(trimmed, { cwd: currentCwd });

      // Write stdout/stderr
      if (result.stdout) writeTerm(result.stdout);
      if (result.stderr) writeTerm(result.stderr, 'stderr');

      // Sync CWD and persist VFS only when mutated
      useVfsStore.getState().setCwd(bash.getCwd());
      if (vfsChanged) {
        setTimeout(() => persistVfs(vfs));
      }
    } catch (err: any) {
      writeTerm(`Error: ${err.message}\n`, 'stderr');
    } finally {
      vfs.off('change', onVfsChange);
      vfs.off('delete', onVfsChange);
    }

    writePrompt();
  }, [bash, exec, addToHistory, resetHistoryNavigation]);

  const handleSignal = useCallback((signal: string) => {
    const term = getTerminal();
    if (!term) return;
    if (signal === 'ARROW_UP') {
      const cmd = navigateHistory('up');
      if (cmd !== null) term.setInput(cmd);
      writePrompt(cmd, true);
    } else if (signal === 'ARROW_DOWN') {
      const cmd = navigateHistory('down');
      if (cmd !== null) term.setInput(cmd);
      else term.setInput('');
      writePrompt(cmd, true);
    } else if (signal === 'TAB') {
      const input = term.getInput();
      if (!input) return;
      const cwd = useVfsStore.getState().cwd;

      getTabCompletions(input, cwd, bash.fs).then(({ matches, commonPrefix }) => {
        if (matches.length === 0) {
          // No completions — do nothing
          return;
        }

        if (matches.length === 1) {
          // Single match — complete the word
          const words = input.split(/\s+/);
          const lastWord = words[words.length - 1] || '';

          let completed: string;
          if (lastWord.includes('/')) {
            const lastSlash = lastWord.lastIndexOf('/');
            completed = lastWord.substring(0, lastSlash + 1) + matches[0];
          } else {
            completed = matches[0];
          }

          words[words.length - 1] = completed;
          const newInput = words.join(' ');
          term.setInput(newInput);

          // Redraw line
          writePrompt(newInput, true);
        } else if (commonPrefix.length > input.split(/\s+/).pop()!.length) {
          // Multiple matches with common prefix — complete as much as possible
          const words = input.split(/\s+/);
          const lastWord = words[words.length - 1] || '';

          let completed: string;
          if (lastWord.includes('/')) {
            const lastSlash = lastWord.lastIndexOf('/');
            completed = lastWord.substring(0, lastSlash + 1) + commonPrefix;
          } else {
            completed = commonPrefix;
          }

          words[words.length - 1] = completed;
          const newInput = words.join(' ');
          term.setInput(newInput);

          // Redraw line
          writePrompt(newInput, true);
        } else {
          // Multiple matches, no further common prefix — show options
          term.writeln('');
          // Display in columns
          const maxLen = Math.max(...matches.map(m => m.length));
          const cols = Math.max(1, Math.floor(80 / (maxLen + 2)));
          const rows: string[] = [];
          for (let i = 0; i < matches.length; i += cols) {
            rows.push(matches.slice(i, i + cols).map(m => m.padEnd(maxLen + 2)).join(''));
          }
          for (const row of rows) {
            term.writeln(`\x1b[90m${row}\x1b[0m`);
          }
          // Redraw prompt and input
          writePrompt(input, true);
        }
      });
    } else if (signal === 'SIGINT') {
      term.setInput('');
      writePrompt();
    }
  }, [navigateHistory, bash]);

  const initializePrompt = useCallback(() => {
    setTimeout(() => writePrompt(), 100);
  }, []);

  return { handleInput, handleSignal, initializePrompt, bash };
}
