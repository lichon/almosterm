import { defineCommand } from 'just-bash';
import { useEditorStore } from '../store/editorStore';

/**
 * edit — open the built-in file editor for a VFS file.
 *
 * Usage:
 *   edit <filepath>    open <filepath> in the Edit dialog
 *   edit               open editor with no pre-loaded file
 *
 * The file is loaded from the virtual filesystem and saved back on confirmation.
 */
export const edit = defineCommand('edit', async (args, ctx) => {
  let path: string | undefined;

  if (args[0]) {
    // Resolve relative paths against cwd
    path = args[0].startsWith('/')
      ? args[0]
      : `${ctx.cwd.replace(/\/$/, '')}/${args[0]}`;

    // Check existence (but don't fail — let the dialog handle it)
    const exists = await ctx.fs.exists(path);
    if (!exists) {
      return {
        stdout: `File does not exist yet: ${path}. Opening editor to create it.\n`,
        stderr: '',
        exitCode: 0,
      };
    }
  }

  // Open the editor dialog via the store
  useEditorStore.getState().openEditor(path);

  return {
    stdout: path ? `Opening editor for ${path}...\n` : 'Opening editor...\n',
    stderr: '',
    exitCode: 0,
  };
});
