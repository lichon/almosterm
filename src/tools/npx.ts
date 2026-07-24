import { defineCommand } from 'just-bash';
import { PackageManager } from 'almostnode';
import { getContainer, getVfs } from '../fs/configure';
import { useVfsStore } from '../store/vfsStore';
import { writeTerm } from '../utils';

/** Shared cache directory for npx — packages persist across invocations. */
const NPX_CACHE_DIR = '/tmp/npx';

/**
 * Normalize the `bin` field from a package.json into a map of command → script path.
 */
function normalizeBin(pkgName: string, bin: Record<string, string> | string | undefined): Record<string, string> {
  if (!bin) return {};
  if (typeof bin === 'string') {
    const cmdName = pkgName.includes('/') ? pkgName.split('/').pop()! : pkgName;
    return { [cmdName]: bin };
  }
  return bin;
}

/**
 * Try to resolve a package's binary from a given node_modules base.
 * Returns { pkgPath, cmdName, scriptPath } or null if not found.
 */
function tryResolveLocal(
  vfs: ReturnType<typeof getVfs>,
  baseDir: string,
  pkgName: string,
): { pkgPath: string; cmdName: string; scriptPath: string } | null {
  const pkgPath = `${baseDir}/node_modules/${pkgName}`;
  const pkgJsonPath = `${pkgPath}/package.json`;

  if (!vfs.existsSync(pkgJsonPath)) return null;

  try {
    const raw = vfs.readFileSync(pkgJsonPath, 'utf-8') as string;
    const pkgJson = JSON.parse(raw);
    const binEntries = normalizeBin(pkgName, pkgJson.bin);

    if (Object.keys(binEntries).length === 0) return null;

    const [cmdName, scriptPath] = Object.entries(binEntries)[0];
    const fullScriptPath = `${pkgPath}/${scriptPath}`;

    if (!vfs.existsSync(fullScriptPath)) return null;

    return { pkgPath, cmdName, scriptPath: fullScriptPath };
  } catch {
    return null;
  }
}

/**
 * Run the resolved script via node and return the result.
 */
async function runScript(
  container: ReturnType<typeof getContainer>,
  scriptPath: string,
  args: string[],
  cwd: string,
  cmdName: string,
) {
  writeTerm(`npx: running ${cmdName} ${args.join(' ')}\r\n\r\n`);

  let streamedStdout = '';
  let streamedStderr = '';

  const result = await container.run(
    `node ${scriptPath} ${args.join(' ')}`,
    {
      cwd,
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
}

/**
 * npx — execute an npm package binary without installing it globally.
 *
 * Resolution order:
 *   1. Local node_modules (current working directory)
 *   2. npx shared cache (/tmp/npx)
 *   3. Download to shared cache and run
 *
 * Usage:
 *   npx <package> [args...]    execute an npm package
 *   npx <package>@<version>    execute a specific version
 */
export const npx = defineCommand('npx', async (args, ctx) => {
  if (args.length === 0) {
    return { stdout: '', stderr: 'npx: missing package name\nUsage: npx <package> [args...]\n', exitCode: 1 };
  }

  const pkgSpec = args[0];
  const scriptArgs = args.slice(1);
  const container = getContainer();
  const vfs = getVfs();

  // Resolve the package name (strip version suffix like @1.0.0)
  const pkgName = pkgSpec.replace(/@[^@]+$/, '');

  // ---- 1. Try local node_modules first ----
  const localCwd = ctx.cwd.endsWith('/') ? ctx.cwd.slice(0, -1) : ctx.cwd;
  const localResolved = tryResolveLocal(vfs, localCwd || '/', pkgName);
  if (localResolved) {
    writeTerm(`npx: using local ${pkgName}\r\n`);
    return runScript(container, localResolved.scriptPath, scriptArgs, localCwd || '/', localResolved.cmdName);
  }

  // ---- 2. Try npx shared cache ----
  const cacheResolved = tryResolveLocal(vfs, NPX_CACHE_DIR, pkgName);
  if (cacheResolved) {
    writeTerm(`npx: using cached ${pkgName}\r\n`);
    return runScript(container, cacheResolved.scriptPath, scriptArgs, NPX_CACHE_DIR, cacheResolved.cmdName);
  }

  // ---- 3. Download to shared cache ----
  // Ensure the shared npx cache directory exists
  if (!vfs.existsSync(NPX_CACHE_DIR)) {
    vfs.mkdirSync(NPX_CACHE_DIR, { recursive: true });
  }

  const pkgJsonPath = `${NPX_CACHE_DIR}/package.json`;
  if (!vfs.existsSync(pkgJsonPath)) {
    vfs.writeFileSync(
      pkgJsonPath,
      JSON.stringify({ name: 'npx-cache', private: true }, null, 2),
    );
  }

  try {
    writeTerm(`npx: installing ${pkgSpec}...\r\n`);

    const pm = new PackageManager(vfs, { cwd: NPX_CACHE_DIR, registry: useVfsStore.getState().npmRegistry });
    await pm.install(pkgSpec, {
      onProgress: (msg) => {
        writeTerm(`  ${msg}\r\n`);
      },
    });

    // Resolve the freshly installed package
    const installedResolved = tryResolveLocal(vfs, NPX_CACHE_DIR, pkgName);
    if (!installedResolved) {
      return {
        stdout: '',
        stderr: `npx: could not resolve binary for ${pkgSpec}\n`,
        exitCode: 1,
      };
    }

    return runScript(container, installedResolved.scriptPath, scriptArgs, NPX_CACHE_DIR, installedResolved.cmdName);
  } catch (err: any) {
    return { stdout: '', stderr: `npx: ${err.message}\n`, exitCode: 1 };
  }
});
