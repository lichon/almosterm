import { useCallback } from 'react';
import { useVfsStore } from '../store/vfsStore';
import { useSessionStore } from '../store/sessionStore';
import { getContainer } from '../fs/configure';

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

function writePrompt(): void {
  const cwd = useVfsStore.getState().cwd;
  const term = getTerminal();
  if (!term) return;
  term.write(`\x1b[36muser@almosterm\x1b[0m:\x1b[34m${cwd}\x1b[0m$ `);
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

    try {
      const container = getContainer();
      const currentCwd = useVfsStore.getState().cwd;
      const result = await container.run(trimmed, { cwd: currentCwd });

      // Track CWD changes after cd commands
      const isCd = /^cd\b/.test(trimmed);
      if (isCd && result.exitCode === 0) {
        const cdMatch = trimmed.match(/^cd\s+(.+)/);
        const target = cdMatch ? cdMatch[1].trim().replace(/^["']|["']$/g, '') : '';
        const newCwd = resolvePath(currentCwd, target);
        useVfsStore.getState().setCwd(newCwd);
      }

      if (result.stdout) writeOutput(result.stdout);
      if (result.stderr) writeOutput(result.stderr, 'stderr');
    } catch (err: any) {
      writeOutput(`Error: ${err.message}\n`, 'stderr');
    }

    writePrompt();
  }, [cwd, addToHistory, resetHistoryNavigation]);

  const handleSignal = useCallback((signal: string) => {
    const term = getTerminal();
    if (!term) return;
    if (signal === 'ARROW_UP') {
      const cmd = navigateHistory('up');
      term.write(`\r\x1b[K`);
      const c = useVfsStore.getState().cwd;
      term.write(`\x1b[36muser@almosterm\x1b[0m:\x1b[34m${c}\x1b[0m$ ${cmd || ''}`);
    } else if (signal === 'ARROW_DOWN') {
      const cmd = navigateHistory('down');
      term.write(`\r\x1b[K`);
      const c = useVfsStore.getState().cwd;
      term.write(`\x1b[36muser@almosterm\x1b[0m:\x1b[34m${c}\x1b[0m$ ${cmd || ''}`);
    } else if (signal === 'SIGINT') {
      writePrompt();
    }
  }, [navigateHistory]);

  const initializePrompt = useCallback(() => {
    setTimeout(() => writePrompt(), 100);
  }, []);

  return { handleInput, handleSignal, initializePrompt };
}
