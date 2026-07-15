import type { ParsedCommand, RedirectInfo } from './types';

/**
 * Parse a raw command line input into structured command parts.
 * Handles: command name, quoted arguments, and redirect operators (>, >>, 2>).
 */
export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();

  // Check for redirect operators
  const redirectPatterns: Array<{ pattern: RegExp; type: RedirectInfo['type'] }> = [
    { pattern: /\s+2>>\s+/, type: '2>' },
    { pattern: /\s+>>\s+/, type: '>>' },
    { pattern: /\s+2>\s+/, type: '2>' },
    { pattern: /\s+>\s+/, type: '>' },
  ];

  let redirect: RedirectInfo | undefined;
  let commandPart = trimmed;

  for (const { pattern, type } of redirectPatterns) {
    const match = commandPart.match(pattern);
    if (match && match.index !== undefined) {
      const beforeRedirect = commandPart.slice(0, match.index);
      const afterRedirect = commandPart.slice(match.index! + match[0].length);
      redirect = {
        type,
        target: afterRedirect.replace(/^["']|["']$/g, '').trim(),
      };
      commandPart = beforeRedirect;
      break;
    }
  }

  // Tokenize: split by spaces but respect quotes
  const tokens = tokenize(commandPart);

  if (tokens.length === 0) {
    return { name: '', args: [], redirect };
  }

  const name = tokens[0];
  const args = tokens.slice(1);

  return { name, args, redirect };
}

/**
 * Tokenize a command string, respecting single and double quotes.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escapeNext = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escapeNext) {
      current += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}
