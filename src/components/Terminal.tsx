import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import 'xterm/css/xterm.css';
import { getSshStream, setTerminal } from '../utils';
import { useHotKeys } from '../hooks/useHotKeys';
import type { SignalType } from '../hooks/useHotKeys';

interface TerminalComponentProps {
  onInput?: (data: string) => void;
  onSignal?: (signal: string) => void;
  onFileDrop?: (file: File) => void;
  /** Accessor for the current prompt string, used by useHotKeys for redraw. */
  getPrompt?: () => string;
}

export const Terminal: React.FC<TerminalComponentProps> = ({ onInput, onSignal, onFileDrop, getPrompt }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const onFileDropRef = useRef(onFileDrop);

  // Keep callback refs current
  onFileDropRef.current = onFileDrop;

  // Cursor-aware input buffer with hotkey dispatch
  const hotKeys = useHotKeys({
    onSubmit: onInput,
    onSignal: onSignal as ((signal: SignalType) => void) | undefined,
    getPrompt,
  });

  const writeToTerminal = useCallback((data: string) => {
    try { xtermRef.current?.write(data); } catch { /* terminal disposed */ }
  }, []);

  const writelnToTerminal = useCallback((data: string) => {
    try { xtermRef.current?.writeln(data); } catch { /* terminal disposed */ }
  }, []);

  const clearTerminal = useCallback(() => {
    try { xtermRef.current?.clear(); } catch { /* terminal disposed */ }
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
    const clipboardAddon = new ClipboardAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(clipboardAddon);
    term.open(terminalRef.current);
    term.focus();

    // Defer the initial fit to ensure the browser has completed layout,
    // avoiding a race where the renderer's dimensions aren't yet available.
    requestAnimationFrame(() => {
      try { fitAddon.fit(); } catch { /* renderer not ready */ }
    });

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // ---- Copy on select: automatically copy selected text to clipboard ----
    term.onSelectionChange(() => {
      const selectedText = term.getSelection();
      if (selectedText) {
        navigator.clipboard.writeText(selectedText).catch(() => {
          // Clipboard API may be denied in insecure contexts; silently ignore
        });
      }
    });

    // Handle terminal input
    term.onData((data) => {
      // ---- SSH raw mode: forward keystrokes to the active SSH session ----
      const sshStream = getSshStream();
      if (sshStream) {
        try { sshStream.write(data); } catch {}
        return;
      }

      // ---- Normal shell mode: delegate to cursor-aware hotkey handler ----
      hotKeys.handleKey(data);
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

    // Resize handling — guarded against disposed terminal and wrapped in
    // try/catch to handle races where xterm's internal renderer has been
    // torn down (e.g. React StrictMode double-mount or fast unmount).
    const resizeObserver = new ResizeObserver(() => {
      if (xtermRef.current && fitAddonRef.current) {
        try { fitAddon.fit(); } catch { /* internal dimensions unavailable */ }
      }
    });

    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('dragover', onDragOver);
      container.removeEventListener('dragenter', onDragEnter);
      container.removeEventListener('dragleave', onDragLeave);
      container.removeEventListener('drop', onDrop);
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  // Expose write methods via ref or props — we use a simple approach:
  // The parent hooks call writeToTerminal via a ref.
  // For now, we expose methods on the window for the hooks.
  useEffect(() => {
    // Store terminal writer and hotKeys access on window for access by hooks
    setTerminal({
      write: writeToTerminal,
      writeln: writelnToTerminal,
      clear: clearTerminal,
      getInput: () => hotKeys.getInput(),
      setInput: (value: string) => {
        hotKeys.setInput(value);
      },
      getCursor: () => hotKeys.cursor,
      redraw: () => {
        hotKeys.redraw();
      },
    });
    return () => {
      setTerminal(null);
    };
  }, [writeToTerminal, writelnToTerminal, clearTerminal, hotKeys]);

  return (
    <div
      ref={terminalRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
};
