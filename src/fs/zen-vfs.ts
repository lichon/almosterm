/**
 * ZenVFS - Virtual Filesystem backed by @zenfs/core backends
 *
 * A standalone drop-in replacement for almostnode's VirtualFS that routes
 * all filesystem operations through @zenfs/core backends. Mount points
 * map path prefixes to specific storage backends:
 *   - /tmp  → InMemory  (@zenfs/core) - ephemeral, fast
 *   - /node_modules → IndexedDB (@zenfs/dom) - persistent
 *
 * Paths not matching any mount throw ENOSYS.
 */
import { configure, configureSync, InMemory, fs as zenfs } from '@zenfs/core';
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

// ─── Error Definitions ──────────────────────────────────────────────────────

export const ERROR_CODES = {
  NOT_FOUND: 'ENOENT',
  NOT_DIR: 'ENOTDIR',
  IS_DIR: 'EISDIR',
  EXISTS: 'EEXIST',
  NOT_EMPTY: 'ENOTEMPTY',
  NOT_SUPPORTED: 'ENOSYS',
  NO_SPACE: 'ENOSPC',
  NO_DEVICE: 'ENODEV',
} as const;

export interface VfsError extends Error {
  code: string;
  errno: number;
  syscall: string;
  path?: string;
}

export function createVfsError(
  code: string,
  syscall: string,
  path?: string,
  message?: string,
): VfsError {
  const err = new Error(message || `${code}: ${syscall} ${path || ''}`) as VfsError;
  err.code = code;
  err.errno = -1;
  err.syscall = syscall;
  if (path !== undefined) err.path = path;
  return err;
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

export function resolveBackendPath(
  path: string,
  mounts: Map<string, MountConfig>,
): string | null {
  const normalized = path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
  let bestMatch: string | null = null;
  let bestLength = 0;

  for (const mountPath of mounts.keys()) {
    const prefix = mountPath.endsWith('/') && mountPath !== '/' ? mountPath.slice(0, -1) : mountPath;
    // Root mount matches everything
    if (prefix === '/') {
      if (1 > bestLength) { bestLength = 1; bestMatch = mountPath; }
      continue;
    }
    if (normalized === prefix || normalized.startsWith(prefix + '/')) {
      if (prefix.length > bestLength) {
        bestLength = prefix.length;
        bestMatch = mountPath;
      }
    }
  }
  return bestMatch;
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

/** Ensure a path is mounted, throw ENOSYS if not */
function _requireMounted(mounts: Map<string, MountConfig>, path: string, syscall: string): void {
  if (!resolveBackendPath(path, mounts)) {
    throw createVfsError(ERROR_CODES.NOT_SUPPORTED, syscall, path, `Path not backed by any mount: "${path}"`);
  }
}

// ─── ZenVFS Class ───────────────────────────────────────────────────────────

let _globalConfigured = false;

/**
 * Standalone virtual filesystem backed entirely by @zenfs/core.
 * Drop-in replacement for almostnode's VirtualFS — same public API,
 * but all operations route through configured zenfs backends.
 * Paths not matching any mount throw ENOSYS.
 */
export class ZenVFS extends VirtualFS {
  private _mounts: Map<string, MountConfig>;

  // Event system (VirtualFS-compatible)
  private _listeners: Map<string, Set<(...args: any[]) => void>> = new Map();
  private _watchers: Map<string, Set<{ listener: (...args: any[]) => void }>> = new Map();

  constructor(mounts: Map<string, MountConfig>) {
    super();
    this._mounts = mounts;
  }

  // ── Event API (VirtualFS-compatible) ──────────────────────────────────

  on(event: string, listener: (...args: any[]) => void): this {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(listener);
    return this;
  }

  off(event: string, listener: (...args: any[]) => void): this {
    this._listeners.get(event)?.delete(listener);
    return this;
  }

  private _emit(event: string, ...args: any[]): void {
    this._listeners.get(event)?.forEach(fn => fn(...args));
  }

  // ── Error wrapping ────────────────────────────────────────────────────

  private _wrap(err: unknown, syscall: string, path: string): VfsError {
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code?: string; message?: string };
      return createVfsError(e.code || 'ENOSYS', syscall, path, e.message);
    }
    return createVfsError('ENOSYS', syscall, path, err instanceof Error ? err.message : String(err));
  }

  // ── Mount check ───────────────────────────────────────────────────────

  /** Check if a path is handled by a configured backend */
  isMounted(path: string): boolean {
    return resolveBackendPath(path, this._mounts) !== null;
  }

  // ── Sync filesystem operations ────────────────────────────────────────

  writeFileSync(path: string, data: string | Uint8Array): void {
    _requireMounted(this._mounts, path, 'write');
    try {
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      if (parentPath && parentPath !== '/') {
        if (!(zenfs as any).existsSync(parentPath)) {
          try { (zenfs as any).mkdirSync(parentPath, { recursive: true }); } catch { /* ok */ }
        }
      }
      (zenfs as any).writeFileSync(path, data);
    } catch (err) {
      throw this._wrap(err, 'write', path);
    }
  }

  readFileSync(path: string): Uint8Array;
  readFileSync(path: string, encoding: 'utf8' | 'utf-8'): string;
  readFileSync(path: string, encoding?: 'utf8' | 'utf-8'): Uint8Array | string {
    _requireMounted(this._mounts, path, 'read');
    try {
      if (encoding === 'utf8' || encoding === 'utf-8') {
        return (zenfs as any).readFileSync(path, encoding);
      }
      return (zenfs as any).readFileSync(path);
    } catch (err) {
      throw this._wrap(err, 'read', path);
    }
  }

  existsSync(path: string): boolean {
    if (!this.isMounted(path)) return false;
    try {
      return (zenfs as any).existsSync(path);
    } catch {
      return false;
    }
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    _requireMounted(this._mounts, path, 'mkdir');
    try {
      (zenfs as any).mkdirSync(path, options);
    } catch (err) {
      throw this._wrap(err, 'mkdir', path);
    }
  }

  readdirSync(path: string): string[] {
    _requireMounted(this._mounts, path, 'readdir');
    try {
      return (zenfs as any).readdirSync(path) as string[];
    } catch (err) {
      throw this._wrap(err, 'readdir', path);
    }
  }

  unlinkSync(path: string): void {
    _requireMounted(this._mounts, path, 'unlink');
    try {
      (zenfs as any).unlinkSync(path);
    } catch (err) {
      throw this._wrap(err, 'unlink', path);
    }
  }

  rmdirSync(path: string): void {
    _requireMounted(this._mounts, path, 'rmdir');
    try {
      (zenfs as any).rmdirSync(path);
    } catch (err) {
      throw this._wrap(err, 'rmdir', path);
    }
  }

  statSync(path: string): Stats {
    _requireMounted(this._mounts, path, 'stat');
    try {
      const s = (zenfs as any).statSync(path);
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
    } catch (err) {
      throw this._wrap(err, 'stat', path);
    }
  }

  lstatSync(path: string): Stats {
    return this.statSync(path);
  }

  renameSync(oldPath: string, newPath: string): void {
    const oldPrefix = resolveBackendPath(oldPath, this._mounts);
    const newPrefix = resolveBackendPath(newPath, this._mounts);
    if (!oldPrefix || !newPrefix) {
      throw createVfsError(ERROR_CODES.NOT_SUPPORTED, 'rename', oldPath, 'Both paths must be mounted');
    }
    if (oldPrefix !== newPrefix) {
      throw createVfsError(ERROR_CODES.NOT_SUPPORTED, 'rename', oldPath, `Cross-mount rename: "${oldPath}" → "${newPath}"`);
    }
    try {
      (zenfs as any).renameSync(oldPath, newPath);
    } catch (err) {
      throw this._wrap(err, 'rename', oldPath);
    }
  }

  realpathSync(path: string): string {
    // Normalize: resolve . and ..
    const segments = path.split('/').filter(Boolean);
    const resolved: string[] = [];
    for (const seg of segments) {
      if (seg === '.') continue;
      if (seg === '..') { resolved.pop(); continue; }
      resolved.push(seg);
    }
    return '/' + resolved.join('/');
  }

  accessSync(path: string, _mode?: number): void {
    if (!this.existsSync(path)) {
      throw createVfsError(ERROR_CODES.NOT_FOUND, 'access', path);
    }
  }

  copyFileSync(src: string, dest: string): void {
    _requireMounted(this._mounts, src, 'copyFile');
    _requireMounted(this._mounts, dest, 'copyFile');
    try {
      const data = this.readFileSync(src);
      this.writeFileSync(dest, data);
    } catch (err) {
      throw this._wrap(err, 'copyFile', src);
    }
  }

  // ── Async operations (callback-based, VirtualFS-compatible) ───────────

  readFile(
    path: string,
    optionsOrCallback?: { encoding?: string } | ((err: Error | null, data?: Uint8Array | string) => void),
    callback?: (err: Error | null, data?: Uint8Array | string) => void,
  ): void {
    const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
    if (!cb) return;
    try {
      const data = this.readFileSync(path);
      cb(null, data);
    } catch (err) {
      cb(this._wrap(err, 'read', path));
    }
  }

  stat(path: string, callback: (err: Error | null, stats?: Stats) => void): void {
    try {
      callback(null, this.statSync(path));
    } catch (err) {
      callback(this._wrap(err, 'stat', path));
    }
  }

  lstat(path: string, callback: (err: Error | null, stats?: Stats) => void): void {
    this.stat(path, callback);
  }

  readdir(
    path: string,
    optionsOrCallback?: { withFileTypes?: boolean } | ((err: Error | null, files?: string[]) => void),
    callback?: (err: Error | null, files?: string[]) => void,
  ): void {
    const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
    if (!cb) return;
    try {
      cb(null, this.readdirSync(path));
    } catch (err) {
      cb(this._wrap(err, 'readdir', path));
    }
  }

  access(
    path: string,
    modeOrCallback?: number | ((err: Error | null) => void),
    callback?: (err: Error | null) => void,
  ): void {
    const cb = typeof modeOrCallback === 'function' ? modeOrCallback : callback;
    if (!cb) return;
    try {
      this.accessSync(path);
      cb(null);
    } catch (err) {
      cb(err as Error);
    }
  }

  realpath(path: string, callback: (err: Error | null, resolved?: string) => void): void {
    try {
      callback(null, this.realpathSync(path));
    } catch (err) {
      callback(err as Error);
    }
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
    for (const mountPath of this._mounts.keys()) {
      if (this.existsSync(mountPath)) {
        files.push({ path: mountPath, type: 'directory' });
        collect(mountPath);
      }
    }
    return { version: 2, files };
  }

  // ── Stream stubs (VirtualFS-compatible) ───────────────────────────────

  createReadStream(_path: string): { on(event: string, cb: (...args: unknown[]) => void): unknown; pipe(dest: unknown): unknown } {
    return {
      on: (event: string, cb: (...args: unknown[]) => void) => this,
      pipe: (dest: unknown) => this,
    };
  }

  createWriteStream(path: string) {
    const chunks: (string | Uint8Array)[] = [];
    const self = this;
    return {
      write(data: string | Uint8Array): boolean { chunks.push(data); return true; },
      end(data?: string | Uint8Array) {
        if (data !== undefined) chunks.push(data);
        self.writeFileSync(path, chunks.map(c => typeof c === 'string' ? c : new TextDecoder().decode(c)).join(''));
      },
      on(_event: string, _cb: (...args: unknown[]) => void) { return this; },
    };
  }

  // ── Watch (VirtualFS-compatible noop) ─────────────────────────────────

  watch(
    _filename: string,
    _optionsOrListener?: any,
    _listener?: any,
  ): { close(): void; ref(): any; unref(): any } {
    return { close() {}, ref() { return this; }, unref() { return this; } };
  }
}

// ─── Container type ─────────────────────────────────────────────────────────

export type ZenContainer = {
  vfs: ZenVFS;
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

// ─── createContainer ────────────────────────────────────────────────────────

export async function createContainer(config: ContainerConfig): Promise<ZenContainer> {
  if (_globalConfigured) {
    throw new Error('Global ZenFS is already configured. Only one container can be created per session.');
  }

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

  _globalConfigured = true;

  // Build the container from scratch — all pieces get the ZenVFS directly.
  const vfs = new ZenVFS(mounts);
  const runtime = new Runtime(vfs as unknown as VirtualFS, config.containerOptions);
  const npm = new PackageManager(vfs as unknown as VirtualFS);
  const serverBridge = getServerBridge({
    baseUrl: config.containerOptions?.baseUrl,
    onServerReady: config.containerOptions?.onServerReady,
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

export function isConfigured(): boolean {
  return _globalConfigured;
}

export function _resetGlobalState(): void {
  _globalConfigured = false;
}
