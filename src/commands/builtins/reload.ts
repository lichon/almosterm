import type { CommandHandler } from '../types';

export const reloadHandler: CommandHandler = async (_args, _cwd) => {
  // Brief delay so the terminal can flush before reload
  setTimeout(() => window.location.reload(), 50);
  return { stdout: 'Reloading...\n', stderr: '', exitCode: 0 };
};
