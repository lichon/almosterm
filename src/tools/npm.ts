import { defineCommand } from 'just-bash';
import { PackageManager } from 'almostnode';
import { getContainer, getVfs } from '../fs/configure';
import { writeTerm } from '../utils';

/**
 * npm — run npm commands against the VirtualFS using PackageManager.
 *
 * Supported subcommands:
 *   install <pkg>     install a package via PackageManager
 *   install           install all deps from package.json
 *   i                 alias for install
 *   ls / list         list installed packages
 *   run <script>      run an npm script via node
 *   init              initialize a new package.json
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
  const pm = new PackageManager(vfs, { cwd: ctx.cwd });

  // ---- install / i ----
  if (subcommand === 'install' || subcommand === 'i') {
    try {
      if (rest.length > 0) {
        // npm install <package> — install a single package
        const pkgSpec = rest[0];
        writeTerm(`npm: installing ${pkgSpec}...\r\n`);

        await pm.install(pkgSpec, {
          onProgress: (msg) => {
            writeTerm(`  ${msg}\r\n`);
          },
        });

        writeTerm(`npm: installed ${pkgSpec}\r\n`);
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
          onStdout: (data) => {
            streamedStdout += data;
            writeTerm(data);
          },
          onStderr: (data) => {
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
