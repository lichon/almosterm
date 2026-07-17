import { useCallback } from 'react';
import { Bash } from 'just-bash';
import type { BashExecResult, ExecOptions, IFileSystem, InitialFiles, FsStat, BufferEncoding, CustomCommand } from 'just-bash';
import type { VirtualFS } from 'almostnode';
import { getVfs } from '../fs/configure';
import { cmdv } from '../tools/cmdv';
import { node } from '../tools/node';
import { npm } from '../tools/npm';
import { reload } from '../tools/reload';

// ---------------------------------------------------------------------------
// VfsToJustBashAdapter — bridges almostnode's sync VirtualFS to just-bash's
// async IFileSystem so a single VFS backs all shell operations.
// ---------------------------------------------------------------------------

class VfsToJustBashAdapter implements IFileSystem {
  constructor(private vfs: VirtualFS) {}

  async readFile(path: string, _options?: { encoding?: BufferEncoding | null } | BufferEncoding): Promise<string> {
    return this.vfs.readFileSync(path, 'utf-8') as string;
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    return this.vfs.readFileSync(path) as Uint8Array;
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    this.vfs.writeFileSync(path, content);
  }

  async appendFile(path: string, content: string | Uint8Array): Promise<void> {
    const existing = this.vfs.existsSync(path)
      ? this.vfs.readFileSync(path)
      : new Uint8Array(0);
    const chunk = typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content;
    const merged = new Uint8Array(existing.length + chunk.length);
    merged.set(existing, 0);
    merged.set(chunk, existing.length);
    this.vfs.writeFileSync(path, merged);
  }

  async exists(path: string): Promise<boolean> {
    return this.vfs.existsSync(path);
  }

  async stat(path: string): Promise<FsStat> {
    const s = this.vfs.statSync(path);
    return {
      isFile: s.isFile(),
      isDirectory: s.isDirectory(),
      isSymbolicLink: s.isSymbolicLink?.() ?? false,
      mode: s.mode ?? 0o644,
      size: s.size,
      mtime: s.mtime ?? new Date(),
    };
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.vfs.mkdirSync(path, options);
  }

  async readdir(path: string): Promise<string[]> {
    return this.vfs.readdirSync(path);
  }

  async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    if (!this.vfs.existsSync(path)) {
      if (options?.force) return;
      throw new Error(`ENOENT: no such file or directory: ${path}`);
    }
    const stat = this.vfs.statSync(path);
    if (stat.isDirectory()) {
      if (options?.recursive) {
        for (const entry of this.vfs.readdirSync(path)) {
          const child = path === '/' ? `/${entry}` : `${path}/${entry}`;
          await this.rm(child, { recursive: true, force: true });
        }
      }
      this.vfs.rmdirSync(path);
    } else {
      this.vfs.unlinkSync(path);
    }
  }

  async cp(src: string, dest: string, options?: { recursive?: boolean }): Promise<void> {
    const srcStat = this.vfs.statSync(src);
    if (srcStat.isDirectory()) {
      if (!options?.recursive) throw new Error(`EISDIR: ${src} is a directory`);
      if (!this.vfs.existsSync(dest)) this.vfs.mkdirSync(dest, { recursive: true });
      for (const entry of this.vfs.readdirSync(src)) {
        const srcChild = src === '/' ? `/${entry}` : `${src}/${entry}`;
        const destChild = dest === '/' ? `/${entry}` : `${dest}/${entry}`;
        await this.cp(srcChild, destChild, { recursive: true });
      }
    } else {
      this.vfs.copyFileSync(src, dest);
    }
  }

  async mv(src: string, dest: string): Promise<void> {
    this.vfs.renameSync(src, dest);
  }

  resolvePath(base: string, relative: string): string {
    if (relative.startsWith('/')) return relative;
    const baseClean = base.endsWith('/') ? base.slice(0, -1) : base;
    const segments = (baseClean + '/' + relative).split('/').filter(Boolean);
    const resolved: string[] = [];
    for (const seg of segments) {
      if (seg === '.') continue;
      if (seg === '..') { resolved.pop(); continue; }
      resolved.push(seg);
    }
    return '/' + resolved.join('/');
  }

  getAllPaths(): string[] {
    const paths: string[] = [];
    const collect = (dir: string) => {
      if (!this.vfs.existsSync(dir)) return;
      for (const entry of this.vfs.readdirSync(dir)) {
        const fp = dir === '/' ? `/${entry}` : `${dir}/${entry}`;
        paths.push(fp);
        try { if (this.vfs.statSync(fp).isDirectory()) collect(fp); } catch {}
      }
    };
    collect('/');
    return paths;
  }

  async chmod(_path: string, _mode: number): Promise<void> { /* no-op */ }
  async symlink(_target: string, _linkPath: string): Promise<void> { throw new Error('symlink not supported'); }
  async link(_existingPath: string, _newPath: string): Promise<void> { throw new Error('hard links not supported'); }
  async readlink(_path: string): Promise<string> { throw new Error('symlink not supported'); }
  async lstat(path: string): Promise<FsStat> { return this.stat(path); }
  async realpath(path: string): Promise<string> { return this.resolvePath('/', path); }
  async utimes(_path: string, _atime: Date, _mtime: Date): Promise<void> { /* no-op */ }
}

// ---------------------------------------------------------------------------
// Module-level singletons
// ---------------------------------------------------------------------------

let _bashInstance: Bash | null = null;
let _vfsAdapter: VfsToJustBashAdapter | null = null;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Creates (or returns) a single Bash instance wired to almostnode's VirtualFS.
 *
 * The instance and its VFS adapter are true singletons — regardless of how
 * many components call this hook, only one Bash / one adapter is ever created.
 * Options only take effect on the first call.
 *
 * @example
 *   const { bash, exec } = useJustBash();
 *   const result = await exec('ls -la');
 */
export function useJustBash(options?: {
  /** Initial files merged on top of defaults */
  files?: InitialFiles;
  /** Override filesystem (defaults to almostnode VirtualFS adapter) */
  fs?: IFileSystem;
  /** Extra custom commands (cmdv is always registered) */
  customCommands?: CustomCommand[];
  /** Initial environment variables (e.g. { HOME: '/home/user' }) */
  env?: Record<string, string>;
  /** Starting working directory */
  cwd?: string;
}) {
  // Lazy-init the VFS adapter singleton
  if (!_vfsAdapter) {
    _vfsAdapter = new VfsToJustBashAdapter(getVfs());
  }

  // Lazy-init the Bash singleton (uses VFS adapter + cmdv by default)
  if (!_bashInstance) {
    _bashInstance = new Bash({
      files: options?.files,
      fs: options?.fs ?? _vfsAdapter,
      customCommands: [cmdv, node, npm, reload, ...(options?.customCommands ?? [])],
      env: options?.env ?? { sdf: 'sdf' },
      cwd: options?.cwd ?? '/home/user',
    });
  }

  /** Execute a command string against the shared Bash instance */
  const exec = useCallback(
    (command: string, execOptions?: ExecOptions): Promise<BashExecResult> => {
      return _bashInstance!.exec(command, execOptions);
    },
    [],
  );

  return {
    /** The underlying just-bash Bash instance */
    bash: _bashInstance,
    /** Convenience wrapper around bash.exec() */
    exec,
  };
}

export type { BashExecResult, ExecOptions };
