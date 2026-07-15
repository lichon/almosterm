import type { CommandHandler } from '../types';
import { useToolStore } from '../../store/toolStore';

export const toolUnregisterHandler: CommandHandler = async (args, _cwd) => {
  try {
    if (args.length === 0) {
      return { stdout: '', stderr: 'Usage: tool-unregister <name>\n', exitCode: 1 };
    }

    const name = args[0];
    const store = useToolStore.getState();
    const removed = store.unregisterTool(name);

    if (!removed) {
      return { stdout: '', stderr: `tool-unregister: tool '${name}' not found\n`, exitCode: 1 };
    }

    return { stdout: `Tool '${name}' unregistered.\n`, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `tool-unregister: ${err.message}\n`, exitCode: 1 };
  }
};
