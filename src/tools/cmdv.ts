import { defineCommand } from 'just-bash';

/**
 * cmdv — paste clipboard content to a file.
 *
 * Usage:
 *   cmdv <filepath>    write clipboard content to <filepath>
 *   cmdv               write to default path (/home/user/clipboard.txt)
 *
 * If the clipboard is empty or inaccessible, a default placeholder is written.
 */
export const cmdv = defineCommand('cmdv', async (args, ctx) => {
  const filepath = args[0] || '/home/user/clipboard.txt';

  let content: string;
  try {
    const clipText = await navigator.clipboard.readText();
    content = clipText || '<!-- clipboard was empty -->\n';
  } catch {
    content = '<!-- unable to read clipboard — pasted default -->\n';
  }

  try {
    await ctx.fs.writeFile(filepath, content);
    return {
      stdout: `Wrote ${content.length} bytes to ${filepath}\n`,
      stderr: '',
      exitCode: 0,
    };
  } catch (err: any) {
    return {
      stdout: '',
      stderr: `cmdv: ${err.message}\n`,
      exitCode: 1,
    };
  }
});
