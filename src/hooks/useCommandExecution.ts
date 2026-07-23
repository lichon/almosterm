import { useCallback } from 'react';
import { useVfsStore } from '../store/vfsStore';
import { useSessionStore } from '../store/sessionStore';
import { useJustBash } from './useJustBash';
import { getTabCompletions } from './useTabCompletion';
import { getTerminal, writeTerm } from '../utils';

/** Get the current CWD-colored prompt string (without trailing space+command). */
function getPromptStr(): string {
  const cwd = useVfsStore.getState().cwd;
  const displayCwd = cwd.replace(/^\/home\/user/, "~") || "/";
  return `\x1b[34m${displayCwd}\x1b[0m$ `;
}

export function useCommandExecution() {
  const { bash, exec } = useJustBash();
  const { addToHistory, navigateHistory, resetHistoryNavigation } = useSessionStore();

  /** Public callback for Terminal's useHotKeys getPrompt option. */
  const getPrompt = useCallback(() => getPromptStr(), []);

  const handleInput = useCallback(async (command: string) => {
    addToHistory(command);
    resetHistoryNavigation();

    const term = getTerminal();

    const trimmed = command.trim();
    if (!trimmed.length) {
      // Empty command — redraw prompt for next input
      if (term) term.redraw();
      return;
    }

    try {
      const currentCwd = useVfsStore.getState().cwd;
      const result = await exec(trimmed, {
        cwd: currentCwd,
        rawScript: true
      });

      // Write stdout/stderr
      if (result.stdout) writeTerm(result.stdout);
      if (result.stderr) writeTerm(result.stderr, 'stderr');

      // Sync CWD
      useVfsStore.getState().setCwd(result.env['PWD'] || '/');
    } catch (err: any) {
      writeTerm(`Error: ${err.message}\n`, 'stderr');
    }

    // Redraw prompt for next input (buffer already cleared by handleKey)
    if (term) term.redraw();
  }, [bash, exec, addToHistory, resetHistoryNavigation]);

  const handleSignal = useCallback((signal: string) => {
    const term = getTerminal();
    if (!term) return;

    if (signal === 'ARROW_UP') {
      const cmd = navigateHistory('up');
      if (cmd !== null) {
        term.setInput(cmd);
      }
      term.redraw();
    } else if (signal === 'ARROW_DOWN') {
      const cmd = navigateHistory('down');
      term.setInput(cmd ?? '');
      term.redraw();
    } else if (signal === 'TAB') {
      const input = term.getInput();
      if (!input) return;
      const cursor = term.getCursor ? term.getCursor() : undefined;
      const cwd = useVfsStore.getState().cwd;

      getTabCompletions(input, cwd, bash.fs, cursor).then(({ matches, commonPrefix }) => {
        if (matches.length === 0) {
          // No completions — do nothing
          return;
        }

        // Find word boundaries at cursor for replacement
        const targetPos = cursor !== undefined ? cursor : input.length;
        let wordStart = targetPos;
        while (wordStart > 0 && input[wordStart - 1] !== ' ' && input[wordStart - 1] !== '\t') {
          wordStart--;
        }
        let wordEnd = targetPos;
        while (wordEnd < input.length && input[wordEnd] !== ' ' && input[wordEnd] !== '\t') {
          wordEnd++;
        }
        const oldWord = input.slice(wordStart, wordEnd);

        if (matches.length === 1) {
          // Single match — complete the word
          let completed: string;
          if (oldWord.includes('/')) {
            const lastSlash = oldWord.lastIndexOf('/');
            completed = oldWord.substring(0, lastSlash + 1) + matches[0];
          } else {
            completed = matches[0];
          }

          const newInput = input.slice(0, wordStart) + completed + input.slice(wordEnd);
          term.setInput(newInput);
          term.redraw();
        } else if (commonPrefix.length > oldWord.length) {
          // Multiple matches with common prefix — complete as much as possible
          let completed: string;
          if (oldWord.includes('/')) {
            const lastSlash = oldWord.lastIndexOf('/');
            completed = oldWord.substring(0, lastSlash + 1) + commonPrefix;
          } else {
            completed = commonPrefix;
          }

          const newInput = input.slice(0, wordStart) + completed + input.slice(wordEnd);
          term.setInput(newInput);
          term.redraw();
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
          // Redraw prompt and input at cursor position
          term.setInput(input);
          term.redraw();
        }
      });
    } else if (signal === 'SIGINT') {
      // Buffer already cleared by handleKey; redraw shows empty prompt
      term.redraw();
    }
  }, [navigateHistory, bash]);

  const initializePrompt = useCallback(() => {
    setTimeout(() => {
      const term = getTerminal();
      if (term) term.redraw();
    }, 100);
  }, []);

  return { handleInput, handleSignal, initializePrompt, bash, getPrompt };
}
