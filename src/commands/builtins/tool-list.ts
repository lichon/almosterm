import type { CommandHandler } from '../types';
import { useToolStore } from '../../store/toolStore';

export const toolListHandler: CommandHandler = async (_args, _cwd) => {
  const store = useToolStore.getState();
  const tools = store.listTools();

  if (tools.length === 0) {
    return { stdout: 'No custom tools registered.\n', stderr: '', exitCode: 0 };
  }

  const lines = ['Registered tools:', ''];
  for (const tool of tools) {
    const desc = tool.description ? ` - ${tool.description}` : '';
    const ver = tool.version ? ` (v${tool.version})` : '';
    lines.push(`  ${tool.name}${ver}${desc}`);
  }

  return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
};
