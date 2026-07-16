import type { CommandHandler } from '../types';
import { registry } from '../registry';

export const helpHandler: CommandHandler = async (args, _cwd) => {
  if (args.length > 0) {
    // Help for specific command
    const cmdName = args[0];
    const handler = registry.resolve(cmdName);

    if (!handler) {
      return { stdout: '', stderr: `help: no help available for '${cmdName}'\n`, exitCode: 1 };
    }

    // Generic help for builtins
    const helpTexts: Record<string, string> = {
      ls: 'ls - List directory contents\nUsage: ls [-a] [-l] [path]',
      cd: 'cd - Change directory\nUsage: cd [directory]\n  cd with no args goes to /home/user',
      pwd: 'pwd - Print working directory\nUsage: pwd',
      cat: 'cat - Display file contents\nUsage: cat <file> [file2 ...]',
      mkdir: 'mkdir - Create directory\nUsage: mkdir [-p] <directory>',
      touch: 'touch - Create empty file or update timestamp\nUsage: touch <file> [file2 ...]',
      echo: 'echo - Print text to stdout\nUsage: echo <text>\n  Supports > and >> redirects',
      rm: 'rm - Remove file or directory\nUsage: rm [-r] [-f] <path>',
      cp: 'cp - Copy file or directory\nUsage: cp [-r] <source> <destination>',
      mv: 'mv - Move/rename file or directory\nUsage: mv <source> <destination>',
      node: 'node - Execute Node.js script via almostnode\nUsage: node [-e <code>] [script]',
      clear: 'clear - Clear the terminal screen\nUsage: clear',
      help: 'help - Show available commands\nUsage: help [command]',
      'tool-register': 'tool-register - Register a custom CLI tool\nUsage: tool-register <name> <path> [--description "..." --version "..."]',
      'tool-unregister': 'tool-unregister - Remove a custom CLI tool\nUsage: tool-unregister <name>',
      'tool-list': 'tool-list - List registered custom tools\nUsage: tool-list',
      'vfs-export': 'vfs-export - Export VFS to downloadable snapshot\nUsage: vfs-export [path]',
      'vfs-import': 'vfs-import - Import VFS from snapshot file\nUsage: vfs-import <file>',
      test: 'test - Test almostnode runtime components\nUsage: test [npm|node|all]\n  test npm [pkg]  Test npm install + require (default: is-odd)\n  test node       Test builtins, require, async/await\n  test all        Run full self-test (VFS + node + npm)',
      paste: 'paste - Paste clipboard content to a file\nUsage: paste [filename]\n  paste           Write clipboard to pasted-<timestamp>.txt\n  paste notes.md  Write clipboard to notes.md (avoids overwrite)',
      reload: 'reload - Reload the web page\nUsage: reload',
    };

    return { stdout: helpTexts[cmdName] || `No detailed help for '${cmdName}'\n`, stderr: '', exitCode: 0 };
  }

  const commands = registry.list().sort();
  const maxLen = Math.max(...commands.map(c => c.length));

  const lines = ['Available commands:', ''];
  const cols = 3;
  const rows = Math.ceil(commands.length / cols);

  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const idx = c * rows + r;
      if (idx < commands.length) {
        line += `  ${commands[idx].padEnd(maxLen + 2)}`;
      }
    }
    lines.push(line);
  }

  lines.push('', 'Type \'help <command>\' for details.');

  return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
};
