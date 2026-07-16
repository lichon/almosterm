import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

interface TerminalComponentProps {
  onInput?: (data: string) => void;
  onSignal?: (signal: string) => void;
  onFileDrop?: (file: File) => void;
}

export const Terminal: React.FC<TerminalComponentProps> = ({ onInput, onSignal, onFileDrop }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const inputBufferRef = useRef<string>('');
  const onInputRef = useRef(onInput);
  const onSignalRef = useRef(onSignal);
  const onFileDropRef = useRef(onFileDrop);

  // Keep callback refs current
  onInputRef.current = onInput;
  onSignalRef.current = onSignal;
  onFileDropRef.current = onFileDrop;

  const writeToTerminal = useCallback((data: string) => {
    xtermRef.current?.write(data);
  }, []);

  const writelnToTerminal = useCallback((data: string) => {
    xtermRef.current?.writeln(data);
  }, []);

  const clearTerminal = useCallback(() => {
    xtermRef.current?.clear();
  }, []);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      theme: {
        background: '#0d0d1a',
        foreground: '#e0e0e0',
        cursor: '#00e5ff',
        cursorAccent: '#0d0d1a',
        selectionBackground: '#333366',
        black: '#1a1a2e',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#ffb86c',
        blue: '#00e5ff',
        magenta: '#bd93f9',
        cyan: '#8be9fd',
        white: '#e0e0e0',
        brightBlack: '#444466',
        brightRed: '#ff6e67',
        brightGreen: '#5af78e',
        brightYellow: '#ffb86c',
        brightBlue: '#00e5ff',
        brightMagenta: '#bd93f9',
        brightCyan: '#8be9fd',
        brightWhite: '#ffffff',
      },
      fontSize: 14,
      fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Consolas', monospace",
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);
    term.focus();

    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle terminal input
    term.onData((data) => {
      // Check for Ctrl+C (ETX = 0x03)
      if (data === '\x03') {
        inputBufferRef.current = '';
        term.write('^C\r\n');
        if (onSignalRef.current) {
          onSignalRef.current('SIGINT');
        }
        return;
      }

      // Handle Enter
      if (data === '\r') {
        term.write('\r\n');
        const command = inputBufferRef.current;
        inputBufferRef.current = '';
        if (onInputRef.current) {
          onInputRef.current(command);
        }
        return;
      }

      // Handle Backspace
      if (data === '\x7f') {
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          term.write('\b \b');
        }
        return;
      }

      // Handle arrow keys via escape sequences
      if (data.startsWith('\x1b[')) {
        if (data === '\x1b[A') {
          // Up arrow - emit custom event handled by parent
          if (onSignalRef.current) {
            onSignalRef.current('ARROW_UP');
          }
          return;
        }
        if (data === '\x1b[B') {
          // Down arrow
          if (onSignalRef.current) {
            onSignalRef.current('ARROW_DOWN');
          }
          return;
        }
        if (data === '\x1b[D') {
          // Left arrow - move cursor left if possible
          if (inputBufferRef.current.length > 0) {
            // Simple: just ignore for now (don't support cursor movement in input buffer)
          }
          return;
        }
        if (data === '\x1b[C') {
          // Right arrow - ignore
          return;
        }
        // Tab key
        if (data === '\x1b[Z' || data === '\t') {
          // Emit tab event
          if (onSignalRef.current) {
            onSignalRef.current('TAB');
          }
          return;
        }
        return;
      }

      // Handle Tab (raw)
      if (data === '\t') {
        if (onSignalRef.current) {
          onSignalRef.current('TAB');
        }
        return;
      }

      // Regular character - echo and buffer
      inputBufferRef.current += data;
      term.write(data);
    });

    // Drag-and-drop file support
    const container = terminalRef.current;
    let dragCounter = 0;

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      if (dragCounter === 1) {
        container.style.outline = '2px dashed #00e5ff';
        container.style.outlineOffset = '-4px';
      }
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter === 0) {
        container.style.outline = '';
        container.style.outlineOffset = '';
      }
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      container.style.outline = '';
      container.style.outlineOffset = '';

      const file = e.dataTransfer?.files?.[0];
      if (file && onFileDropRef.current) {
        onFileDropRef.current(file);
      }
    };

    container.addEventListener('dragover', onDragOver);
    container.addEventListener('dragenter', onDragEnter);
    container.addEventListener('dragleave', onDragLeave);
    container.addEventListener('drop', onDrop);

    // Resize handling
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });

    resizeObserver.observe(terminalRef.current);

    return () => {
      container.removeEventListener('dragover', onDragOver);
      container.removeEventListener('dragenter', onDragEnter);
      container.removeEventListener('dragleave', onDragLeave);
      container.removeEventListener('drop', onDrop);
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  // Expose write methods via ref or props — we use a simple approach:
  // The parent hooks call writeToTerminal via a ref.
  // For now, we expose methods on the window for the hooks.
  useEffect(() => {
    // Store terminal writer on window for access by hooks
    (window as any).__almosterm_terminal = {
      write: writeToTerminal,
      writeln: writelnToTerminal,
      clear: clearTerminal,
    };
    return () => {
      delete (window as any).__almosterm_terminal;
    };
  }, [writeToTerminal, writelnToTerminal, clearTerminal]);

  return (
    <div
      ref={terminalRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
};
