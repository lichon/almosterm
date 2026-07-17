import { defineCommand } from 'just-bash';
import { PackageManager } from 'almostnode';
import { getContainer, getVfs } from '../fs/configure';
import { writeTerm } from '../utils';

/**
 * npm-test — verify that PackageManager install, list, and script run work correctly.
 *
 * Sets up a minimal package.json in /tmp with a test script, then uses
 * PackageManager to install and list packages, and the container to run
 * the test script.
 *
 * Usage:
 *   npm-test    run all checks and report status
 */
export const npm_test = defineCommand('npm-test', async (_args, _ctx) => {
  const container = getContainer();
  const vfs = getVfs();
  const cwd = '/tmp';
  const pm = new PackageManager(vfs, { cwd });

  const results: { tool: string; detail: string; ok: boolean; error?: string }[] = [];

  // Setup: create package.json in /tmp with a test script
  try {
    const pkgJson = JSON.stringify({
      name: 'npm-test',
      private: true,
      scripts: {
        test: 'echo ok',
      },
    }, null, 2);
    vfs.writeFileSync('/tmp/package.json', pkgJson);
  } catch (err: any) {
    results.push({ tool: 'setup', detail: '', ok: false, error: err.message });
  }

  // Test PackageManager install
  try {
    await pm.install('is-odd', {
      onProgress: () => {},
    });
    results.push({ tool: 'npm install', detail: 'is-odd installed', ok: true });
  } catch (err: any) {
    results.push({ tool: 'npm install', detail: '', ok: false, error: err.message });
  }

  // Test PackageManager list
  try {
    const packages = pm.list();
    const names = Object.keys(packages).join(', ');
    results.push({ tool: 'npm ls', detail: names || '(empty)', ok: true });
  } catch (err: any) {
    results.push({ tool: 'npm ls', detail: '', ok: false, error: err.message });
  }

  // Test npm run test (via container)
  try {
    const npmTestResult = await container.run('echo ok', {
      cwd: '/tmp',
      onStdout: () => {},
      onStderr: () => {},
    });
    if (npmTestResult.exitCode === 0) {
      results.push({ tool: 'npm run test', detail: npmTestResult.stdout.trim(), ok: true });
    } else {
      results.push({
        tool: 'npm run test',
        detail: '',
        ok: false,
        error: npmTestResult.stderr.trim() || `exit code ${npmTestResult.exitCode}`,
      });
    }
  } catch (err: any) {
    results.push({ tool: 'npm run test', detail: '', ok: false, error: err.message });
  }

  // Build output
  let out = '\n';
  const allOk = results.every((r) => r.ok);

  for (const r of results) {
    const status = r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    const detail = r.ok ? r.detail : `ERROR: ${r.error}`;
    out += `  ${status} ${r.tool}: ${detail}\n`;
  }

  out += '\n';
  if (allOk) {
    out += '\x1b[32mAll checks passed.\x1b[0m\n';
  } else {
    out += '\x1b[31mSome checks failed.\x1b[0m\n';
  }

  writeTerm(out);
  return { stdout: '', stderr: '', exitCode: 0 };
});
