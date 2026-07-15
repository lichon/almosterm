import type { CommandHandler } from '../types';

export const clearHandler: CommandHandler = async (_args, _cwd) => {
  const term = (window as any).__almosterm_terminal;
  if (term) {
    term.clear();
  }
  return { stdout: '', stderr: '', exitCode: 0 };
};
