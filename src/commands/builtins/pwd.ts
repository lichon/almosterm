import type { CommandHandler } from '../types';

export const pwdHandler: CommandHandler = async (_args, cwd) => {
  return { stdout: cwd + '\n', stderr: '', exitCode: 0 };
};
