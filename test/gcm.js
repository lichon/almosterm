// GCM polyfill test — validates createCipheriv / createDecipheriv for AES-GCM
// against NIST SP 800-38D test vectors.
//
// Usage:
//   node test/gcm.js          — run all tests
//   node test/gcm.js vectors  — NIST vector tests only
//   node test/gcm.js roundtrip — random roundtrip tests only
//   node test/gcm.js stream   — streaming / multiple-update tests only
//   node test/gcm.js non-gcm  — verify CTR / CBC still work

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// NIST GCM test vectors (from the GCMVS, SP 800-38D)
// ---------------------------------------------------------------------------

const NIST_VECTORS = [
  // === AES-128 ===
  {
    name: 'AES-128  empty pt / empty aad',
    algo: 'aes-128-gcm',
    key: '00000000000000000000000000000000',
    iv:  '000000000000000000000000',
    pt:  '',
    aad: '',
    ct:  '',
    tag: '58e2fccefa7e3061367f1d57a4e7455a',
  },
  {
    name: 'AES-128  1-block pt / empty aad',
    algo: 'aes-128-gcm',
    key: '00000000000000000000000000000000',
    iv:  '000000000000000000000000',
    pt:  '00000000000000000000000000000000',
    aad: '',
    ct:  '0388dace60b6a392f328c2b971b2fe78',
    tag: 'ab6e47d42cec13bdf53a67b21257bddf',
  },
  {
    name: 'AES-128  1-block pt / 1-block aad',
    algo: 'aes-128-gcm',
    key: 'feffe9928665731c6d6a8f9467308308',
    iv:  'cafebabefacedbaddecaf888',
    pt:  'd9313225f88406e5a55909c5aff5269a'
       + '86a7a9531534f7da2e4c303d8a318a72'
       + '1c3c0c95956809532fcf0e2449a6b525'
       + 'b16aedf5aa0de657ba637b391aafd255',
    aad: '',
    ct:  '42831ec2217774244b7221b784d0d49c'
       + 'e3aa212f2c02a4e035c17e2329aca12e'
       + '21d514b25466931c7d8f6a5aac84aa05'
       + '1ba30b396a0aac973d58e091473f5985',
    tag: '4d5c2af327cd64a62cf35abd2ba6fab4',
  },
  {
    name: 'AES-128  1-block pt / 1-block aad',
    algo: 'aes-128-gcm',
    key: 'feffe9928665731c6d6a8f9467308308',
    iv:  'cafebabefacedbaddecaf888',
    pt:  'd9313225f88406e5a55909c5aff5269a'
       + '86a7a9531534f7da2e4c303d8a318a72'
       + '1c3c0c95956809532fcf0e2449a6b525'
       + 'b16aedf5aa0de657ba637b39',
    aad: 'feedfacedeadbeeffeedfacedeadbeef'
       + 'abaddad2',
    ct:  '42831ec2217774244b7221b784d0d49c'
       + 'e3aa212f2c02a4e035c17e2329aca12e'
       + '21d514b25466931c7d8f6a5aac84aa05'
       + '1ba30b396a0aac973d58e091',
    tag: '5bc94fbc3221a5db94fae95ae7121a47',
  },
  // === AES-256 ===
  {
    name: 'AES-256  empty pt / empty aad',
    algo: 'aes-256-gcm',
    key: '0000000000000000000000000000000000000000000000000000000000000000',
    iv:  '000000000000000000000000',
    pt:  '',
    aad: '',
    ct:  '',
    tag: '530f8afbc74536b9a963b4f1c4cb738b',
  },
  {
    name: 'AES-256  1-block pt / empty aad',
    algo: 'aes-256-gcm',
    key: '0000000000000000000000000000000000000000000000000000000000000000',
    iv:  '000000000000000000000000',
    pt:  '00000000000000000000000000000000',
    aad: '',
    ct:  'cea7403d4d606b6e074ec5d3baf39d18',
    tag: 'd0d1c8a799996bf0265b98b5d48ab919',
  },
  {
    name: 'AES-256  1-block pt / 1-block aad',
    algo: 'aes-256-gcm',
    key: 'feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308',
    iv:  'cafebabefacedbaddecaf888',
    pt:  'd9313225f88406e5a55909c5aff5269a'
       + '86a7a9531534f7da2e4c303d8a318a72'
       + '1c3c0c95956809532fcf0e2449a6b525'
       + 'b16aedf5aa0de657ba637b39',
    aad: 'feedfacedeadbeeffeedfacedeadbeef'
       + 'abaddad2',
    ct:  '522dc1f099567d07f47f37a32a84427d'
       + '643a8cdcbfe5c0c97598a2bd2555d1aa'
       + '8cb08e48590dbb3da7b08b1056828838'
       + 'c5f61e6393ba7a0abcc9f662',
    tag: '76fc6ece0f4e1768cddf8853bb2d551b',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const SKIP = '\x1b[33mSKIP\x1b[0m';

let passed = 0;
let failed = 0;
let skipped = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ${PASS}  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ${FAIL}  ${name}`);
    console.log(`        ${e.message}`);
    failed++;
  }
}

function testSkip(name, reason) {
  console.log(`  ${SKIP}  ${name}  (${reason})`);
  skipped++;
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

function bufEq(a, b) {
  if (Buffer.isBuffer(a)) a = a.toString('hex');
  if (Buffer.isBuffer(b)) b = b.toString('hex');
  return a.toLowerCase() === b.toLowerCase();
}

// ---------------------------------------------------------------------------
// 0. Quick diagnostics — test AES block encryption directly
// ---------------------------------------------------------------------------

function runDiagnostics() {
  console.log('\n=== Diagnostic: AES block encryption ===');

  // Encrypt a few known blocks and print results
  const key = Buffer.alloc(16, 0); // all-zero key
  const blocks = [
    { name: 'zero block',  hex: '00000000000000000000000000000000' },
    { name: 'block 0x01',  hex: '00000000000000000000000000000001' },
    { name: 'block 0x02',  hex: '00000000000000000000000000000002' },
  ];

  for (const b of blocks) {
    try {
      // Use createCipheriv with aes-128-ecb to encrypt a single block
      const cipher = crypto.createCipheriv('aes-128-ecb', key, null, { padding: false });
      const ct = Buffer.concat([cipher.update(Buffer.from(b.hex, 'hex')), cipher.final()]);
      console.log(`  ${b.name}: ${ct.toString('hex')}`);
    } catch (e) {
      console.log(`  ${b.name}: ERROR - ${e.message}`);
    }
  }

  // Also test GCM with 1-block pt and print ciphertext
  console.log('\n=== Diagnostic: GCM 1-block pt ===');
  try {
    const key2 = Buffer.alloc(16, 0);
    const iv2  = Buffer.alloc(12, 0);
    const pt2  = Buffer.alloc(16, 0);
    const cipher = crypto.createCipheriv('aes-128-gcm', key2, iv2);
    const ct = Buffer.concat([cipher.update(pt2), cipher.final()]);
    const tag = cipher.getAuthTag();
    console.log(`  key: ${key2.toString('hex')}`);
    console.log(`  iv:  ${iv2.toString('hex')}`);
    console.log(`  pt:  ${pt2.toString('hex')}`);
    console.log(`  ct:  ${ct.toString('hex')}`);
    console.log(`  tag: ${tag.toString('hex')}`);
    console.log(`  expected ct:  0388dace60b6a392f328c2b971b2fe78`);
    console.log(`  expected tag: ab6e47d42cec13bdf53a67b21257bddf`);
  } catch (e) {
    console.log(`  ERROR - ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. NIST test vectors
// ---------------------------------------------------------------------------

function runNistVectors() {
  console.log('\n=== NIST GCM Test Vectors ===');

  for (const vec of NIST_VECTORS) {
    test(`Encrypt  ${vec.name}`, () => {
      const key   = Buffer.from(vec.key, 'hex');
      const iv    = Buffer.from(vec.iv, 'hex');
      const pt    = Buffer.from(vec.pt, 'hex');
      const aad   = Buffer.from(vec.aad, 'hex');
      const expectedCt  = vec.ct;
      const expectedTag = vec.tag;

      const cipher = crypto.createCipheriv(vec.algo, key, iv);
      cipher.setAAD(aad);
      const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
      const tag = cipher.getAuthTag();

      assert(bufEq(ct, expectedCt),
        `Ciphertext mismatch.\n         got: ${ct.toString('hex').substring(0, 64)}...\n    expected: ${expectedCt.substring(0, 64)}...`);
      assert(bufEq(tag, expectedTag),
        `Tag mismatch.\n         got: ${tag.toString('hex')}\n    expected: ${expectedTag}`);
    });

    test(`Decrypt  ${vec.name}`, () => {
      const key   = Buffer.from(vec.key, 'hex');
      const iv    = Buffer.from(vec.iv, 'hex');
      const expectedPt  = vec.pt;
      const aad   = Buffer.from(vec.aad, 'hex');
      const ct    = Buffer.from(vec.ct, 'hex');
      const tag   = Buffer.from(vec.tag, 'hex');

      // Combine ct + tag as ssh2 does
      const combined = Buffer.concat([ct, tag]);

      const decipher = crypto.createDecipheriv(vec.algo, key, iv);
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]);

      assert(bufEq(pt, expectedPt),
        `Plaintext mismatch.\n         got: ${pt.toString('hex').substring(0, 64)}...\n    expected: ${expectedPt.substring(0, 64)}...`);
    });
  }
}

