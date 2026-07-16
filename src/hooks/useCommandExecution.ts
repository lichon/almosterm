import { useCallback } from 'react';
import { useVfsStore } from '../store/vfsStore';
import { useSessionStore } from '../store/sessionStore';
import { getContainer, persistVfs } from '../fs/configure';
import { getTabCompletions } from './useTabCompletion';

function getTerminal() {
  return (window as any).__almosterm_terminal;
}

/** Normalize LF to CRLF so xterm renders properly without staircasing */
function normalizeEol(data: string): string {
  return data.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

function writeOutput(data: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
  const term = getTerminal();
  if (!term || !data) return;
  let text = normalizeEol(data);
  if (!text.endsWith('\r\n')) text += '\r\n';
  if (stream === 'stderr') term.write(`\x1b[31m${text}\x1b[0m`);
  else term.write(text);
}

/** Resolve a path string (from cd argument) against the current cwd */
function resolvePath(cwd: string, target: string): string {
  if (!target || target === '~') {
    return '/home/user';
  }

  let path = target;

  // Expand ~ to home
  if (path.startsWith('~/')) {
    path = '/home/user' + path.slice(1);
  }

  // Make absolute or join with cwd
  if (!path.startsWith('/')) {
    path = cwd.replace(/\/$/, '') + '/' + path;
  }

  // Resolve . and .. segments
  const segments = path.split('/').filter(Boolean);
  const resolved: string[] = [];
  for (const seg of segments) {
    if (seg === '.') continue;
    if (seg === '..') {
      resolved.pop();
    } else {
      resolved.push(seg);
    }
  }

  return '/' + resolved.join('/');
}

function writePrompt(cmd: string | null = '', reset: boolean = false): void {
  const cwd = useVfsStore.getState().cwd;
  const term = getTerminal();
  if (!term) return;
  if (reset) term.write(`\r\x1b[K`);
  term.write(`\x1b[34m${cwd}\x1b[0m$ ${cmd}`);
}

export function useCommandExecution() {
  const cwd = useVfsStore.getState().cwd;
  const { addToHistory, navigateHistory, resetHistoryNavigation } = useSessionStore();

  const handleInput = useCallback(async (command: string) => {
    addToHistory(command);
    resetHistoryNavigation();

    const trimmed = command.trim();
    if (!trimmed.length) {
      writePrompt();
      return;
    }

    const container = getContainer();
    let vfsChanged = false
    const vfsListener = () => {
      vfsChanged = true
    }
    container.vfs.on('change', vfsListener)
    container.vfs.on('delete', vfsListener)
    try {
      const currentCwd = useVfsStore.getState().cwd;

      // Buffer to deduplicate real-time output from final result
      let streamedStdout = '';
      let streamedStderr = '';

      const result = await container.run(trimmed, {
        cwd: currentCwd,
        onStdout: (data: string) => {
          streamedStdout += data;
          writeOutput(data);
        },
        onStderr: (data: string) => {
          streamedStderr += data;
          writeOutput(data, 'stderr');
        },
      });

      if (vfsChanged) {
        setTimeout(() => { persistVfs(container.vfs) })
      }

      // Track CWD changes after cd commands
      const isCd = /^cd\b/.test(trimmed);
      if (isCd && result.exitCode === 0) {
        const cdMatch = trimmed.match(/^cd\s+(.+)/);
        const target = cdMatch ? cdMatch[1].trim().replace(/^["']|["']$/g, '') : '';
        const newCwd = resolvePath(currentCwd, target);
        useVfsStore.getState().setCwd(newCwd);
      }

      // Only write remaining output not already streamed in real time
      const remainingStdout = result.stdout.slice(streamedStdout.length);
      const remainingStderr = result.stderr.slice(streamedStderr.length);
      if (remainingStdout) writeOutput(remainingStdout);
      if (remainingStderr) writeOutput(remainingStderr, 'stderr');
    } catch (err: any) {
      writeOutput(`Error: ${err.message}\n`, 'stderr');
    } finally {
      container.vfs.off('change', vfsListener)
      container.vfs.off('delete', vfsListener)
    }

    writePrompt();
  }, [cwd, addToHistory, resetHistoryNavigation]);

  const handleSignal = useCallback((signal: string) => {
    const term = getTerminal();
    if (!term) return;
    if (signal === 'ARROW_UP') {
      const cmd = navigateHistory('up');
      if (cmd !== null) term.setInput(cmd);
      writePrompt(cmd, true)
    } else if (signal === 'ARROW_DOWN') {
      const cmd = navigateHistory('down');
      if (cmd !== null) term.setInput(cmd);
      else term.setInput('');
      writePrompt(cmd, true)
    } else if (signal === 'TAB') {
      const input = term.getInput();
      if (!input) return;
      const { matches, commonPrefix } = getTabCompletions(input, cwd);

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
        writePrompt(newInput, true)
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
        writePrompt(newInput, true)
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
        writePrompt(input, true)
      }
    } else if (signal === 'SIGINT') {
      term.setInput('');
      writePrompt();
    }
  }, [navigateHistory]);

  const initializePrompt = useCallback(() => {
    setTimeout(() => writePrompt(), 100);
  }, []);

  return { handleInput, handleSignal, initializePrompt };
}
