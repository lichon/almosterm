/**
 * Tests for ZenVFS — Virtual Filesystem backed by @zenfs/core backends
 *
 * NOTE: ZenVFS uses a global @zenfs/core configure() call, so only one
 * container can exist per test run. Tests use a shared container.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createContainer,
  validateConfig,
  resolveBackendPath,
  detectIndexedDBAvailability,
  createVfsError,
  ZenVFS,
} from '../src/fs/zen-vfs';
import type { ContainerConfig, MountConfig, ZenContainer } from '../src/fs/zen-vfs';

// ─── Shared test container ──────────────────────────────────────────────────

let vfs: ZenVFS;
let container: ZenContainer;

beforeAll(async () => {
  container = await createContainer({
    mounts: {
      '/tmp': { backend: 'memory' },
      '/node_modules': { backend: 'memory' },
    },
  });
  vfs = container.vfs;
}, 15000);

// ─── Container API match with almostnode ────────────────────────────────────

describe('createContainer API parity with almostnode', () => {
  it('should return a container with all almostnode properties', () => {
    // Verify the container has the same shape as almostnode's createContainer
    expect(container).toBeDefined();
    expect(container.vfs).toBeInstanceOf(ZenVFS);
    expect(typeof container.runtime).toBe('object');
    expect(typeof container.npm).toBe('object');
    expect(typeof container.serverBridge).toBe('object');
    expect(typeof container.execute).toBe('function');
    expect(typeof container.runFile).toBe('function');
    expect(typeof container.run).toBe('function');
    expect(typeof container.sendInput).toBe('function');
    expect(typeof container.createREPL).toBe('function');
    expect(typeof container.on).toBe('function');
  });

  it('createREPL should return an object with eval', () => {
    const repl = container.createREPL();
    expect(repl).toBeDefined();
    expect(typeof repl.eval).toBe('function');
  });
});

// ─── T008: Config validation ────────────────────────────────────────────────

describe('createContainer / validateConfig (T008)', () => {
  it('should throw on empty mounts', () => {
    expect(() => validateConfig({ mounts: {} })).toThrow('At least one mount point');
  });

  it('should throw on missing mounts', () => {
    expect(() => validateConfig({} as ContainerConfig)).toThrow('"mounts" object');
  });

  it('should throw on non-absolute mount path', () => {
    expect(() => validateConfig({ mounts: { tmp: { backend: 'memory' } } })).toThrow(
      'must be absolute',
    );
  });

  it('should throw on paths ending with / (non-root)', () => {
    expect(() =>
      validateConfig({
        mounts: { '/tmp/': { backend: 'memory' } },
      }),
    ).toThrow('must not end with /');
  });

  it('should throw on unknown backend type', () => {
    expect(() =>
      validateConfig({
        mounts: { '/x': { backend: 'unknown' } } as any,
      }),
    ).toThrow('Unknown backend');
  });

  it('should accept valid config', () => {
    const mounts = validateConfig({
      mounts: {
        '/tmp': { backend: 'memory' },
        '/data': { backend: 'indexeddb' },
      },
    });
    expect(mounts.size).toBe(2);
    expect(mounts.get('/tmp')?.backend).toBe('memory');
    expect(mounts.get('/data')?.backend).toBe('indexeddb');
  });
});

// ─── T009: Container operations ─────────────────────────────────────────────

describe('ZenVFS container operations (T009)', () => {
  it('should write and read a file on /tmp', () => {
    vfs.writeFileSync('/tmp/hello.txt', 'Hello, ZenVFS!');
    expect(vfs.existsSync('/tmp/hello.txt')).toBe(true);
    const content = vfs.readFileSync('/tmp/hello.txt', 'utf-8');
    expect(content).toBe('Hello, ZenVFS!');
  });

  it('should write and read a file on /node_modules', () => {
    vfs.writeFileSync('/node_modules/lodash/package.json', '{"name":"lodash"}');
    expect(vfs.existsSync('/node_modules/lodash/package.json')).toBe(true);
    const data = vfs.readFileSync('/node_modules/lodash/package.json', 'utf-8');
    expect(data).toBe('{"name":"lodash"}');
  });

  it('should return binary data with readFileSync without encoding', () => {
    vfs.writeFileSync('/tmp/binary.bin', new Uint8Array([0x00, 0x01, 0x02]));
    const data = vfs.readFileSync('/tmp/binary.bin');
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBe(3);
  });

  it('should throw ENOSYS on unmounted path', () => {
    expect(() => vfs.writeFileSync('/etc/config.ini', 'data')).toThrow('not backed by any mount');
    expect(vfs.existsSync('/etc/config.ini')).toBe(false);
  });

  it('should detect mounted vs unmounted paths', () => {
    expect(vfs.isMounted('/tmp/anything')).toBe(true);
    expect(vfs.isMounted('/node_modules/something')).toBe(true);
    expect(vfs.isMounted('/home/user/file')).toBe(false);
    expect(vfs.isMounted('/etc')).toBe(false);
  });

  it('should create nested directories with mkdir recursive', () => {
    vfs.mkdirSync('/tmp/nested/a/b/c', { recursive: true });
    expect(vfs.existsSync('/tmp/nested/a')).toBe(true);
    expect(vfs.existsSync('/tmp/nested/a/b')).toBe(true);
    expect(vfs.existsSync('/tmp/nested/a/b/c')).toBe(true);
  });

  it('should list directory contents', () => {
    vfs.writeFileSync('/tmp/listtest/file1.txt', 'one');
    vfs.writeFileSync('/tmp/listtest/file2.txt', 'two');
    vfs.mkdirSync('/tmp/listtest/sub', { recursive: true });
    const entries = vfs.readdirSync('/tmp/listtest');
    expect(entries).toContain('file1.txt');
    expect(entries).toContain('file2.txt');
    expect(entries).toContain('sub');
  });

  it('should delete files with unlink', () => {
    vfs.writeFileSync('/tmp/to-delete.txt', 'delete me');
    expect(vfs.existsSync('/tmp/to-delete.txt')).toBe(true);
    vfs.unlinkSync('/tmp/to-delete.txt');
    expect(vfs.existsSync('/tmp/to-delete.txt')).toBe(false);
  });

  it('should delete empty directories with rmdir', () => {
    vfs.mkdirSync('/tmp/empty-dir', { recursive: true });
    expect(vfs.existsSync('/tmp/empty-dir')).toBe(true);
    vfs.rmdirSync('/tmp/empty-dir');
    expect(vfs.existsSync('/tmp/empty-dir')).toBe(false);
  });

  it('should return file stats', () => {
    vfs.writeFileSync('/tmp/stats.txt', 'hello world');
    const stats = vfs.statSync('/tmp/stats.txt');
    expect(stats.isFile()).toBe(true);
    expect(stats.isDirectory()).toBe(false);
    expect(stats.size).toBe(11);
  });

  it('should return directory stats', () => {
    vfs.mkdirSync('/tmp/stats-dir', { recursive: true });
    const stats = vfs.statSync('/tmp/stats-dir');
    expect(stats.isDirectory()).toBe(true);
    expect(stats.isFile()).toBe(false);
  });

  it('should rename files within same mount', () => {
    vfs.writeFileSync('/tmp/old-name.txt', 'content');
    vfs.renameSync('/tmp/old-name.txt', '/tmp/new-name.txt');
    expect(vfs.existsSync('/tmp/old-name.txt')).toBe(false);
    expect(vfs.existsSync('/tmp/new-name.txt')).toBe(true);
    expect(vfs.readFileSync('/tmp/new-name.txt', 'utf-8')).toBe('content');
  });

  it('should throw on cross-mount rename', () => {
    vfs.writeFileSync('/tmp/cross.txt', 'data');
    expect(() => vfs.renameSync('/tmp/cross.txt', '/node_modules/cross.txt')).toThrow(
      'Cross-mount',
    );
  });

  it('should support async readFile with callback', () => {
    vfs.writeFileSync('/tmp/async-test.txt', 'async content');
    return new Promise<void>((resolve) => {
      vfs.readFile('/tmp/async-test.txt', (err, data) => {
        expect(err).toBeNull();
        expect(data).toBeDefined();
        resolve();
      });
    });
  });

  it('should support async stat with callback', () => {
    vfs.writeFileSync('/tmp/async-stat.txt', 'test');
    return new Promise<void>((resolve) => {
      vfs.stat('/tmp/async-stat.txt', (err, stats) => {
        expect(err).toBeNull();
        expect(stats?.isFile()).toBe(true);
        resolve();
      });
    });
  });

  it('should support async readdir with callback', () => {
    vfs.mkdirSync('/tmp/async-dir', { recursive: true });
    vfs.writeFileSync('/tmp/async-dir/file.txt', 'test');
    return new Promise<void>((resolve) => {
      vfs.readdir('/tmp/async-dir', (err, files) => {
        expect(err).toBeNull();
        expect(files).toContain('file.txt');
        resolve();
      });
    });
  });
});

// ─── T024: /tmp data integrity ──────────────────────────────────────────────

describe('/tmp data integrity (T024)', () => {
  it('should handle 1KB file', () => {
    const data = 'x'.repeat(1024);
    vfs.writeFileSync('/tmp/int-1kb.txt', data);
    expect(vfs.readFileSync('/tmp/int-1kb.txt', 'utf-8')).toBe(data);
  });

  it('should handle 100KB file', () => {
    const data = 'y'.repeat(100 * 1024);
    vfs.writeFileSync('/tmp/int-100kb.txt', data);
    expect(vfs.readFileSync('/tmp/int-100kb.txt', 'utf-8')).toBe(data);
  });

  it('should handle 1MB file', () => {
    const data = 'z'.repeat(1024 * 1024);
    vfs.writeFileSync('/tmp/int-1mb.txt', data);
    expect(vfs.readFileSync('/tmp/int-1mb.txt', 'utf-8').length).toBe(1024 * 1024);
  });

  it('should handle binary data correctly', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    vfs.writeFileSync('/tmp/int-binary.bin', bytes);
    const result = vfs.readFileSync('/tmp/int-binary.bin');
    expect(result.length).toBe(256);
    for (let i = 0; i < 256; i++) {
      expect(result[i]).toBe(i);
    }
  });
});

// ─── T025: /tmp ephemeral nature ────────────────────────────────────────────

describe('/tmp ephemeral nature (T025)', () => {
  it('should have data available during session (InMemory backend)', () => {
    vfs.writeFileSync('/tmp/ephemeral.txt', 'temporary');
    expect(vfs.existsSync('/tmp/ephemeral.txt')).toBe(true);
    expect(vfs.readFileSync('/tmp/ephemeral.txt', 'utf-8')).toBe('temporary');
    // Ephemeral nature (data lost on page reload) is inherent to InMemory backend
    // and verified via manual/quickstart testing in the browser
  });
});

// ─── T026: /tmp directory operations ────────────────────────────────────────

describe('/tmp directory operations (T026)', () => {
  it('should create deeply nested directories', () => {
    vfs.mkdirSync('/tmp/deep/nested/dir', { recursive: true });
    expect(vfs.existsSync('/tmp/deep/nested/dir')).toBe(true);
  });

  it('should list directory contents correctly', () => {
    vfs.mkdirSync('/tmp/dir-list', { recursive: true });
    vfs.writeFileSync('/tmp/dir-list/a.txt', 'a');
    vfs.writeFileSync('/tmp/dir-list/b.txt', 'b');
    vfs.mkdirSync('/tmp/dir-list/sub', { recursive: true });
    const entries = vfs.readdirSync('/tmp/dir-list');
    expect(entries.sort()).toEqual(['a.txt', 'b.txt', 'sub']);
  });

  it('should throw on rmdir of non-empty directory', () => {
    vfs.mkdirSync('/tmp/notempty', { recursive: true });
    vfs.writeFileSync('/tmp/notempty/file.txt', 'data');
    expect(() => vfs.rmdirSync('/tmp/notempty')).toThrow();
  });

  it('should handle empty file write/read', () => {
    vfs.writeFileSync('/tmp/empty-file.txt', '');
    expect(vfs.readFileSync('/tmp/empty-file.txt', 'utf-8')).toBe('');
    expect(vfs.readFileSync('/tmp/empty-file.txt').length).toBe(0);
  });
});

// ─── T029–T032: IndexedDB features ──────────────────────────────────────────

describe('IndexedDB backend features (T029-T032)', () => {
  it('T029: should be able to write/read to /node_modules (memory fallback in test)', () => {
    // Uses the shared container with memory-backed /node_modules
    vfs.writeFileSync('/node_modules/persist-lib/index.js', 'module.exports = 42;');
    expect(vfs.readFileSync('/node_modules/persist-lib/index.js', 'utf-8')).toBe(
      'module.exports = 42;',
    );
    // Actual IndexedDB persistence verified via browser quickstart tests
  });

  it('T030: detectIndexedDBAvailability returns a boolean', () => {
    const available = detectIndexedDBAvailability();
    expect(typeof available).toBe('boolean');
  });

  it('T031: strict mode validation logic is testable via config', () => {
    // strict: true is validated within createContainer.
    // In node environment, IndexedDB is typically not available,
    // but we verify the config parsing works.
    expect(() =>
      validateConfig({
        mounts: { '/data': { backend: 'indexeddb' } },
      }),
    ).not.toThrow();
  });

  it('T032: should handle many files in nested directories', () => {
    const numFiles = 100;
    const writtenPaths: string[] = [];

    for (let i = 0; i < numFiles; i++) {
      const dir = `/node_modules/pkg-${Math.floor(i / 10)}/subdir-${i % 5}`;
      const path = `${dir}/file-${i}.js`;
      vfs.mkdirSync(dir, { recursive: true });
      vfs.writeFileSync(path, `content-${i}`);
      writtenPaths.push(path);
    }

    for (const path of writtenPaths) {
      expect(vfs.existsSync(path)).toBe(true);
    }

    const topEntries = vfs.readdirSync('/node_modules');
    expect(topEntries.length).toBeGreaterThanOrEqual(10);
  });
});

// ─── Utility function tests ─────────────────────────────────────────────────

describe('utility functions', () => {
  it('resolveBackendPath should find correct mount prefix', () => {
    const mounts = new Map<string, MountConfig>([
      ['/tmp', { backend: 'memory' }],
      ['/node_modules', { backend: 'indexeddb' }],
    ]);

    expect(resolveBackendPath('/tmp/file.txt', mounts)).toBe('/tmp');
    expect(resolveBackendPath('/tmp', mounts)).toBe('/tmp');
    expect(resolveBackendPath('/node_modules/lodash/pkg', mounts)).toBe('/node_modules');
    expect(resolveBackendPath('/node_modules', mounts)).toBe('/node_modules');
    expect(resolveBackendPath('/home/user', mounts)).toBeNull();
    expect(resolveBackendPath('/', mounts)).toBeNull();
  });

  it('resolveBackendPath should prefer longest match', () => {
    const mounts = new Map<string, MountConfig>([
      ['/data', { backend: 'memory' }],
      ['/data/sub', { backend: 'memory' }],
    ]);

    expect(resolveBackendPath('/data/sub/deep', mounts)).toBe('/data/sub');
    expect(resolveBackendPath('/data/other', mounts)).toBe('/data');
  });

  it('createVfsError should create properly shaped errors', () => {
    const err = createVfsError('ENOENT', 'open', '/missing/file');
    expect(err.code).toBe('ENOENT');
    expect(err.syscall).toBe('open');
    expect(err.path).toBe('/missing/file');
    expect(err).toBeInstanceOf(Error);
  });
});
