/**
 * useHotKeys — Cursor-aware input buffer with emacs-style hotkey dispatch.
 *
 * Replaces the simple string input buffer in Terminal.tsx with a
 * grapheme-cluster-aware editor that supports arrow-key cursor
 * navigation, Ctrl+A/E line jumping, and Ctrl+W/K deletion shortcuts.
 */

import { useRef, useCallback } from 'react';
import { graphemeCount, graphemeAt, stringOffset, graphemeClusters } from './grapheme';
import { charWidth } from './displayWidth';
import { getTerminal } from '../utils';

// ── Types ────────────────────────────────────────────────────────────────────

export interface InputBuffer {
  text: string;
  cursor: number; // grapheme-cluster index, 0 <= cursor <= graphemeCount(text)
}

export interface UseHotKeysOptions {
  /** Callback invoked when user presses Enter (command submission). */
  onSubmit?: (command: string) => void;
  /** Callback invoked for navigation/history signals. */
  onSignal?: (signal: SignalType) => void;
  /** Accessor for the current prompt string (e.g. "~/project$ "). */
  getPrompt?: () => string;
}

export interface UseHotKeysAPI {
  handleKey: (data: string) => void;
  getInput: () => string;
  setInput: (text: string) => void;
  redraw: () => void;
  clear: () => void;
  cursor: number;
  length: number;
}

export type SignalType = 'ARROW_UP' | 'ARROW_DOWN' | 'TAB' | 'SIGINT';

// ── Private helpers ──────────────────────────────────────────────────────────

/** Compute the display-width column at the cursor position. */
function cursorColumn(text: string, cursor: number, promptWidth: number): number {
  const clusters = graphemeClusters(text);
  let col = promptWidth;
  for (let i = 0; i < cursor && i < clusters.length; i++) {
    col += charWidth(clusters[i]);
  }
  return col;
}

/** Compute the visual width of a string (stripping ANSI escape sequences). */
function visualWidth(text: string): number {
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');
  let width = 0;
  for (const g of graphemeClusters(stripped)) {
    width += charWidth(g);
  }
  return width;
}

/** Insert a string into text at the given grapheme-cluster index. */
function insertAtCluster(text: string, cursor: number, char: string): string {
  const offset = stringOffset(text, cursor);
  return text.slice(0, offset) + char + text.slice(offset);
}

/** Delete the grapheme cluster at clusterIndex from text. */
function deleteCluster(text: string, clusterIndex: number): string {
  const segment = graphemeAt(text, clusterIndex);
  if (segment === undefined) return text;
  const offset = stringOffset(text, clusterIndex);
  return text.slice(0, offset) + text.slice(offset + segment.length);
}

/** Delete the grapheme cluster before the cursor. */
function deleteBeforeCursor(text: string, cursor: number): string {
  if (cursor <= 0) return text;
  return deleteCluster(text, cursor - 1);
}

/**
 * Find the start of the word before the cursor for Ctrl+W deletion.
 * A "word" is a contiguous run of non-whitespace characters.
 * Includes any preceding whitespace in the deletion.
 */
function wordBoundaryBeforeCursor(text: string, cursor: number): number {
  if (cursor <= 0) return 0;
  // Step 1: skip contiguous non-whitespace before cursor
  let pos = cursor - 1;
  while (pos >= 0) {
    const g = graphemeAt(text, pos);
    if (!g || g.trim() === '') break;
    pos--;
  }
  // Step 2: skip contiguous whitespace before that word
  while (pos >= 0) {
    const g = graphemeAt(text, pos);
    if (!g || g.trim() !== '') break;
    pos--;
  }
  return pos + 1;
}

/**
 * Delete from the given grapheme-cluster index (inclusive) to the end.
 */