// ---------------------------------------------------------------------------
// 2. Roundtrip tests with random data
// ---------------------------------------------------------------------------

function randomBytes(len) {
  const buf = Buffer.alloc(len);
  // Not cryptographic randomness, but fine for testing
  for (let i = 0; i < len; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf;
}

function runRoundtripTests() {
  console.log('\n=== Roundtrip Tests (random data) ===');

  const configs = [
    { algo: 'aes-128-gcm', keyLen: 16, ivLen: 12 },
    { algo: 'aes-256-gcm', keyLen: 32, ivLen: 12 },
  ];

  for (const cfg of configs) {
    // Empty
    test(`${cfg.algo}  empty pt / empty aad`, () => {
      const key = randomBytes(cfg.keyLen);
      const iv  = randomBytes(cfg.ivLen);

      const cipher = crypto.createCipheriv(cfg.algo, key, iv, { authTagLength: 16 });
      cipher.setAAD(Buffer.alloc(0));
      const ct = Buffer.concat([cipher.update(''), cipher.final()]);
      const tag = cipher.getAuthTag();

      const decipher = crypto.createDecipheriv(cfg.algo, key, iv, { authTagLength: 16 });
      decipher.setAAD(Buffer.alloc(0));
      decipher.setAuthTag(tag);
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]);

      assert(bufEq(pt, ''), 'Empty roundtrip failed');
    });

    // Single block
    test(`${cfg.algo}  1-block pt / no aad`, () => {
      const key = randomBytes(cfg.keyLen);
      const iv  = randomBytes(cfg.ivLen);
      const pt  = randomBytes(16);

      const cipher = crypto.createCipheriv(cfg.algo, key, iv);
      const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
      const tag = cipher.getAuthTag();

      const decipher = crypto.createDecipheriv(cfg.algo, key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);

      assert(bufEq(decrypted, pt),
        `Roundtrip mismatch.\n         expected: ${pt.toString('hex')}\n              got: ${decrypted.toString('hex')}`);
    });

    // Multiple blocks with AAD
    test(`${cfg.algo}  multi-block pt / with aad`, () => {
      const key = randomBytes(cfg.keyLen);
      const iv  = randomBytes(cfg.ivLen);
      const pt  = randomBytes(64);
      const aad = randomBytes(20);

      const cipher = crypto.createCipheriv(cfg.algo, key, iv);
      cipher.setAAD(aad);
      const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
      const tag = cipher.getAuthTag();

      const decipher = crypto.createDecipheriv(cfg.algo, key, iv);
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);

      assert(bufEq(decrypted, pt),
        `Roundtrip+AAD mismatch.\n         expected: ${pt.toString('hex').substring(0, 32)}...\n              got: ${decrypted.toString('hex').substring(0, 32)}...`);
    });

    // Large payload
    test(`${cfg.algo}  large payload (4096 bytes)`, () => {
      const key = randomBytes(cfg.keyLen);
      const iv  = randomBytes(cfg.ivLen);
      const pt  = randomBytes(4096);
      const aad = randomBytes(32);

      const cipher = crypto.createCipheriv(cfg.algo, key, iv);
      cipher.setAAD(aad);
      const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
      const tag = cipher.getAuthTag();

      const decipher = crypto.createDecipheriv(cfg.algo, key, iv);
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);

      assert(bufEq(decrypted, pt), 'Large payload roundtrip failed');
    });
  }
}

