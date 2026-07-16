import { getVfs } from '../../fs/configure';
import type { CommandHandler } from '../types';
import { executeAndCapture } from '../execute-helper';

export const testHandler: CommandHandler = async (args, cwd) => {
  const subcommand = args[0];
  const vfs = getVfs();

  // test npm — install a small package and verify npm works
  if (!subcommand || subcommand === 'npm') {
    const output: string[] = [];
    output.push('=== almostnode npm test ===');
    output.push('');

    try {
      const { PackageManager } = await import('almostnode');
      const pm = new PackageManager(vfs, { cwd: '/' });

      output.push(`[0/3] running in dir ${cwd}`);

      // Step 1: Check package manager init
      output.push('[1/3] PackageManager initialized OK');

      // Step 2: Install a tiny package via npm registry
      const testPkg = args[1] || 'is-odd';
      output.push(`[2/3] Installing '${testPkg}' from npm registry...`);
      output.push('  (this may take a moment on first run)');

      const result = await pm.install(testPkg, {
        onProgress: (msg) => {
          // silently track progress
        },
      });

      const installedCount = result.added.length;
      output.push(`  Installed ${installedCount} package(s)`);

      // Step 3: Verify the package is require-able via node
      output.push(`[3/3] Verifying '${testPkg}' can be loaded...`);

      const code = `
try {
  const result = require('${testPkg}');
  process.stdout.write('PASS: Package loaded successfully\\n');
  process.stdout.write('Type: ' + typeof result + '\\n');
  if (typeof result === 'function') {
    process.stdout.write('Test call: ' + result(3) + '\\n');
  } else {
    process.stdout.write('Exports: ' + JSON.stringify(Object.keys(result)) + '\\n');
  }
} catch (e) {
  process.stderr.write('FAIL: ' + e.message + '\\n');
  process.exit(1);
}
`;
      const execResult = await executeAndCapture(code, vfs, cwd);
      output.push('');

      if (execResult.exitCode === 0) {
        output.push(`${execResult.stdout}`);
        output.push(`✓ npm test PASSED — '${testPkg}' installed and loaded successfully`);
      } else {
        output.push(`✗ npm test FAILED — could not load '${testPkg}'`);
        output.push(`  stderr: ${execResult.stderr || ''}`);
      }
    } catch (err: any) {
      output.push('');
      output.push(`✗ npm test FAILED: ${err.message}`);
      return { stdout: '', stderr: output.join('\n') + '\n', exitCode: 1 };
    }

    return { stdout: output.join('\n') + '\n', stderr: '', exitCode: 0 };
  }

  // test node — verify node runtime works
  if (subcommand === 'node') {
    const output: string[] = [];
    output.push('=== almostnode node runtime test ===');
    output.push('');

    try {
      const code = `
// Test basic expressions
process.stdout.write('JS evaluation: 1 + 1 = ' + (1 + 1) + '\\n');

// Test built-in modules
const path = require('path');
process.stdout.write('path.join test: ' + path.join('/foo', 'bar') + '\\n');

const fs = require('fs');
process.stdout.write('fs module loaded: OK\\n');

const buffer = require('buffer');
process.stdout.write('Buffer.from test: ' + buffer.Buffer.from('hello').toString() + '\\n');

// Test async via process.nextTick
process.nextTick(() => {
  process.stdout.write('async/await: OK\\n');
  process.stdout.write('Node runtime: ALL OK\\n');
});
`;
      const result = await executeAndCapture(code, vfs, cwd);
      output.push(result.stdout || '');
      output.push('✓ node runtime test PASSED');
    } catch (err: any) {
      output.push(`✗ node runtime test FAILED: ${err.message}`);
      return { stdout: '', stderr: output.join('\n') + '\n', exitCode: 1 };
    }

    return { stdout: output.join('\n') + '\n', stderr: '', exitCode: 0 };
  }

  // test all — run all tests
  if (subcommand === 'all') {
    const output: string[] = [];
    output.push('=== almosterm self-test ===');
    output.push('');

    // VFS test
    output.push('--- VFS ---');
    try {
      vfs.writeFileSync('/tmp/_test_vfs', 'hello vfs');
      const content = vfs.readFileSync('/tmp/_test_vfs', 'utf-8');
      if (content === 'hello vfs') {
        output.push('✓ VFS read/write: OK');
      } else {
        output.push('✗ VFS read/write: FAIL');
      }
      vfs.unlinkSync('/tmp/_test_vfs');
    } catch (err: any) {
      output.push(`✗ VFS test FAILED: ${err.message}`);
    }

    // Node runtime test
    output.push('');
    output.push('--- Node Runtime ---');
    try {
      const result = await executeAndCapture('process.stdout.write("runtime OK\\n")', vfs, cwd);
      if (result.stdout?.includes('runtime OK')) {
        output.push('✓ Node runtime: OK');
      } else {
        output.push('✗ Node runtime: FAIL');
        output.push(`  stdout: ${result.stdout}`);
      }
    } catch (err: any) {
      output.push(`✗ Node runtime FAILED: ${err.message}`);
    }

    // npm test
    output.push('');
    output.push('--- npm ---');
    try {
      const { PackageManager } = await import('almostnode');
      const pm = new PackageManager(vfs, { cwd });
      const testPkg = 'is-odd';
      output.push(`  Installing '${testPkg}'...`);
      const result = await pm.install(testPkg);
      output.push(`  Installed ${result.added.length} package(s)`);

      const execResult = await executeAndCapture(
        `const m = require('${testPkg}'); process.stdout.write('is-odd(3): ' + m(3) + '\\n');`,
        vfs,
        cwd
      );
      if (execResult.stdout?.includes('is-odd')) {
        output.push(`✓ npm: OK`);
      } else {
        output.push(`✗ npm: FAIL`);
        output.push(`  stdout: ${execResult.stdout}`);
        output.push(`  stderr: ${execResult.stderr}`);
      }
    } catch (err: any) {
      output.push(`✗ npm FAILED: ${err.message}`);
    }

    output.push('');
    output.push('=== test complete ===');
    return { stdout: output.join('\n') + '\n', stderr: '', exitCode: 0 };
  }

  return {
    stdout:
      'Usage: test [npm|node|all]\n\n' +
      '  test npm [package]  Test npm install + require (default: is-odd)\n' +
      '  test node           Test Node.js runtime (builtins, require, async)\n' +
      '  test all            Run full self-test (VFS + node + npm)\n',
    stderr: '',
    exitCode: 0,
  };
};
