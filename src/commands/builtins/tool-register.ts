import { getVfs } from '../../fs/configure';
import type { CommandHandler } from '../types';

export const toolRegisterHandler: CommandHandler = async (args, cwd) => {
  if (args.length < 2) return { stdout: '', stderr: 'Usage: tool-register <name> <executable-path> [--description "..."]\n', exitCode: 1 };
  const vfs = getVfs();
  const name = args[0];
  const execPath = args[1].startsWith('/') ? args[1] : (cwd === '/' ? `/${args[1]}` : `${cwd}/${args[1]}`);
  if (!vfs.existsSync(execPath)) return { stdout: '', stderr: `tool-register: executable path does not exist: ${execPath}\n`, exitCode: 1 };
  const { registry } = await import('../registry');
  if (registry.isReserved(name)) return { stdout: '', stderr: `tool-register: '${name}' conflicts with a built-in command\n`, exitCode: 1 };

  const descIdx = args.indexOf('--description');
  const description = descIdx !== -1 && descIdx + 1 < args.length ? args[descIdx + 1] : null;

  const { useToolStore } = await import('../../store/toolStore');
  const result = useToolStore.getState().registerTool({ name, type: 'binary', executablePath: execPath, scriptContent: null, description, version: null, registeredAt: Date.now() });
  if (!result.success) return { stdout: '', stderr: `tool-register: ${result.error}\n`, exitCode: 1 };
  return { stdout: `Tool '${name}' registered successfully.\n`, stderr: '', exitCode: 0 };
};