// ---------------------------------------------------------------------------
// 3. Streaming tests (multiple update() calls)
// ---------------------------------------------------------------------------

function runStreamingTests() {
  console.log('\n=== Streaming Tests (multiple update calls) ===');

  const key = randomBytes(16);
  const iv  = randomBytes(12);
  const pt  = randomBytes(100);
  const aad = randomBytes(13);

  // Encrypt: split plaintext into uneven chunks
  test('Encrypt with streaming updates (chunked pt)', () => {
    const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    cipher.setAAD(aad);

    const chunks = [];
    chunks.push(cipher.update(pt.slice(0, 7)));   // 7 bytes
    chunks.push(cipher.update(pt.slice(7, 30)));   // 23 bytes
    chunks.push(cipher.update(pt.slice(30, 50)));  // 20 bytes
    chunks.push(cipher.update(pt.slice(50, 75)));  // 25 bytes
    chunks.push(cipher.update(pt.slice(75)));      // 25 bytes
    chunks.push(cipher.final());
    const ct = Buffer.concat(chunks);
    const tag = cipher.getAuthTag();

    // Single-shot encrypt for reference
    const refCipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    refCipher.setAAD(aad);
    const refCt = Buffer.concat([refCipher.update(pt), refCipher.final()]);
    const refTag = refCipher.getAuthTag();

    assert(bufEq(ct, refCt), 'Streaming ct mismatch vs one-shot');
    assert(bufEq(tag, refTag), 'Streaming tag mismatch vs one-shot');
  });

  // Decrypt: split ciphertext
  test('Decrypt with streaming updates (chunked ct)', () => {
    // First encrypt to get ct+tag
    const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    cipher.setAAD(aad);
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Now decrypt in chunks
    const decipher = crypto.createDecipheriv('aes-128-gcm', key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);

    const chunks = [];
    chunks.push(decipher.update(ct.slice(0, 11)));
    chunks.push(decipher.update(ct.slice(11, 45)));
    chunks.push(decipher.update(ct.slice(45, 70)));
    chunks.push(decipher.update(ct.slice(70)));
    chunks.push(decipher.final());
    const decrypted = Buffer.concat(chunks);

    assert(bufEq(decrypted, pt), 'Streaming decrypt mismatch');
  });

  // Chunked AAD
  test('setAAD called multiple times', () => {
    const aad1 = randomBytes(5);
    const aad2 = randomBytes(7);
    const aad3 = randomBytes(3);
    const combinedAad = Buffer.concat([aad1, aad2, aad3]);

    const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    cipher.setAAD(aad1);
    cipher.setAAD(aad2);
    cipher.setAAD(aad3);
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Verify with single-shot AAD
    const refCipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    refCipher.setAAD(combinedAad);
    const refCt = Buffer.concat([refCipher.update(pt), refCipher.final()]);
    const refTag = refCipher.getAuthTag();

    assert(bufEq(ct, refCt), 'Chunked-AAD ct mismatch');
    assert(bufEq(tag, refTag), 'Chunked-AAD tag mismatch');
  });
}

