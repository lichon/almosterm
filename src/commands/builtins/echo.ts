import { getVfs } from '../../fs/configure';
import type { CommandHandler } from '../types';

export const echoHandler: CommandHandler = async (args, _cwd) => {
  const text = args.join(' ');
  return { stdout: text + '\n', stderr: '', exitCode: 0 };
};
