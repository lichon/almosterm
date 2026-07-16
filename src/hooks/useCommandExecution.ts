import { useCallback } from 'react';
import { parseCommand } from '../commands/parser';
import { registry } from '../commands/registry';
import { useVfsStore } from '../store/vfsStore';
import { useSessionStore } from '../store/sessionStore';
import { useToolStore } from '../store/toolStore';
import { getVfs, persistVfs } from '../fs/configure';
import { executeAndCapture } from '../commands/execute-helper';
import { lsHandler } from '../commands/builtins/ls';
import { cdHandler } from '../commands/builtins/cd';
import { pwdHandler } from '../commands/builtins/pwd';
import { catHandler } from '../commands/builtins/cat';
import { mkdirHandler, touchHandler } from '../commands/builtins/mkdir';
import { echoHandler } from '../commands/builtins/echo';
import { rmHandler } from '../commands/builtins/rm';
import { cpHandler } from '../commands/builtins/cp';
import { mvHandler } from '../commands/builtins/mv';
import { nodeHandler } from '../commands/builtins/node';
import { toolRegisterHandler } from '../commands/builtins/tool-register';
import { toolUnregisterHandler } from '../commands/builtins/tool-unregister';
import { toolListHandler } from '../commands/builtins/tool-list';
import { vfsExportHandler, vfsImportHandler } from '../commands/builtins/vfs-export';
import { clearHandler } from '../commands/builtins/clear';
import { helpHandler } from '../commands/builtins/help';
import { testHandler } from '../commands/builtins/test';
import { pasteHandler } from '../commands/builtins/paste';
import { reloadHandler } from '../commands/builtins/reload';

function registerBuiltins(): void {
  registry.register('ls', lsHandler);
  registry.register('cd', cdHandler);
  registry.register('pwd', pwdHandler);
  registry.register('cat', catHandler);
  registry.register('mkdir', mkdirHandler);
  registry.register('touch', touchHandler);
  registry.register('echo', echoHandler);
  registry.register('rm', rmHandler);
  registry.register('cp', cpHandler);
  registry.register('mv', mvHandler);
  registry.register('node', nodeHandler);
  registry.register('tool-register', toolRegisterHandler);
  registry.register('tool-unregister', toolUnregisterHandler);
  registry.register('tool-list', toolListHandler);
  registry.register('vfs-export', vfsExportHandler);
  registry.register('vfs-import', vfsImportHandler);
  registry.register('clear', clearHandler);
  registry.register('help', helpHandler);
  registry.register('test', testHandler);
  registry.register('paste', pasteHandler);
  registry.register('reload', reloadHandler);

  // Custom tool resolver
  registry.addCustomResolver((name: string) => {
    const tool = useToolStore.getState().getTool(name);
    if (!tool) return undefined;
    return async (args: string[], cwd: string) => {
      const scriptContent = tool.type === 'script' ? tool.scriptContent : null;
      const vfsPath = tool.type === 'binary' ? tool.executablePath : null;
      const code = scriptContent || (vfsPath && getVfs().existsSync(vfsPath) ? getVfs().readFileSync(vfsPath, 'utf-8') : null);
      if (!code) return { stdout: '', stderr: `${name}: tool not found\n`, exitCode: 1 };
      try {
        return executeAndCapture(code, getVfs(), cwd);
      } catch (err: any) {
        return { stdout: '', stderr: `${name}: ${err.message}\n`, exitCode: 1 };
      }
    };
  });
}

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
  // Normalize line endings so \n renders as a proper new line (CR+LF)
  let text = normalizeEol(data);
  // Ensure trailing newline so prompt always starts on a fresh line
  if (!text.endsWith('\r\n')) text += '\r\n';
  if (stream === 'stderr') term.write(`\x1b[31m${text}\x1b[0m`);
  else term.write(text);
}

function writePrompt(): void {
  const cwd = useVfsStore.getState().cwd;
  const term = getTerminal();
  if (!term) return;
  // Output already ends with CRLF, so cursor is at column 0 on a fresh line.
  // No \r\n prefix needed — just write the prompt.
  term.write(`\x1b[36muser@almosterm\x1b[0m:\x1b[34m${cwd}\x1b[0m$ `);
}

export function useCommandExecution() {
  const cwd = useVfsStore((s) => s.cwd);
  const { addToHistory, navigateHistory, resetHistoryNavigation } = useSessionStore();

  const handleInput = useCallback(async (command: string) => {
    addToHistory(command);
    resetHistoryNavigation();

    const parsed = parseCommand(command);
    if (!parsed.name) return;

    const handler = registry.resolve(parsed.name);
    if (!handler) {
      writeOutput(`bash: ${parsed.name}: command not found\n`, 'stderr');
      writePrompt();
      return;
    }

    try {
      const result = await handler(parsed.args, cwd);
      if (result.stdout) writeOutput(result.stdout);
      if (result.stderr) writeOutput(result.stderr, 'stderr');

      // Handle redirects
      if (parsed.redirect && result.stdout) {
        const vfs = getVfs();
        const tp = parsed.redirect.target.startsWith('/') ? parsed.redirect.target : (cwd === '/' ? `/${parsed.redirect.target}` : `${cwd}/${parsed.redirect.target}`);
        try {
          if (parsed.redirect.type === '>>') {
            const existing = vfs.existsSync(tp) ? vfs.readFileSync(tp, 'utf-8') : '';
            vfs.writeFileSync(tp, existing + result.stdout);
          } else {
            vfs.writeFileSync(tp, result.stdout);
          }
        } catch (err: any) {
          writeOutput(`redirect error: ${err.message}\n`, 'stderr');
        }
      }

      // Auto-persist after writes
      persistVfs(getVfs());
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
      // Ctrl+C pressed — show a fresh prompt
      writePrompt();
    }
  }, [navigateHistory]);

  const initializePrompt = useCallback(() => {
    setTimeout(() => writePrompt(), 100);
  }, []);

  return { handleInput, handleSignal, initializePrompt, registerBuiltins };
}