// ---------------------------------------------------------------------------
// 4. Error / edge-case tests
// ---------------------------------------------------------------------------

function runErrorTests() {
  console.log('\n=== Error & Edge-Case Tests ===');

  const key = randomBytes(16);
  const iv  = randomBytes(12);

  test('Decrypt with wrong auth tag fails', () => {
    const pt = randomBytes(32);

    const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Flip a bit in the tag
    const badTag = Buffer.from(tag);
    badTag[0] ^= 0x01;

    let threw = false;
    try {
      const decipher = crypto.createDecipheriv('aes-128-gcm', key, iv);
      decipher.setAuthTag(badTag);
      decipher.update(ct);
      decipher.final();
    } catch (e) {
      threw = true;
      assert(
        e.message.includes('authentication failed') ||
        e.message.includes('GCM') ||
        e.message.includes('unable to authenticate'),
        `Wrong error: ${e.message}`);
    }
    assert(threw, 'Should have thrown on bad tag');
  });

  test('Decrypt with missing setAuthTag fails', () => {
    const pt = randomBytes(16);
    const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);

    let threw = false;
    try {
      const decipher = crypto.createDecipheriv('aes-128-gcm', key, iv);
      decipher.update(ct);
      decipher.final();
    } catch (e) {
      threw = true;
    }
    assert(threw, 'Should have thrown on missing setAuthTag');
  });

  test('Decrypt with wrong AAD fails', () => {
    const pt = randomBytes(32);
    const aad = randomBytes(10);

    const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    cipher.setAAD(aad);
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Use different AAD for decrypt
    const badAad = randomBytes(10);
    let threw = false;
    try {
      const decipher = crypto.createDecipheriv('aes-128-gcm', key, iv);
      decipher.setAAD(badAad);
      decipher.setAuthTag(tag);
      decipher.update(ct);
      decipher.final();
    } catch (e) {
      threw = true;
    }
    assert(threw, 'Should have thrown on wrong AAD');
  });

  test('Decrypt with wrong key fails', () => {
    const pt = randomBytes(32);
    const wrongKey = randomBytes(16);

    const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();

    let threw = false;
    try {
      const decipher = crypto.createDecipheriv('aes-128-gcm', wrongKey, iv);
      decipher.setAuthTag(tag);
      decipher.update(ct);
      decipher.final();
    } catch (e) {
      threw = true;
    }
    assert(threw, 'Should have thrown on wrong key');
  });

  test('Decrypt with wrong IV fails', () => {
    const pt = randomBytes(32);
    const wrongIv = randomBytes(12);

    const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();

    let threw = false;
    try {
      const decipher = crypto.createDecipheriv('aes-128-gcm', key, wrongIv);
      decipher.setAuthTag(tag);
      decipher.update(ct);
      decipher.final();
    } catch (e) {
      threw = true;
    }
    assert(threw, 'Should have thrown on wrong IV');
  });

  test('Decrypt with flipped ciphertext bit fails', () => {
    const pt = randomBytes(32);

    const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Flip a bit in the ciphertext
    const badCt = Buffer.from(ct);
    badCt[5] ^= 0x80;

    let threw = false;
    try {
      const decipher = crypto.createDecipheriv('aes-128-gcm', key, iv);
      decipher.setAuthTag(tag);
      decipher.update(badCt);
      decipher.final();
    } catch (e) {
      threw = true;
    }
    assert(threw, 'Should have thrown on corrupted ciphertext');
  });
}