function deleteFromCluster(text: string, fromCluster: number): string {
  const offset = stringOffset(text, fromCluster);
  return text.slice(0, offset);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useHotKeys(options?: UseHotKeysOptions): UseHotKeysAPI {
  const bufferRef = useRef<InputBuffer>({ text: '', cursor: 0 });
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // ── Redraw protocol ──────────────────────────────────────────────────

  const redraw = useCallback(() => {
    const term = getTerminal();
    if (!term) return;
    const { text, cursor } = bufferRef.current;
    const prompt = optionsRef.current?.getPrompt?.() ?? '';
    const promptWidth = visualWidth(prompt);
    const col = cursorColumn(text, cursor, promptWidth);

    term.write(`\r\x1b[K`);          // CR + erase to end of line
    term.write(prompt);               // Write prompt (may include ANSI colors)
    term.write(text);                 // Write buffer text
    term.write(`\r\x1b[${col}C`);    // Position cursor at correct column
  }, []);

  // ── Public operations ────────────────────────────────────────────────

  const getInput = useCallback((): string => {
    return bufferRef.current.text;
  }, []);

  const setInput = useCallback((text: string) => {
    bufferRef.current.text = text;
    bufferRef.current.cursor = graphemeCount(text);
  }, []);

  const clear = useCallback(() => {
    bufferRef.current.text = '';
    bufferRef.current.cursor = 0;
  }, []);

  // ── Keystroke dispatch ───────────────────────────────────────────────

  const handleKey = useCallback((data: string) => {
    const buf = bufferRef.current;
    const opts = optionsRef.current;
    const count = graphemeCount(buf.text);

    // ── Enter ──
    if (data === '\r') {
      const command = buf.text;
      clear();
      const term = getTerminal();
      if (term) term.write('\r\n');
      opts?.onSubmit?.(command);
      return;
    }

    // ── Backspace ──
    if (data === '\x7f') {
      if (buf.cursor > 0) {
        buf.text = deleteBeforeCursor(buf.text, buf.cursor);
        buf.cursor--;
        redraw();
      }
      return;
    }

    // ── Ctrl+A (Home) ──
    if (data === '\x01') {
      buf.cursor = 0;
      redraw();
      return;
    }

    // ── Ctrl+E (End) ──
    if (data === '\x05') {
      buf.cursor = count;
      redraw();
      return;
    }

    // ── Ctrl+U (Kill from cursor to beginning of line) ──
    if (data === '\x15') {
      if (buf.cursor === 0) return; // no-op at start of line
      buf.text = buf.text.slice(stringOffset(buf.text, buf.cursor));
      buf.cursor = 0;
      redraw();
      return;
    }

    // ── Ctrl+W (Delete word before cursor) ──
    if (data === '\x17') {
      if (buf.cursor === 0) return; // no-op at start of line
      const boundary = wordBoundaryBeforeCursor(buf.text, buf.cursor);
      buf.text = deleteFromCluster(buf.text, boundary) + buf.text.slice(stringOffset(buf.text, buf.cursor));
      buf.cursor = boundary;
      redraw();
      return;
    }

    // ── Ctrl+K (Kill to end of line) ──
    if (data === '\x0B') {
      if (buf.cursor >= count) return; // no-op at end of line
      buf.text = deleteFromCluster(buf.text, buf.cursor);
      redraw();
      return;
    }

    // ── Ctrl+C (SIGINT) ──
    if (data === '\x03') {
      clear();
      const term = getTerminal();
      if (term) term.write('^C\r\n');
      opts?.onSignal?.('SIGINT');
      return;
    }

    // ── Escape sequences (arrows, tab) ──
    if (data.startsWith('\x1b[')) {
      if (data === '\x1b[D') {
        // Left Arrow
        buf.cursor = Math.max(0, buf.cursor - 1);
        redraw();
        return;
      }
      if (data === '\x1b[C') {
        // Right Arrow
        buf.cursor = Math.min(count, buf.cursor + 1);
        redraw();
        return;
      }
      if (data === '\x1b[A') {
        // Up Arrow
        opts?.onSignal?.('ARROW_UP');
        return;
      }
      if (data === '\x1b[B') {
        // Down Arrow
        opts?.onSignal?.('ARROW_DOWN');
        return;
      }
      // Tab (some terminals send \x1b[Z for Shift+Tab, but \t is the standard)
      if (data === '\x1b[Z' || data === '\t') {
        opts?.onSignal?.('TAB');
        return;
      }
      // Unknown escape sequence — ignore
      return;
    }

    // ── Raw Tab ──
    if (data === '\t') {
      opts?.onSignal?.('TAB');
      return;
    }

    // ── Printable character ──
    // Filter out control characters (code points < 0x20 except those handled above)
    if (data.length === 1 && data.charCodeAt(0) < 0x20) {
      return; // ignore other control characters
    }

    // Insert character(s) at cursor position.
    // data may contain multiple grapheme clusters (e.g. IME input, paste).
    buf.text = insertAtCluster(buf.text, buf.cursor, data);
    buf.cursor += graphemeCount(data);
    redraw();
  }, [redraw, clear]);

  return {
    handleKey,
    getInput,
    setInput,
    redraw,
    clear,
    get cursor() { return bufferRef.current.cursor; },
    get length() { return graphemeCount(bufferRef.current.text); },
  };
}
