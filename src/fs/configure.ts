import { VirtualFS } from 'almostnode';
import { createContainer, ZenVFS } from './zen-vfs';
import type { ContainerConfig, ZenContainer } from './zen-vfs';

// Container is null until async init completes.
let _container: ZenContainer | null = null;

/** Initialize the ZenVFS-powered container. Call once at app startup. */
export async function initZenVfs(): Promise<ZenContainer> {
  if (_container) return _container;

  _container = await createContainer({
    mounts: {
      '/tmp': { backend: 'memory' },
      '/': { backend: 'indexeddb', options: { storeName: 'rootfs' } },
    },
    strict: false,
  });

  populateDefaultVfs(_container.vfs);
  return _container;
}

/** Get the VFS. Throws if init hasn't completed. */
export function getVfs(): VirtualFS {
  if (!_container) throw new Error('ZenVFS not initialized. Call initZenVfs() first.');
  return _container.vfs;
}

/** Get the full container. Throws if init hasn't completed. */
export function getContainer(): any {
  if (!_container) throw new Error('ZenVFS not initialized. Call initZenVfs() first.');
  return _container;
}

/** Initialize the VFS with a default Unix-like structure. */
export function populateDefaultVfs(vfs: VirtualFS): void {
  const dirs = ['/home/user', '/etc', '/bin', '/var'];
  for (const dir of dirs) {
    if (!vfs.existsSync(dir)) {
      vfs.mkdirSync(dir, { recursive: true });
    }
  }
  if (!vfs.existsSync('/etc/hostname')) {
    vfs.writeFileSync('/etc/hostname', 'almosterm-local\n');
  }
  if (!vfs.existsSync('/home/user/.almostermrc')) {
    vfs.writeFileSync('/home/user/.almostermrc', JSON.stringify({
      version: 1,
      created: new Date().toISOString(),
      prompt: 'user@almosterm:{cwd}$ ',
    }, null, 2));
  }
}

export { ZenVFS };
export type { ContainerConfig };
