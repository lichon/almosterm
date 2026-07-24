import { VirtualFS } from 'almostnode';
import { configureZenFS, createContainer, ZenVFS } from './zen-vfs';
import type { ContainerConfig, ZenContainer } from './zen-vfs';

// ─── globalThis keys (survive Vite HMR module reloads) ───────────────────

const CONTAINER_KEY = '__zenContainer';

declare global {
  var __zenContainer: ZenContainer | undefined;
}

/** One-shot init: configure backends, create container, seed default files.
 *  Returns the cached container on subsequent calls (HMR-safe). */
export async function initZenContainer(): Promise<ZenContainer> {
  if (globalThis[CONTAINER_KEY]) return globalThis[CONTAINER_KEY];

  const vfs = await configureZenFS({
    mounts: {
      '/tmp': { backend: 'memory' },
      '/': { backend: 'indexeddb', options: { storeName: 'rootfs' } },
    },
    strict: false,
  });
  const container = createContainer(vfs);
  populateDefaultVfs(vfs);
  globalThis[CONTAINER_KEY] = container;
  return container;
}

/** Get the container. Throws if init hasn't completed. */
export function getContainer(): ZenContainer {
  return globalThis[CONTAINER_KEY]!;
}

/** Get the VFS. Throws if init hasn't completed. */
export function getVfs(): VirtualFS {
  return getContainer()!.vfs;
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
