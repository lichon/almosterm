/**
 * ZenVFS - Virtual Filesystem backed by @zenfs/core backends
 *
 * A standalone drop-in replacement for almostnode's VirtualFS that routes
 * all filesystem operations through @zenfs/core backends. Mount points
 * map path prefixes to specific storage backends:
 *   - /tmp  → InMemory  (@zenfs/core) - ephemeral, fast
 *   - /     → IndexedDB (@zenfs/dom) - persistent
 *
 */
import { configure, InMemory, fs as zenfs } from '@zenfs/core';
import { IndexedDB } from '@zenfs/dom';
import { Runtime, PackageManager, getServerBridge } from 'almostnode';
import { Stats, ContainerOptions, VirtualFS } from 'almostnode';

// ─── Type Definitions ───────────────────────────────────────────────────────

export type BackendType = 'memory' | 'indexeddb';

export interface MemoryOptions {
  maxSize?: number;
  label?: string;
}

export interface IndexedDBMountOptions {
  storeName?: string;
  label?: string;
}

export interface MountConfig {
  backend: BackendType;
  options?: MemoryOptions | IndexedDBMountOptions;
}

export interface ContainerConfig {
  mounts: Record<string, MountConfig>;
  strict?: boolean;
  containerOptions?: ContainerOptions;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function detectIndexedDBAvailability(): boolean {
  try {
    if (typeof indexedDB === 'undefined') return false;
    const req = indexedDB.open('__zenfs_test__', 1);
    let available = true;
    req.onerror = () => { available = false; };
    req.onsuccess = () => {
      req.result.close();
      try { indexedDB.deleteDatabase('__zenfs_test__'); } catch { /* ok */ }
    };
    req.onblocked = () => { available = false; };
    return available;
  } catch {
    return false;
  }
}

export function validateConfig(config: ContainerConfig): Map<string, MountConfig> {
  const mounts = new Map<string, MountConfig>();
  if (!config.mounts || typeof config.mounts !== 'object') {
    throw new Error('ContainerConfig must have a "mounts" object');
  }
  const entries = Object.entries(config.mounts);
  if (entries.length === 0) {
    throw new Error('At least one mount point is required');
  }
  const seen = new Set<string>();
  for (const [path, mc] of entries) {
    if (!path.startsWith('/')) throw new Error(`Mount path must be absolute: "${path}"`);
    if (path !== '/' && path.endsWith('/')) throw new Error(`Mount path must not end with /: "${path}"`);
    if (seen.has(path)) throw new Error(`Duplicate mount path: "${path}"`);
    seen.add(path);
    if (!mc || typeof mc !== 'object') throw new Error(`Mount config for "${path}" must be an object`);
    if (mc.backend !== 'memory' && mc.backend !== 'indexeddb') {
      throw new Error(`Unknown backend "${mc.backend}" for "${path}". Expected "memory" or "indexeddb".`);
    }
    mounts.set(path, mc as MountConfig);
  }
  return mounts;
}

// ─── ZenVFS Class ───────────────────────────────────────────────────────────

/**
 * Standalone virtual filesystem backed entirely by @zenfs/core.
 * Drop-in replacement for almostnode's VirtualFS — same public API,
 * but all operations route through configured zenfs backends.
 */
export class ZenVFS extends VirtualFS {
  private _mounts: Record<string, MountConfig>;
  private _decoder = new TextDecoder();

  constructor(mounts: Record<string, MountConfig>) {
    super();
    this._mounts = mounts;
  }

  // ── Sync filesystem operations ────────────────────────────────────────

  writeFileSync(path: string, data: string | Uint8Array): void {
    const parentPath = path.substring(0, path.lastIndexOf('/'));
    if (parentPath && parentPath !== '/') {
      if (!zenfs.existsSync(parentPath)) {
        zenfs.mkdirSync(parentPath, { recursive: true });
      }
    }
    zenfs.writeFileSync(path, data);
  }

  readFileSync(path: string): Uint8Array;
  readFileSync(path: string, encoding: 'utf8' | 'utf-8'): string;
  readFileSync(path: string, encoding?: 'utf8' | 'utf-8'): Uint8Array | string {
    if (encoding === 'utf8' || encoding === 'utf-8') {
      return this._decoder.decode(zenfs.readFileSync(path));
    }
    return zenfs.readFileSync(path);
  }

  existsSync(path: string): boolean {
    return zenfs.existsSync(path);
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    zenfs.mkdirSync(path, options);
  }

  readdirSync(path: string): string[] {
    return zenfs.readdirSync(path);
  }

  unlinkSync(path: string): void {
    zenfs.unlinkSync(path);
  }

  rmdirSync(path: string): void {
    zenfs.rmdirSync(path);
  }

  statSync(path: string): Stats {
    const s = zenfs.statSync(path);
    return {
      isFile: () => s.isFile(),
      isDirectory: () => s.isDirectory(),
      isSymbolicLink: () => s.isSymbolicLink?.() ?? false,
      isBlockDevice: () => s.isBlockDevice?.() ?? false,
      isCharacterDevice: () => s.isCharacterDevice?.() ?? false,
      isFIFO: () => s.isFIFO?.() ?? false,
      isSocket: () => s.isSocket?.() ?? false,
      size: s.size,
      mode: s.mode ?? 0,
      mtime: s.mtime ?? new Date(),
      atime: s.atime ?? new Date(),
      ctime: s.ctime ?? new Date(),
      birthtime: s.birthtime ?? new Date(),
      mtimeMs: s.mtimeMs ?? 0,
      atimeMs: s.atimeMs ?? 0,
      ctimeMs: s.ctimeMs ?? 0,
      birthtimeMs: s.birthtimeMs ?? 0,
      nlink: s.nlink ?? 1,
      uid: s.uid ?? 0,
      gid: s.gid ?? 0,
      dev: s.dev ?? 0,
      ino: s.ino ?? 0,
      rdev: s.rdev ?? 0,
      blksize: s.blksize ?? 4096,
      blocks: s.blocks ?? Math.ceil((s.size ?? 0) / 512),
    } as Stats;
  }

