import { VirtualFS, createContainer } from 'almostnode';
import type { VFSSnapshot } from 'almostnode';

const _container = createContainer();

/**
 * Get the singleton VirtualFS instance (from almostnode).
 * Creates it on first call with default structure.
 */
export function getVfs(): VirtualFS {
  return _container.vfs;
}

export function getContainer() {
  return _container;
}

/** Convert base64 string to Uint8Array */
export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Initialize the VFS with a default Unix-like structure.
 * Only called on first launch when no persisted VFS exists.
 */
export function populateDefaultVfs(vfs: VirtualFS): void {
  const dirs = [
    '/home',
    '/home/user',
    '/tmp',
    '/etc',
    '/bin',
    '/var',
  ];

  for (const dir of dirs) {
    if (!vfs.existsSync(dir)) {
      vfs.mkdirSync(dir, { recursive: true });
    }
  }

  // Create hostname file
  if (!vfs.existsSync('/etc/hostname')) {
    vfs.writeFileSync('/etc/hostname', 'almosterm-local\n');
  }

  // Create .almostermrc
  if (!vfs.existsSync('/home/user/.almostermrc')) {
    const config = JSON.stringify({
      version: 1,
      created: new Date().toISOString(),
      prompt: 'user@almosterm:{cwd}$ ',
    }, null, 2);
    vfs.writeFileSync('/home/user/.almostermrc', config);
  }
}

/**
 * Try to load VFS state from localStorage.
 */
export function loadPersistedVfs(vfs: VirtualFS): boolean {
  try {
    const stored = localStorage.getItem('almosterm-vfs-snapshot');
    if (!stored) return false;

    const snapshot = JSON.parse(stored) as VFSSnapshot;
    // Sort entries to ensure directories are created before their contents
    const sortedFiles = snapshot.files
      .map((entry, i) => ({ entry, depth: entry.path.split('/').length, i }))
      .sort((a, b) => a.depth - b.depth || a.i - b.i)
      .map(x => x.entry);

    for (const entry of sortedFiles) {
      if (entry.path === '/') continue; // Skip root

      if (entry.type === 'directory') {
        vfs.mkdirSync(entry.path, { recursive: true });
      } else if (entry.type === 'file') {
        // Decode base64 content
        let content: Uint8Array;
        if (entry.content) {
          content = base64ToUint8(entry.content);
        } else {
          content = new Uint8Array(0);
        }
        // Ensure parent directory exists
        const parentPath = entry.path.substring(0, entry.path.lastIndexOf('/')) || '/';
        if (parentPath !== '/' && !vfs.existsSync(parentPath)) {
          vfs.mkdirSync(parentPath, { recursive: true });
        }
        vfs.writeFileSync(entry.path, content);
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Save VFS state to localStorage.
 */
export function persistVfs(vfs: VirtualFS): void {
  try {
    const snapshot = vfs.toSnapshot()
    const storageObj = { version: 1, savedAt: Date.now(), files: snapshot.files };
    localStorage.setItem('almosterm-vfs-snapshot', JSON.stringify(storageObj));
  } catch {
    // localStorage may be full
  }
}
