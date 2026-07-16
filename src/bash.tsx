import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from './components/Terminal';
import { useCommandExecution } from './hooks/useCommandExecution';
import { useVfsStore } from './store/vfsStore';
import { getVfs, persistVfs } from './fs/configure';

/**
 * Bash shell entry component ("just-bash").
 * Wraps the Terminal and wires up command execution.
 */
const Bash: React.FC = () => {
  const { handleInput, handleSignal, initializePrompt, registerBuiltins } = useCommandExecution();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      // Register all built-in command handlers
      registerBuiltins();
      initializedRef.current = true;

      // Show welcome message and prompt
      const term = (window as any).__almosterm_terminal;
      if (term) {
        term.writeln('╔══════════════════════════════════════════╗');
        term.writeln('║         almosterm v0.1.0                 ║');
        term.writeln('║  Local Virtual File System Terminal      ║');
        term.writeln('║  Type \'help\' for available commands    ║');
        term.writeln('╚══════════════════════════════════════════╝');
      }

      initializePrompt();
    }
  }, []);

  const handleFileDrop = useCallback(async (file: File) => {
    const term = (window as any).__almosterm_terminal;
    const cwd = useVfsStore.getState().cwd;
    const vfs = getVfs();

    // Build target path: cwd + filename, avoiding duplicate slashes
    const filename = file.name;
    const targetPath = cwd === '/' ? `/${filename}` : `${cwd}/${filename}`;

    try {
      // Read file as text
      const content = await file.text();
      vfs.writeFileSync(targetPath, content);
      persistVfs(vfs);

      const sizeFmt = file.size < 1024
        ? `${file.size} B`
        : file.size < 1024 * 1024
          ? `${(file.size / 1024).toFixed(1)} KB`
          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

      if (term) {
        term.writeln(`\r\n\x1b[32m▼ Dropped: ${filename} (${sizeFmt}) → ${targetPath}\x1b[0m`);
      }
    } catch (err: any) {
      if (term) {
        term.writeln(`\r\n\x1b[31m✗ Failed to import ${filename}: ${err.message}\x1b[0m`);
      }
    }
  }, []);

  return (
    <Terminal
      onInput={handleInput}
      onSignal={handleSignal}
      onFileDrop={handleFileDrop}
    />
  );
};

export default Bash;