  lstatSync(path: string): Stats {
    return this.statSync(path);
  }

  renameSync(oldPath: string, newPath: string): void {
    zenfs.renameSync(oldPath, newPath);
  }

  // ── Snapshot (for persistence/export) ─────────────────────────────────

  toSnapshot(): { version: number; files: { path: string; type: 'file' | 'directory'; content?: string; size?: number }[] } {
    const files: { path: string; type: 'file' | 'directory'; content?: string; size?: number }[] = [];
    const collect = (dir: string) => {
      try {
        for (const entry of this.readdirSync(dir)) {
          const fp = dir === '/' ? `/${entry}` : `${dir}/${entry}`;
          try {
            const st = this.statSync(fp);
            if (st.isDirectory()) {
              files.push({ path: fp, type: 'directory' });
              collect(fp);
            } else {
              const content = this.readFileSync(fp, 'utf-8');
              files.push({ path: fp, type: 'file', content, size: st.size });
            }
          } catch { /* skip inaccessible */ }
        }
      } catch { /* skip inaccessible dirs */ }
    };

    // Start from each mount root
    for (const mountPath of Object.keys(this._mounts)) {
      if (this.existsSync(mountPath)) {
        files.push({ path: mountPath, type: 'directory' });
        collect(mountPath);
      }
    }
    return { version: 2, files };
  }
}

// ─── Container type ─────────────────────────────────────────────────────────

export type ZenContainer = {
  vfs: VirtualFS;
  runtime: Awaited<ReturnType<typeof import('almostnode').createContainer>>['runtime'];
  npm: Awaited<ReturnType<typeof import('almostnode').createContainer>>['npm'];
  serverBridge: Awaited<ReturnType<typeof import('almostnode').createContainer>>['serverBridge'];
  execute: (code: string, filename?: string) => { exports: unknown };
  runFile: (filename: string) => { exports: unknown };
  run: (command: string, options?: Record<string, unknown>) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  sendInput: (data: string) => void;
  createREPL: () => { eval: (code: string) => unknown };
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

// ─── configureZenFS ─────────────────────────────────────────────────────────

/**
 * Build the mount table and call @zenfs/core configure().
 * Idempotent: if backends are already configured the call is skipped.
 */
export async function configureZenFS(config: ContainerConfig): Promise<ZenVFS> {
  const mounts = validateConfig(config);
  const zenfsMounts: Record<string, any> = {};
  const strict = config.strict ?? false;

  for (const [mountPath, mountConfig] of mounts) {
    if (mountConfig.backend === 'memory') {
      const opts = (mountConfig.options as MemoryOptions) || {};
      zenfsMounts[mountPath] = (opts.maxSize || opts.label)
        ? { backend: InMemory, maxSize: opts.maxSize, label: opts.label }
        : InMemory;
    } else if (mountConfig.backend === 'indexeddb') {
      if (!detectIndexedDBAvailability()) {
        if (strict) {
          throw new Error('IndexedDB is not available. Set strict: false to fall back to in-memory storage.');
        }
        console.warn(`[ZenVFS] IndexedDB unavailable. Mount "${mountPath}" uses in-memory fallback (data will not persist).`);
        zenfsMounts[mountPath] = InMemory;
      } else {
        const opts = (mountConfig.options as IndexedDBMountOptions) || {};
        zenfsMounts[mountPath] = { backend: IndexedDB, storeName: opts.storeName || 'zenfs-node-modules' };
      }
    }
  }

  try {
    await configure({ mounts: zenfsMounts, disableAccessChecks: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already in use')) {
      // Mounts already configured (e.g., HMR). Continue.
    } else {
      throw new Error(`Failed to configure ZenFS: ${msg}`);
    }
  }

  return new ZenVFS(zenfsMounts);
}

// ─── createContainer ────────────────────────────────────────────────────────

/** Build a container synchronously. Call configureZenFS() first. */
export function createContainer(vfs: VirtualFS, opts?: ContainerOptions): ZenContainer {
  // Build the container from scratch — all pieces get the ZenVFS directly.
  const runtime = new Runtime(vfs, opts);
  const npm = new PackageManager(vfs);
  const serverBridge = getServerBridge({
    baseUrl: opts?.baseUrl,
    onServerReady: opts?.onServerReady,
  });

  return {
    vfs,
    runtime,
    npm,
    serverBridge,
    execute: (code, filename) => runtime.execute(code, filename),
    runFile: (filename) => runtime.runFile(filename),
    run: async (_command, _runOptions?) => ({ stdout: '', stderr: '', exitCode: 0 }),
    sendInput: (_data) => {},
    createREPL: () => runtime.createREPL(),
    on: (event, listener) => { serverBridge.on(event, listener); },
  };
}
