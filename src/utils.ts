/** Retrieve the xterm terminal instance from the global scope */
export function getTerminal() {
  return (window as any).__almosterm_terminal;
}

/** Register the xterm terminal instance on the global scope */
export function setTerminal(term: any): void {
  (window as any).__almosterm_terminal = term;
}

/** Normalize LF → CRLF so xterm renders without staircasing */
export function normalizeEol(data: string): string {
  return data.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

/**
 * Write output to the terminal.
 * @param data    The text to write
 * @param stream  'stdout' (default) writes normally; 'stderr' wraps in red ANSI escapes
 */
export function writeTerm(data: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
  const term = getTerminal();
  if (!term || !data) return;
  let text = normalizeEol(data);
  if (!text.endsWith('\r\n')) text += '\r\n';
  if (stream === 'stderr') term.write(`\x1b[31m${text}\x1b[0m`);
  else term.write(text);
}
