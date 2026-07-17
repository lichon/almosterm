import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from './components/Terminal';
import { useCommandExecution } from './hooks/useCommandExecution';
import { useVfsStore } from './store/vfsStore';
import { getTerminal } from './utils';

/**
 * Bash shell entry component.
 * Wires xterm.js Terminal ↔ just-bash Bash instance.
 */
const Bash: React.FC = () => {
  const { handleInput, handleSignal, initializePrompt, bash } = useCommandExecution();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;

      // Show welcome message and prompt
      const term = getTerminal();
      if (term) {
        term.writeln('╔══════════════════════════════════════════╗');
        term.writeln('║         almosterm v0.2.0                 ║');
        term.writeln('║  Local Virtual File System Terminal      ║');
        term.writeln("║  Type 'help' for available commands      ║");
        term.writeln('╚══════════════════════════════════════════╝');
      }

      initializePrompt();
    }
  }, []);

  const handleFileDrop = useCallback(async (file: File) => {
    const term = getTerminal();
    const cwd = useVfsStore.getState().cwd;
    const filename = file.name;
    const targetPath = cwd === '/' ? `/${filename}` : `${cwd}/${filename}`;

    try {
      const content = await file.text();
      await bash.writeFile(targetPath, content);

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
  }, [bash]);

  return (
    <Terminal
      onInput={handleInput}
      onSignal={handleSignal}
      onFileDrop={handleFileDrop}
    />
  );
};

export default Bash;
