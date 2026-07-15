import React, { useEffect, useRef } from 'react';
import { Terminal } from './components/Terminal';
import { useCommandExecution } from './hooks/useCommandExecution';

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
        term.writeln('║  Type \'help\' for available commands       ║');
        term.writeln('╚══════════════════════════════════════════╝');
      }

      initializePrompt();
    }
  }, []);

  return (
    <Terminal
      onInput={handleInput}
      onSignal={handleSignal}
    />
  );
};

export default Bash;
