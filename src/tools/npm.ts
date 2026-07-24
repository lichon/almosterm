import { defineCommand } from 'just-bash';
import { PackageManager } from 'almostnode';
import pako from 'pako';
import { getContainer, getVfs } from '../fs/configure';
import { useVfsStore } from '../store/vfsStore';
import { writeTerm } from '../utils';

/**
 * npm — run npm commands against the VirtualFS using PackageManager.
 *
 * Supported subcommands:
 *   install <pkg>     install a package or tarball URL via PackageManager
 *   install           install all deps from package.json
 *   i                 alias for install
 *   ls / list         list installed packages
 *   run <script>      run an npm script via node
 *   init              initialize a new package.json
 *
 * Tarball URLs (https://...*.tgz) are supported — downloaded, extracted,
 * and placed in node_modules/<name>/ automatically.
 *
 * Output is streamed in real-time to the terminal.
 */
export const npm = defineCommand('npm', async (args, ctx) => {
  if (args.length === 0) {
    return { stdout: '', stderr: 'npm: missing command\nUsage: npm <command> [args...]\n', exitCode: 1 };
  }

  const subcommand = args[0];
  const rest = args.slice(1);
  const container = getContainer();
  const vfs = getVfs();
  const store = useVfsStore.getState();
  const npmRegistry = store.npmRegistry;
  const hasCurlProxy = store.capabilities.includes('curl-proxy');
  const pm = new PackageManager(vfs, { cwd: ctx.cwd, registry: npmRegistry });

  // ---- install / i ----
  if (subcommand === 'install' || subcommand === 'i') {
    try {
      if (rest.length > 0) {
        // npm install <package> — install a single package or tarball URL
        const pkgSpec = rest[0];

        if (isTarballUrl(pkgSpec)) {
          // Install from HTTPS tarball URL directly
          const pkgName = await installFromTarballUrl(pkgSpec, vfs, ctx.cwd, hasCurlProxy, {
            onProgress: (msg) => writeTerm(`  ${msg}\r\n`),
          });
          writeTerm(`npm: installed ${pkgName} from tarball\r\n`);
        } else {
          writeTerm(`npm: installing ${pkgSpec}...\r\n`);

          await pm.install(pkgSpec, {
            onProgress: (msg) => {
              writeTerm(`  ${msg}\r\n`);
            },
          });

          writeTerm(`npm: installed ${pkgSpec}\r\n`);
        }
      } else {
        // npm install — install from package.json
        writeTerm(`npm: installing from package.json...\r\n`);

        await pm.installFromPackageJson({
          onProgress: (msg) => {
            writeTerm(`  ${msg}\r\n`);
          },
        });

        writeTerm(`npm: dependencies installed\r\n`);
      }

      return { stdout: '', stderr: '', exitCode: 0 };
    } catch (err: any) {
      return { stdout: '', stderr: `npm ${subcommand}: ${err.message}\n`, exitCode: 1 };
    }
  }

  // ---- ls / list ----
  if (subcommand === 'ls' || subcommand === 'list') {
    try {
      const packages = pm.list();
      const names = Object.keys(packages);

      if (names.length === 0) {
        writeTerm('(empty)\r\n');
      } else {
        for (const name of names.sort()) {
          writeTerm(`${name}@${packages[name]}\r\n`);
        }
      }

      return { stdout: '', stderr: '', exitCode: 0 };
    } catch (err: any) {
      return { stdout: '', stderr: `npm ${subcommand}: ${err.message}\n`, exitCode: 1 };
    }
  }

  // ---- run ----
  if (subcommand === 'run') {
    if (rest.length === 0) {
      return { stdout: '', stderr: 'npm run: missing script name\n', exitCode: 1 };
    }

    const scriptName = rest[0];
    const scriptArgs = rest.slice(1);

    // Read package.json to find the script
    try {
      const pkgJsonPath = ctx.cwd.endsWith('/')
        ? `${ctx.cwd}package.json`
        : `${ctx.cwd}/package.json`;

      if (!vfs.existsSync(pkgJsonPath)) {
        return { stdout: '', stderr: `npm run: no package.json found in ${ctx.cwd}\n`, exitCode: 1 };
      }

      const raw = vfs.readFileSync(pkgJsonPath, 'utf-8') as string;
      const pkgJson = JSON.parse(raw);

      if (!pkgJson.scripts || !pkgJson.scripts[scriptName]) {
        return {
          stdout: '',
          stderr: `npm run: script "${scriptName}" not found in package.json\n`,
          exitCode: 1,
        };
      }

      const scriptCmd = pkgJson.scripts[scriptName];
      writeTerm(`npm: running ${scriptName}...\r\n\r\n`);

      let streamedStdout = '';
      let streamedStderr = '';

      const result = await container.run(
        `${scriptCmd} ${scriptArgs.join(' ')}`,
        {
          cwd: ctx.cwd,
          onStdout: (data: string) => {
            streamedStdout += data;
            writeTerm(data);
          },
          onStderr: (data: string) => {
            streamedStderr += data;
            writeTerm(data, 'stderr');
          },
        },
      );

      return {
        stdout: result.stdout.slice(streamedStdout.length),
        stderr: result.stderr.slice(streamedStderr.length),
        exitCode: result.exitCode,
      };
    } catch (err: any) {
      return { stdout: '', stderr: `npm run: ${err.message}\n`, exitCode: 1 };
    }
  }

  // ---- init ----
  if (subcommand === 'init') {
    try {
      const pkgJsonPath = ctx.cwd.endsWith('/')
        ? `${ctx.cwd}package.json`
        : `${ctx.cwd}/package.json`;

      if (vfs.existsSync(pkgJsonPath)) {
        return { stdout: '', stderr: `npm init: package.json already exists\n`, exitCode: 1 };
      }

      const pkgJson = JSON.stringify({
        name: 'my-project',
        version: '1.0.0',
        private: true,
        scripts: {},
      }, null, 2);

      vfs.writeFileSync(pkgJsonPath, pkgJson);
      writeTerm('package.json created\r\n');

      return { stdout: '', stderr: '', exitCode: 0 };
    } catch (err: any) {
      return { stdout: '', stderr: `npm init: ${err.message}\n`, exitCode: 1 };
    }
  }

  // ---- fallback: unsupported ----
  return {
    stdout: '',
    stderr: `npm: unsupported subcommand "${subcommand}"\nSupported: install, i, ls, list, run, init\n`,
    exitCode: 1,
  };
});

