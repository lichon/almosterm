import { VirtualFS, createContainer } from 'almostnode';

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
    '/usr',
    '/usr/local',
    '/usr/local/bin',
    '/usr/share',
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

    const snapshot = JSON.parse(stored);
    // Rebuild from snapshot
    for (const [path, entry] of Object.entries(snapshot.files || {}) as [string, any][]) {
      const dir = path.substring(0, path.lastIndexOf('/'));
      if (dir && !vfs.existsSync(dir)) {
        vfs.mkdirSync(dir, { recursive: true });
      }
      if (entry.type === 'file') {
        vfs.writeFileSync(path, entry.content || '');
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
    const files: Record<string, any> = {};
    collectFiles(vfs, '/', files);
    const snapshot = { version: 1, savedAt: Date.now(), files };
    localStorage.setItem('almosterm-vfs-snapshot', JSON.stringify(snapshot));
  } catch {
    // localStorage may be full
  }
}

function collectFiles(vfs: VirtualFS, dirPath: string, result: Record<string, any>): void {
  if (!vfs.existsSync(dirPath)) return;
  try {
    const entries = vfs.readdirSync(dirPath);
    for (const entry of entries) {
      const fullPath = dirPath === '/' ? `/${entry}` : `${dirPath}/${entry}`;
      try {
        const stat = vfs.statSync(fullPath);
        if (stat.isDirectory()) {
          result[fullPath] = { type: 'directory' };
          collectFiles(vfs, fullPath, result);
        } else {
          const content = vfs.readFileSync(fullPath, 'utf-8');
          result[fullPath] = { type: 'file', content, size: stat.size };
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
}