// ---------------------------------------------------------------------------
// 5. Non-GCM modes still work
// ---------------------------------------------------------------------------

function runNonGcmTests() {
  console.log('\n=== Non-GCM Mode Sanity Checks ===');

  test('AES-128-CTR roundtrip', () => {
    const key = randomBytes(16);
    const iv  = randomBytes(16);
    const pt  = randomBytes(100);

    const cipher = crypto.createCipheriv('aes-128-ctr', key, iv);
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);

    const decipher = crypto.createDecipheriv('aes-128-ctr', key, iv);
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);

    assert(bufEq(decrypted, pt), 'CTR roundtrip failed');
  });

  test('AES-256-CTR roundtrip', () => {
    const key = randomBytes(32);
    const iv  = randomBytes(16);
    const pt  = randomBytes(100);

    const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);

    const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);

    assert(bufEq(decrypted, pt), 'AES-256-CTR roundtrip failed');
  });

  test('AES-128-CBC roundtrip', () => {
    const key = randomBytes(16);
    const iv  = randomBytes(16);
    const pt  = randomBytes(32); // Must be block-aligned for CBC

    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);

    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);

    assert(bufEq(decrypted, pt), 'CBC roundtrip failed');
  });

  test('AES-128-CBC  streaming updates', () => {
    const key = randomBytes(16);
    const iv  = randomBytes(16);
    // Must be block-aligned
    const pt  = randomBytes(48);

    // Split across multiple update calls
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    const ctChunks = [];
    ctChunks.push(cipher.update(pt.slice(0, 16)));
    ctChunks.push(cipher.update(pt.slice(16, 40)));
    ctChunks.push(cipher.update(pt.slice(40)));
    ctChunks.push(cipher.final());
    const ct = Buffer.concat(ctChunks);

    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    const ptChunks = [];
    ptChunks.push(decipher.update(ct.slice(0, 10)));
    ptChunks.push(decipher.update(ct.slice(10)));
    ptChunks.push(decipher.final());
    const decrypted = Buffer.concat(ptChunks);

    // For CBC with NoPadding, we can't get partial results from update()
    // so the test checks that total output matches
    assert(bufEq(decrypted, pt), 'CBC streaming roundtrip failed');
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  console.log('GCM Polyfill Tests');
  console.log('==================');

  const runAll = args.length === 0 || args[0] === 'all';

  try {
    if (runAll || args.includes('diag'))     runDiagnostics();
    if (runAll || args.includes('vectors'))  runNistVectors();
    if (runAll || args.includes('roundtrip')) runRoundtripTests();
    if (runAll || args.includes('stream'))   runStreamingTests();
    if (runAll || args.includes('errors'))   runErrorTests();
    if (runAll || args.includes('non-gcm'))  runNonGcmTests();
  } catch (e) {
    console.log(`\n${FAIL}  FATAL: ${e.message}`);
    console.log(e.stack);
    failed++;
  }

  // Summary
  console.log(`\n========================================`);
  console.log(`  ${PASS}: ${passed}  ${FAIL}: ${failed}  ${SKIP}: ${skipped}`);
  console.log(`========================================`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