// ---------------------------------------------------------------------------
// Tarball URL helpers
// ---------------------------------------------------------------------------

/** Treat any https:// URL as a tarball URL when passed to npm install. */
function isTarballUrl(spec: string): boolean {
  return /^https?:\/\//i.test(spec);
}

/** Tar entry parsed from raw bytes. */
interface TarEntry {
  name: string;
  type: 'file' | 'directory';
  content?: Uint8Array;
}

/**
 * Generator that yields each entry in a tar archive (uncompressed).
 * npm tarballs contain a single top-level `package/` directory.
 */
function* parseTarEntries(data: Uint8Array): Generator<TarEntry> {
  let offset = 0;
  while (offset < data.length - 512) {
    const header = data.slice(offset, offset + 512);
    offset += 512;

    // Two consecutive zero blocks signal end-of-archive
    if (header.every((b) => b === 0)) break;

    // Parse header fields
    const name = decodeTarStr(header, 0, 100);
    if (!name) continue;
    const size = parseTarOctal(header, 124, 12);
    const typeFlag = String.fromCharCode(header[156]);
    const prefix = decodeTarStr(header, 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;

    let type: 'file' | 'directory';
    if (typeFlag === '5') {
      type = 'directory';
    } else {
      type = 'file';
    }

    let content: Uint8Array | undefined;
    if (type === 'file') {
      content = size > 0 ? data.slice(offset, offset + size) : new Uint8Array(0);
      if (size > 0) {
        offset += Math.ceil(size / 512) * 512;
      }
    }

    yield { name: fullName, type, content };
  }
}

/** Extract a null-terminated string from a fixed-width tar header field. */
function decodeTarStr(data: Uint8Array, offset: number, length: number): string {
  const bytes = data.slice(offset, offset + length);
  const nullIdx = bytes.indexOf(0);
  const str = nullIdx >= 0 ? bytes.slice(0, nullIdx) : bytes;
  return new TextDecoder().decode(str);
}

/** Parse an octal number from a tar header field. */
function parseTarOctal(data: Uint8Array, offset: number, length: number): number {
  return parseInt(decodeTarStr(data, offset, length).trim(), 8) || 0;
}

/**
 * Download an HTTPS tarball URL, extract it into node_modules/<name>/,
 * and return the package name discovered from its package.json.
 */
async function installFromTarballUrl(
  url: string,
  vfs: ReturnType<typeof getVfs>,
  cwd: string,
  hasCurlProxy: boolean,
  opts: { onProgress?: (msg: string) => void } = {},
): Promise<string> {
  const { onProgress } = opts;

  // 1. Download — route through Worker proxy when available to bypass CORS
  const fetchUrl = hasCurlProxy
    ? `/api/curl?url=${encodeURIComponent(url)}`
    : url;

  onProgress?.(`Downloading ${url}...`);
  const response = await fetch(fetchUrl, { redirect: 'follow' });

  // Report redirects so the user knows where the final content comes from
  if (response.redirected && response.url !== url) {
    onProgress?.(`Redirected to ${response.url}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to download tarball: ${response.status} ${response.statusText}`);
  }
  const raw = await response.arrayBuffer();

  // 2. Decompress gzip
  onProgress?.('Decompressing...');
  const tarData = pako.inflate(new Uint8Array(raw));

  // 3. Extract to a temporary directory while we discover the package name
  const tmpDir = '/tmp/_npm-tarball-' + Date.now();
  const extractedFiles: string[] = [];

  for (const entry of parseTarEntries(tarData)) {
    if (entry.type !== 'file' && entry.type !== 'directory') continue;

    // Strip the leading 'package/' component that npm tarballs always have
    const parts = entry.name.split('/').filter(Boolean);
    if (parts.length <= 1) continue; // skip 'package/' directory itself
    const relPath = parts.slice(1).join('/');

    if (entry.type === 'directory') {
      vfs.mkdirSync(tmpDir + '/' + relPath, { recursive: true });
    } else if (entry.type === 'file' && entry.content) {
      const fullPath = tmpDir + '/' + relPath;
      vfs.mkdirSync(tmpDir, { recursive: true });
      const parent = fullPath.includes('/') ? fullPath.slice(0, fullPath.lastIndexOf('/')) : tmpDir;
      vfs.mkdirSync(parent, { recursive: true });
      vfs.writeFileSync(fullPath, entry.content);
      extractedFiles.push(fullPath);
    }
  }

  onProgress?.(`Extracted ${extractedFiles.length} files`);

  // 4. Read package.json to discover the package name
  const pkgJsonPath = tmpDir + '/package.json';
  if (!vfs.existsSync(pkgJsonPath)) {
    throw new Error('Tarball does not contain a package.json');
  }
  const pkgJson = JSON.parse(vfs.readFileSync(pkgJsonPath, 'utf8') as string);
  const pkgName: string = pkgJson.name;
  if (!pkgName) {
    throw new Error('package.json is missing the "name" field');
  }

  // 5. Move the extracted package into node_modules/<name>/
  const nodeModulesPath = (cwd.endsWith('/') ? cwd : cwd + '/') + 'node_modules';
  vfs.mkdirSync(nodeModulesPath, { recursive: true });

  const destDir = nodeModulesPath + '/' + pkgName;

  // Remove existing installation if present
  if (vfs.existsSync(destDir)) {
    removeDirSync(vfs, destDir);
  }

  // Rename tmpDir -> destDir (VirtualFS renameSync handles directories)
  vfs.mkdirSync(destDir, { recursive: true });
  const entries = vfs.readdirSync(tmpDir);
  for (const entry of entries) {
    if (entry === '.' || entry === '..') continue;
    vfs.renameSync(tmpDir + '/' + entry, destDir + '/' + entry);
  }

  // Clean up temp dir
  removeDirSync(vfs, tmpDir);

  // 6. Create .bin stubs if the package has a bin field
  if (pkgJson.bin) {
    const binDir = nodeModulesPath + '/.bin';
    vfs.mkdirSync(binDir, { recursive: true });

    const bin = typeof pkgJson.bin === 'string'
      ? { [pkgName.includes('/') ? pkgName.split('/').pop()! : pkgName]: pkgJson.bin }
      : pkgJson.bin;

    for (const [cmdName, scriptPath] of Object.entries(bin as Record<string, string>)) {
      const fullScriptPath = destDir + '/' + scriptPath;
      vfs.writeFileSync(
        binDir + '/' + cmdName,
        `node "${fullScriptPath}" "$@"\n`,
      );
    }
  }

  onProgress?.(`Installed ${pkgName}@${pkgJson.version || '?'}`);

  return pkgName;
}

/**
 * Recursively delete a directory tree in the VirtualFS.
 */
function removeDirSync(vfs: ReturnType<typeof getVfs>, dirPath: string): void {
  if (!vfs.existsSync(dirPath)) return;

  const entries = vfs.readdirSync(dirPath);
  for (const entry of entries) {
    if (entry === '.' || entry === '..') continue;
    const fullPath = dirPath + '/' + entry;
    try {
      removeDirSync(vfs, fullPath);
    } catch {
      vfs.unlinkSync(fullPath);
    }
  }
  vfs.rmdirSync(dirPath);
}
