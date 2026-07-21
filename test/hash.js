const crypto = require('crypto');

class HashTester {
  constructor() {
    this.algorithms = crypto.getHashes();
  }

  listAlgorithms() {
    return this.algorithms.sort();
  }

  hash(input, algorithm = 'sha256') {
    const start = performance.now();
    const hash = crypto.createHash(algorithm);
    hash.update(input);
    const hex = hash.digest('hex');
    const hash2 = crypto.createHash(algorithm);
    hash2.update(input);
    const base64 = hash2.digest('base64');
    const end = performance.now();

    return {
      algorithm,
      input: input.length > 64 ? input.slice(0, 64) + '...' : input,
      hex,
      base64,
      duration: `${(end - start).toFixed(4)}ms`,
    };
  }

  hmac(input, key, algorithm = 'sha256') {
    const start = performance.now();
    const hmac = crypto.createHmac(algorithm, key);
    hmac.update(input);
    const hex = hmac.digest('hex');
    const hmac2 = crypto.createHmac(algorithm, key);
    hmac2.update(input);
    const base64 = hmac2.digest('base64');
    const end = performance.now();

    return {
      algorithm: `hmac-${algorithm}`,
      input: input.length > 64 ? input.slice(0, 64) + '...' : input,
      hex,
      base64,
      duration: `${(end - start).toFixed(4)}ms`,
      key,
    };
  }

  benchmark(algorithm, iterations = 10000, dataSize = 1024) {
    const data = crypto.randomBytes(dataSize);
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      const hash = crypto.createHash(algorithm);
      hash.update(data);
      hash.digest('hex');
    }

    const end = performance.now();
    const totalMs = end - start;
    const opsPerSec = Math.round((iterations / totalMs) * 1000);
    const throughput = Math.round((dataSize * iterations) / (totalMs / 1000) / 1024 / 1024);

    return `${algorithm}: ${opsPerSec.toLocaleString()} ops/s, ${throughput} MB/s (${iterations} iterations, ${dataSize}B each, ${totalMs.toFixed(1)}ms total)`;
  }

  testVector(algorithm) {
    const testVectors = {
      sha256: {
        input: 'abc',
        expected: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      },
      sha512: {
        input: 'abc',
        expected:
          'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
      },
      md5: {
        input: 'abc',
        expected: '900150983cd24fb0d6963f7d28e17f72',
      },
      sha1: {
        input: 'abc',
        expected: 'a9993e364706816aba3e25717850c26c9cd0d89d',
      },
      sha384: {
        input: 'abc',
        expected:
          'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
      },
    };

    const vector = testVectors[algorithm];
    if (!vector) {
      return { passed: false, result: `${algorithm}: No test vector available` };
    }

    const result = this.hash(vector.input, algorithm);
    const passed = result.hex === vector.expected;
    return {
      passed,
      result: `${algorithm}: ${passed ? 'PASS' : 'FAIL'} (got: ${result.hex.slice(0, 16)}..., expected: ${vector.expected.slice(0, 16)}...)`,
    };
  }

  runAll() {
    const lines = [];

    lines.push('=== Available Hash Algorithms ===');
    lines.push(this.listAlgorithms().join(', '));
    lines.push('');

    lines.push('=== Hash Test ===');
    lines.push(JSON.stringify(this.hash('Hello, World!', 'sha256'), null, 2));
    lines.push('');

    lines.push('=== HMAC Test ===');
    lines.push(JSON.stringify(this.hmac('Hello, World!', 'secret-key', 'sha256'), null, 2));
    lines.push('');

    lines.push('=== Test Vectors ===');
    for (const algo of ['sha256', 'sha512', 'md5', 'sha1', 'sha384']) {
      const tv = this.testVector(algo);
      lines.push(tv.result);
    }
    lines.push('');

    lines.push('=== Benchmark ===');
    for (const algo of ['sha256', 'sha512', 'md5', 'sha1']) {
      lines.push(this.benchmark(algo, 5000, 1024));
    }
    lines.push('');

    return lines;
  }
}

// CLI entry point
function parseArgs(args) {
  const command = args[0] || 'all';
  const options = [];
  const positional = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      options.push(args[i]);
    } else if (args[i].startsWith('-')) {
      options.push(args[i]);
    } else {
      positional.push(args[i]);
    }
  }
  return { command, options, positional };
}

const tester = new HashTester();

function main() {
  const args = process.argv.slice(2);
  const { command, options, positional } = parseArgs(args);

  switch (command) {
    case 'all':
      console.log(tester.runAll().join('\n'));
      break;

    case 'list':
      console.log('Available algorithms:');
      tester.listAlgorithms().forEach((a) => console.log(`  ${a}`));
      break;

    case 'hash': {
      const input = positional[0] || 'Hello, World!';
      const algo = options.includes('-a') ? positional[1] || 'sha256' : 'sha256';
      console.log(JSON.stringify(tester.hash(input, algo), null, 2));
      break;
    }

    case 'hmac': {
      const input = positional[0] || 'Hello, World!';
      const key = positional[1] || 'secret-key';
      const algo = 'sha256';
      console.log(JSON.stringify(tester.hmac(input, key, algo), null, 2));
      break;
    }

    case 'bench': {
      const algo = positional[0] || 'sha256';
      const iterations = parseInt(positional[1]) || 10000;
      const dataSize = parseInt(positional[2]) || 1024;
      console.log(tester.benchmark(algo, iterations, dataSize));
      break;
    }

    case 'test': {
      const algo = positional[0];
      if (algo) {
        const tv = tester.testVector(algo);
        console.log(tv.result);
      } else {
        for (const a of ['sha256', 'sha512', 'md5', 'sha1', 'sha384']) {
          console.log(tester.testVector(a).result);
        }
      }
      break;
    }

    default:
      console.log(`Usage: node hash_test.js [command] [options] [args]

Commands:
  all               Run all tests (default)
  list              List available hash algorithms
  hash <input>      Hash input (default: sha256)
  hmac <input> <key> HMAC input with key
  bench [algo] [n] [size]  Benchmark algorithm  
  test [algo]       Verify against test vectors

Options:
  -a <algo>         Specify algorithm for hash command`);
      break;
  }
}

main();
