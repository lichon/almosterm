import { defineCommand } from 'just-bash';
import { useVfsStore } from '../store/vfsStore';

/**
 * autosave — enable or disable automatic VFS persistence to localStorage.
 *
 * Usage:
 *   autosave           show current status (on/off)
 *   autosave on        enable auto-save
 *   autosave off       disable auto-save
 *   autosave toggle    flip the current setting
 *
 * When enabled (default), the virtual filesystem is saved to localStorage
 * after every command that mutates it. When disabled, changes only live in
 * memory until a manual save is triggered.
 */
export const autosave = defineCommand('autosave', async (args, _ctx) => {
  const store = useVfsStore.getState();
  const arg = args[0]?.toLowerCase();

  if (!arg) {
    // Show current status
    return {
      stdout: `Auto-save is ${store.autoSave ? 'ON' : 'OFF'}\n`,
      stderr: '',
      exitCode: 0,
    };
  }

  switch (arg) {
    case 'on':
    case 'enable':
    case '1':
    case 'true':
    case 'yes':
      if (store.autoSave) {
        return { stdout: 'Auto-save is already ON.\n', stderr: '', exitCode: 0 };
      }
      store.setAutoSave(true);
      return { stdout: 'Auto-save enabled. VFS will be persisted to localStorage after each mutation.\n', stderr: '', exitCode: 0 };

    case 'off':
    case 'disable':
    case '0':
    case 'false':
    case 'no':
      if (!store.autoSave) {
        return { stdout: 'Auto-save is already OFF.\n', stderr: '', exitCode: 0 };
      }
      store.setAutoSave(false);
      return { stdout: 'Auto-save disabled. VFS changes will only live in memory.\n', stderr: '', exitCode: 0 };

    case 'toggle':
    case 'flip':
    case 'switch': {
      const next = !store.autoSave;
      store.setAutoSave(next);
      return { stdout: `Auto-save toggled ${next ? 'ON' : 'OFF'}.\n`, stderr: '', exitCode: 0 };
    }

    default:
      return {
        stdout: '',
        stderr: `autosave: invalid argument '${args[0]}'. Use 'on', 'off', or 'toggle'.\n`,
        exitCode: 1,
      };
  }
});
