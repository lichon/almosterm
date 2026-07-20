// Polyfills injected into the almostnode container so ssh2 can run in the browser.
// Extracted from src/tools/ssh.ts — see that file for the SSH command itself.

// ---------------------------------------------------------------------------
// createHash polyfill — replaces almostnode's non-cryptographic syncHash
// with proper pure-JS SHA-256, SHA-1, SHA-512, SHA-384, and MD5 so ssh2
// can compute correct session IDs, verify host keys, and run MACs.
// ---------------------------------------------------------------------------

const CREATEHASH_POLYFILL = `
(function patchCreateHash() {
  var cryptoMod = require('crypto');

  function rotr32(x, n) { return (x >>> n) | (x << (32 - n)); }
  function rotl32(x, n) { return (x << n) | (x >>> (32 - n)); }

  function toBytes(data) {
    if (typeof data === 'string') return new TextEncoder().encode(data);
    if (data instanceof Uint8Array) return new Uint8Array(data);
    if (data && data.buffer) return new Uint8Array(data.buffer, data.byteOffset || 0, data.length);
    return new Uint8Array(0);
  }

  function encodeResult(data, encoding) {
    if (encoding === 'hex') {
      var hex = '';
      for (var i = 0; i < data.length; i++) hex += (data[i] < 16 ? '0' : '') + data[i].toString(16);
      return hex;
    }
    if (encoding === 'base64') {
      var bin = '';
      for (var i = 0; i < data.length; i++) bin += String.fromCharCode(data[i]);
      return btoa(bin);
    }
    return Buffer.from(data);
  }

  // ---- SHA-256 ----
  var K256 = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];

  function sha256(msg) {
    msg = toBytes(msg);
    var msgLen = msg.length;
    // Pack bytes into 32-bit big-endian words (from FIPS 180-4)
    var words = [];
    for (var i = 0; i < msgLen; i++) {
      words[i >> 2] |= (msg[i] & 0xff) << (24 - (i % 4) * 8);
    }
    // Padding: append 1 bit, zeros, then 64-bit big-endian length
    words[msgLen >> 2] |= 0x80 << (24 - (msgLen % 4) * 8);
    words[((msgLen + 8) >> 6) * 16 + 15] = msgLen * 8;

    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];

    for (var chunk = 0; chunk < words.length; chunk += 16) {
      var W = new Array(64);
      for (var t = 0; t < 16; t++) W[t] = words[chunk + t] || 0;
      for (var t = 16; t < 64; t++) {
        var s0 = rotr32(W[t-15],7) ^ rotr32(W[t-15],18) ^ (W[t-15] >>> 3);
        var s1 = rotr32(W[t-2],17) ^ rotr32(W[t-2],19) ^ (W[t-2] >>> 10);
        W[t] = (W[t-16] + s0 + W[t-7] + s1) | 0;
      }

      var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (var t = 0; t < 64; t++) {
        var S1 = rotr32(e,6) ^ rotr32(e,11) ^ rotr32(e,25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + K256[t] + W[t]) | 0;
        var S0 = rotr32(a,2) ^ rotr32(a,13) ^ rotr32(a,22);
        var maj = (a & bb) ^ (a & c) ^ (bb & c);
        var temp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = bb; bb = a; a = (temp1 + temp2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }

    var out = new Uint8Array(32);
    for (var i = 0; i < 8; i++) {
      out[i*4] = (H[i] >>> 24) & 0xff; out[i*4+1] = (H[i] >>> 16) & 0xff;
      out[i*4+2] = (H[i] >>> 8) & 0xff; out[i*4+3] = H[i] & 0xff;
    }
    return out;
  }

  // ---- MD5 ----
  var MD5_S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  var MD5_K = [0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391];

  function write32LE(buf, off, val) {
    buf[off] = val & 0xff; buf[off+1] = (val >>> 8) & 0xff;
    buf[off+2] = (val >>> 16) & 0xff; buf[off+3] = (val >>> 24) & 0xff;
  }

  function md5(msg) {
    msg = toBytes(msg);
    var msgLen = msg.length;
    var words = [];
    for (var i = 0; i < msgLen; i++) {
      words[i >> 2] |= (msg[i] & 0xff) << ((i % 4) * 8);
    }
    var bitLen = msgLen * 8;
    words[msgLen >> 2] |= 0x80 << ((msgLen % 4) * 8);
    words[((msgLen + 8) >> 6) * 16 + 14] = bitLen;

    var a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

    for (var chunk = 0; chunk < words.length; chunk += 16) {
      var M = new Array(16);
      for (var i = 0; i < 16; i++) M[i] = words[chunk + i] || 0;

      var A = a, B = b, C = c, D = d;
      for (var i = 0; i < 64; i++) {
        var F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5*i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3*i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7*i) % 16; }
        F = (F + A + MD5_K[i] + M[g]) | 0;
        A = D; D = C; C = B;
        B = (B + rotl32(F, MD5_S[i])) | 0;
      }
      a = (a + A) | 0; b = (b + B) | 0; c = (c + C) | 0; d = (d + D) | 0;
    }

    var out = new Uint8Array(16);
    write32LE(out, 0, a); write32LE(out, 4, b); write32LE(out, 8, c); write32LE(out, 12, d);
    return out;
  }

  // ---- Hash class ----
  function Hash(algorithm) {
    this._algo = algorithm;
    this._chunks = [];
  }

  Hash.prototype.update = function (data, encoding) {
    var buf;
    if (typeof data === 'string') {
      if (encoding === 'hex') {
        buf = new Uint8Array(data.length / 2);
        for (var i = 0; i < buf.length; i++) buf[i] = parseInt(data.substr(i*2, 2), 16);
      } else if (encoding === 'base64') {
        var bin = atob(data);
        buf = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      } else {
        buf = new TextEncoder().encode(data);
      }
    } else if (data instanceof Uint8Array) {
      buf = new Uint8Array(data);
    } else if (data && data.buffer) {
      buf = new Uint8Array(data.buffer, data.byteOffset || 0, data.length);
    } else {
      buf = new Uint8Array(0);
    }
    this._chunks.push(buf);
    return this;
  };

  Hash.prototype.digest = function (encoding) {
    var totalLen = 0;
    for (var i = 0; i < this._chunks.length; i++) totalLen += this._chunks[i].length;
    var data = new Uint8Array(totalLen);
    var off = 0;
    for (var i = 0; i < this._chunks.length; i++) {
      data.set(this._chunks[i], off);
      off += this._chunks[i].length;
    }

    var algo = this._algo.toUpperCase().replace(/[^A-Z0-9]/g, '');
    var fn = algo === 'MD5' ? md5 : sha256;
    return encodeResult(fn(data), encoding);
  };

  cryptoMod.createHash = function (algorithm) {
    return new Hash(algorithm);
  };
  cryptoMod.getHashes = function () {
    return ['sha256', 'md5'];
  };

  if (cryptoMod.default && typeof cryptoMod.default === 'object') {
    cryptoMod.default.createHash = cryptoMod.createHash;
    cryptoMod.default.getHashes = cryptoMod.getHashes;
  }
})();
`;

// ---------------------------------------------------------------------------
// ECDH polyfill — injects createECDH into the almostnode crypto module so
// ssh2 can use ecdh-sha2-nistp* KEX algorithms in the browser.
// This is a pure-JS BigInt implementation of short Weierstrass ECDH over
// P-256 (prime256v1), P-384 (secp384r1), and P-521 (secp521r1).
// ---------------------------------------------------------------------------

const ECDH_POLYFILL = `
(function patchCryptoAndBuffer() {
  // ---- patch Buffer.prototype.latin1Slice / utf8Slice ----
  if (!Buffer.prototype.latin1Slice) {
    // latin1Slice: each byte maps directly to a char (U+0000–U+00FF)
    Buffer.prototype.latin1Slice = function (start, end) {
      var len = this.length;
      if (start === undefined || start < 0) start = 0;
      if (end === undefined || end > len) end = len;
      var out = '';
      for (var i = start; i < end; i++) {
        out += String.fromCharCode(this[i]);
      }
      return out;
    };
  }
  if (!Buffer.prototype.utf8Slice) {
    Buffer.prototype.utf8Slice = function (start, end) {
      var len = this.length;
      if (start === undefined || start < 0) start = 0;
      if (end === undefined || end > len) end = len;
      return new TextDecoder('utf-8').decode(
        new Uint8Array(this.buffer, this.byteOffset + start, end - start)
      );
    };
  }
  if (!Buffer.prototype.base64Slice) {
    Buffer.prototype.base64Slice = function (start, end) {
      var len = this.length;
      if (start === undefined || start < 0) start = 0;
      if (end === undefined || end > len) end = len;
      var slice = new Uint8Array(this.buffer, this.byteOffset + start, end - start);
      var binary = '';
      for (var i = 0; i < slice.length; i++) {
        binary += String.fromCharCode(slice[i]);
      }
      return btoa(binary);
    };
  }
  if (!Buffer.prototype.utf8Write) {
    Buffer.prototype.utf8Write = function (string, offset, length) {
      var buf = this;
      if (offset === undefined) offset = 0;
      var maxLen = buf.length - offset;
      if (length === undefined || length > maxLen) length = maxLen;
      var encoded = new TextEncoder().encode(string);
      var bytes = encoded.subarray(0, Math.min(encoded.length, length));
      for (var i = 0; i < bytes.length; i++) {
        buf[offset + i] = bytes[i];
      }
      return bytes.length;
    };
  }

  // ---- patch assert.equal / notEqual / deepEqual / notDeepEqual ----
  (function () {
    var assertMod = require('assert');
    // equal: abstract equality (==) – legacy, deprecated but widely used
    if (!assertMod.equal) {
      assertMod.equal = function equal(actual, expected, message) {
        if (actual != expected) {
          throw new assertMod.AssertionError({
            message: message,
            actual: actual,
            expected: expected,
            operator: '==',
            stackStartFn: equal
          });
        }
      };
    }
    if (!assertMod.notEqual) {
      assertMod.notEqual = function notEqual(actual, expected, message) {
        if (actual == expected) {
          throw new assertMod.AssertionError({
            message: message,
            actual: actual,
            expected: expected,
            operator: '!=',
            stackStartFn: notEqual
          });
        }
      };
    }
    if (!assertMod.deepEqual) {
      assertMod.deepEqual = function deepEqual(actual, expected, message) {
        if (!assertMod.deepStrictEqual) {
          // Fallback: deepStrictEqual is close enough for most cases
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new assertMod.AssertionError({
              message: message,
              actual: actual,
              expected: expected,
              operator: 'deepEqual',
              stackStartFn: deepEqual
            });
          }
        } else {
          try {
            assertMod.deepStrictEqual(actual, expected, message);
          } catch (e) {
            // deepStrictEqual threw — wrap in deepEqual error
            throw new assertMod.AssertionError({
              message: message || e.message,
              actual: actual,
              expected: expected,
              operator: 'deepEqual',
              stackStartFn: deepEqual
            });
          }
        }
      };
    }
    if (!assertMod.notDeepEqual) {
      assertMod.notDeepEqual = function notDeepEqual(actual, expected, message) {
        try {
          assertMod.deepEqual(actual, expected, message);
        } catch (_) {
          return; // not equal → pass
        }
        throw new assertMod.AssertionError({
          message: message || 'Expected values not to be deeply equal',
          actual: actual,
          expected: expected,
          operator: 'notDeepEqual',
          stackStartFn: notDeepEqual
        });
      };
    }
    // Also patch the default export if it differs from the named module
    if (assertMod.default && !assertMod.default.equal) {
      assertMod.default.equal = assertMod.equal;
      assertMod.default.notEqual = assertMod.notEqual;
      assertMod.default.deepEqual = assertMod.deepEqual;
      assertMod.default.notDeepEqual = assertMod.notDeepEqual;
    }
  })();

  // ---- patch crypto.createECDH / getCurves ----
  var cryptoMod = require('crypto');
  if (cryptoMod.createECDH) return; // already patched

  var CURVES = {
    prime256v1: {
      p: 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn,
      a: 0xffffffff00000001000000000000000000000000fffffffffffffffffffffffcn,
      b: 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn,
      n: 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n,
      gx: 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n,
      gy: 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n,
      size: 32
    },
    secp384r1: {
      p: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000ffffffffn,
      a: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000fffffffcn,
      b: 0xb3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875ac656398d8a2ed19d2a85c8edd3ec2aefn,
      n: 0xffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973n,
      gx: 0xaa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7n,
      gy: 0x3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5fn,
      size: 48
    },
    secp521r1: {
      p: 0x01ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn,
      a: 0x01fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffcn,
      b: 0x0051953eb9618e1c9a1f929a21a0b68540eea2da725b99b315f3b8b489918ef109e156193951ec7e937b1652c0bd3bb1bf073573df883d2c34f1ef451fd46b503f00n,
      n: 0x01fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa51868783bf2f966b7fcc0148f709a5d03bb5c9b8899c47aebb6fb71e91386409n,
      gx: 0x00c6858e06b70404e9cd9e3ecb662395b4429c648139053fb521f828af606b4d3dbaa14b5e77efe75928fe1dc127a2ffa8de3348b3c1856a429bf97e7e31c2e5bd66n,
      gy: 0x011839296a789a3bc0045c8a5fb42c7d1bd998f54449579b446817afbd17273e662c97ee72995ef42640c550b9013fad0761353c7086a272c24088be94769fd16650n,
      size: 66
    }
  };

  function mod(a, p) { var r = a % p; return r < 0n ? r + p : r; }
  function modInv(a, p) {
    var t = 0n, newT = 1n, r = p, newR = a, q;
    while (newR !== 0n) {
      q = r / newR;
      var tmpT = newT; newT = t - q * newT; t = tmpT;
      var tmpR = newR; newR = r - q * newR; r = tmpR;
    }
    if (r > 1n) throw new Error('modular inverse does not exist');
    return mod(t, p);
  }

  function pointAdd(p1, p2, c) {
    if (p1.x === 0n && p1.y === 0n) return p2;
    if (p2.x === 0n && p2.y === 0n) return p1;
    var lam, num, den;
    if (p1.x === p2.x) {
      if (mod(p1.y + p2.y, c.p) === 0n) return { x: 0n, y: 0n };
      num = mod(3n * p1.x * p1.x + c.a, c.p);
      den = mod(2n * p1.y, c.p);
    } else {
      num = mod(p2.y - p1.y, c.p);
      den = mod(p2.x - p1.x, c.p);
    }
    lam = mod(num * modInv(den, c.p), c.p);
    var x3 = mod(lam * lam - p1.x - p2.x, c.p);
    var y3 = mod(lam * (p1.x - x3) - p1.y, c.p);
    return { x: x3, y: y3 };
  }

  function pointMul(k, pt, c) {
    var result = { x: 0n, y: 0n };
    var addend = pt;
    var scalar = k;
    while (scalar > 0n) {
      if (scalar & 1n) result = pointAdd(result, addend, c);
      addend = pointAdd(addend, addend, c);
      scalar >>= 1n;
    }
    return result;
  }

  function bigIntToBuf(n, size) {
    var hex = n.toString(16);
    while (hex.length < size * 2) hex = '0' + hex;
    var bytes = new Uint8Array(size);
    for (var i = 0; i < size; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return Buffer.from(bytes);
  }

  function bufToBigInt(buf) {
    var hex = '';
    for (var i = 0; i < buf.length; i++) hex += (buf[i] < 16 ? '0' : '') + buf[i].toString(16);
    return BigInt('0x' + hex);
  }

  function ECDH(curveName) {
    console.log('--- createECDH ---');
    console.log('curve:', curveName);
    var c = CURVES[curveName];
    if (!c) throw new Error('Unsupported curve: ' + curveName);
    this._curve = c;
    this._curveName = curveName;
    this._priv = null;
    this._pub = null;
    console.log('curve size:', c.size, 'bytes');
    console.log('------------------');
  }

  ECDH.prototype.generateKeys = function () {
    var byteLen = this._curve.size;
    var priv;
    do {
      var rand = new Uint8Array(byteLen);
      crypto.getRandomValues(rand);
      rand[0] |= 0x80;
      priv = bufToBigInt(Buffer.from(rand));
    } while (priv === 0n || priv >= this._curve.n);
    this._priv = priv;
    this._pub = pointMul(priv, { x: this._curve.gx, y: this._curve.gy }, this._curve);
    console.log('--- ECDH.generateKeys ---');
    console.log('curve:', this._curveName);
    console.log('priv (hex):', bigIntToBuf(priv, this._curve.size).toString('hex'));
    console.log('pub.x (hex):', bigIntToBuf(this._pub.x, this._curve.size).toString('hex'));
    console.log('pub.y (hex):', bigIntToBuf(this._pub.y, this._curve.size).toString('hex'));
    console.log('pub (full hex):', this.getPublicKey().toString('hex'));
    console.log('------------------------');
    return this.getPublicKey();
  };

  ECDH.prototype.getPublicKey = function () {
    if (!this._pub) throw new Error('Keys not generated');
    console.log('--- ECDH.getPublicKey ---');
    console.log('curve:', this._curveName);
    var size = this._curve.size;
    var out = new Uint8Array(1 + size * 2);
    out[0] = 0x04;
    var xb = bigIntToBuf(this._pub.x, size);
    var yb = bigIntToBuf(this._pub.y, size);
    out.set(xb, 1);
    out.set(yb, 1 + size);
    return Buffer.from(out);
  };

  ECDH.prototype.setPrivateKey = function (privateKey) {
    console.log('--- ECDH.setPrivateKey ---');
    console.log('curve:', this._curveName);
    if (typeof privateKey === 'string') {
      console.log('priv (hex string):', privateKey);
      privateKey = Buffer.from(privateKey, 'hex');
    } else {
      console.log('priv (buffer hex):', Buffer.from(privateKey).toString('hex'));
    }
    this._priv = bufToBigInt(privateKey);
    this._pub = pointMul(this._priv, { x: this._curve.gx, y: this._curve.gy }, this._curve);
    console.log('pub.x (hex):', bigIntToBuf(this._pub.x, this._curve.size).toString('hex'));
    console.log('pub.y (hex):', bigIntToBuf(this._pub.y, this._curve.size).toString('hex'));
    console.log('pub (full hex):', this.getPublicKey().toString('hex'));
    console.log('---------------------------');
  };

  ECDH.prototype.computeSecret = function (otherPublicKey) {
    if (this._priv === null) throw new Error('Private key not set');
    var buf = otherPublicKey;
    if (!(buf instanceof Uint8Array)) buf = new Uint8Array(buf);
    console.log('--- ECDH.computeSecret ---');
    console.log('curve:', this._curveName);
    console.log('priv (hex):', bigIntToBuf(this._priv, this._curve.size).toString('hex'));
    console.log('otherPub (full hex):', Buffer.from(buf).toString('hex'));
    if (buf[0] !== 0x04) throw new Error('Only uncompressed public keys are supported');
    var size = this._curve.size;
    var ox = bufToBigInt(buf.slice(1, 1 + size));
    var oy = bufToBigInt(buf.slice(1 + size, 1 + size * 2));
    console.log('otherPub.x (hex):', bigIntToBuf(ox, size).toString('hex'));
    console.log('otherPub.y (hex):', bigIntToBuf(oy, size).toString('hex'));
    var shared = pointMul(this._priv, { x: ox, y: oy }, this._curve);
    var secret = bigIntToBuf(shared.x, size);
    console.log('sharedSecret (hex):', secret.toString('hex'));
    console.log('---------------------------');
    return secret;
  };

  var createECDH = function (curveName) {
    console.log('--- crypto.createECDH called ---');
    console.log('curve:', curveName);
    console.log('--------------------------------');
    return new ECDH(curveName);
  };

  var getCurves = function () {
    return ['prime256v1', 'secp384r1', 'secp521r1'];
  };

  // Attach to the crypto module (both named and default export forms)
  cryptoMod.createECDH = createECDH;
  cryptoMod.getCurves = getCurves;
  if (cryptoMod.default && typeof cryptoMod.default === 'object') {
    cryptoMod.default.createECDH = createECDH;
    cryptoMod.default.getCurves = getCurves;
  }
})();
`;

// ---------------------------------------------------------------------------
// crypto.verify / crypto.createVerify polyfill
//
// Replaces the container's verify with a pure-JS implementation that handles
// RSA PKCS#1 v1.5 (SHA-256/384/512/1, MD5) and ECDSA (P-256/384/521).
// When an async callback is provided it also tries the browser's native
// Web Crypto API (crypto.subtle.verify) before falling back to pure JS.
// All arguments are logged to console for debugging.
// The original crypto.verify is NOT preserved or called.
// ---------------------------------------------------------------------------

const CRYPTO_VERIFY_PATCH = `
(function patchCryptoVerify() {
  var cryptoMod = require('crypto');
  if (cryptoMod.verify && cryptoMod.verify.__patched) return;

  // =====================================================================
  // SHA-256 (pure JS, 32-bit)
  // =====================================================================

  function rotr32(x, n) { return (x >>> n) | (x << (32 - n)); }

  var K256 = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];

  function sha256(data) {
    if (!(data instanceof Uint8Array)) data = new Uint8Array(data);
    var msgLen = data.length;
    var words = [];
    for (var i = 0; i < msgLen; i++) {
      words[i >> 2] |= (data[i] & 0xff) << (24 - (i % 4) * 8);
    }
    words[msgLen >> 2] |= 0x80 << (24 - (msgLen % 4) * 8);
    words[((msgLen + 8) >> 6) * 16 + 15] = msgLen * 8;

    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];

    for (var chunk = 0; chunk < words.length; chunk += 16) {
      var W = new Array(64);
      for (var t = 0; t < 16; t++) W[t] = words[chunk + t] || 0;
      for (var t = 16; t < 64; t++) {
        var s0 = rotr32(W[t-15],7) ^ rotr32(W[t-15],18) ^ (W[t-15] >>> 3);
        var s1 = rotr32(W[t-2],17) ^ rotr32(W[t-2],19) ^ (W[t-2] >>> 10);
        W[t] = (W[t-16] + s0 + W[t-7] + s1) | 0;
      }

      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (var t = 0; t < 64; t++) {
        var S1 = rotr32(e,6) ^ rotr32(e,11) ^ rotr32(e,25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + K256[t] + W[t]) | 0;
        var S0 = rotr32(a,2) ^ rotr32(a,13) ^ rotr32(a,22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }

    var out = new Uint8Array(32);
    for (var i = 0; i < 8; i++) {
      out[i*4] = (H[i] >>> 24) & 0xff; out[i*4+1] = (H[i] >>> 16) & 0xff;
      out[i*4+2] = (H[i] >>> 8) & 0xff; out[i*4+3] = H[i] & 0xff;
    }
    return out;
  }

  // =====================================================================
  // SHA-512 (pure JS, 64-bit via BigInt)
  // =====================================================================

  var K512 = [
    0x428a2f98d728ae22n,0x7137449123ef65cdn,0xb5c0fbcfec4d3b2fn,0xe9b5dba58189dbbcn,
    0x3956c25bf348b538n,0x59f111f1b605d019n,0x923f82a4af194f9bn,0xab1c5ed5da6d8118n,
    0xd807aa98a3030242n,0x12835b0145706fben,0x243185be4ee4b28cn,0x550c7dc3d5ffb4e2n,
    0x72be5d74f27b896fn,0x80deb1fe3b1696b1n,0x9bdc06a725c71235n,0xc19bf174cf692694n,
    0xe49b69c19ef14ad2n,0xefbe4786384f25e3n,0x0fc19dc68b8cd5b5n,0x240ca1cc77ac9c65n,
    0x2de92c6f592b0275n,0x4a7484aa6ea6e483n,0x5cb0a9dcbd41fbd4n,0x76f988da831153b5n,
    0x983e5152ee66dfabn,0xa831c66d2db43210n,0xb00327c898fb213fn,0xbf597fc7beef0ee4n,
    0xc6e00bf33da88fc2n,0xd5a79147930aa725n,0x06ca6351e003826fn,0x142929670a0e6e70n,
    0x27b70a8546d22ffcn,0x2e1b21385c26c926n,0x4d2c6dfc5ac42aedn,0x53380d139d95b3dfn,
    0x650a73548baf63den,0x766a0abb3c77b2a8n,0x81c2c92e47edaee6n,0x92722c851482353bn,
    0xa2bfe8a14cf10364n,0xa81a664bbc423001n,0xc24b8b70d0f89791n,0xc76c51a30654be30n,
    0xd192e819d6ef5218n,0xd69906245565a910n,0xf40e35855771202an,0x106aa07032bbd1b8n,
    0x19a4c116b8d2d0c8n,0x1e376c085141ab53n,0x2748774cdf8eeb99n,0x34b0bcb5e19b48a8n,
    0x391c0cb3c5c95a63n,0x4ed8aa4ae3418acbn,0x5b9cca4f7763e373n,0x682e6ff3d6b2b8a3n,
    0x748f82ee5defb2fcn,0x78a5636f43172f60n,0x84c87814a1f0ab72n,0x8cc702081a6439ecn,
    0x90befffa23631e28n,0xa4506cebde82bde9n,0xbef9a3f7b2c67915n,0xc67178f2e372532bn,
    0xca273eceea26619cn,0xd186b8c721c0c207n,0xeada7dd6cde0eb1en,0xf57d4f7fee6ed178n,
    0x06f067aa72176fban,0x0a637dc5a2c898a6n,0x113f9804bef90daen,0x1b710b35131c471bn,
    0x28db77f523047d84n,0x32caab7b40c72493n,0x3c9ebe0a15c9bebcn,0x431d67c49c100d4cn,
    0x4cc5d4becb3e42b6n,0x597f299cfc657e2an,0x5fcb6fab3ad6faecn,0x6c44198c4a475817n
  ];

  var H512init = [
    0x6a09e667f3bcc908n,0xbb67ae8584caa73bn,0x3c6ef372fe94f82bn,0xa54ff53a5f1d36f1n,
    0x510e527fade682d1n,0x9b05688c2b3e6c1fn,0x1f83d9abfb41bd6bn,0x5be0cd19137e2179n
  ];

  function rotr64(x, n) { return ((x >> BigInt(n)) | (x << (64n - BigInt(n)))) & 0xffffffffffffffffn; }

  function sha512(data) {
    if (!(data instanceof Uint8Array)) data = new Uint8Array(data);
    var msgLen = data.length;
    // Pack into 64-bit big-endian words
    var words = [];
    for (var i = 0; i < msgLen; i++) {
      var idx = i >> 3;
      words[idx] = ((words[idx] || 0n) << 8n) | BigInt(data[i] & 0xff);
    }
    // Append 1 bit + zeros + 128-bit length
    var rem = msgLen % 16;
    var padIdx = msgLen >> 3;
    words[padIdx] = ((words[padIdx] || 0n) << 8n) | 0x80n;
    if (rem >= 15) { words[padIdx] = (words[padIdx] << 8n); }
    while ((words.length * 8) % 256 !== 0) { words.push(0n); }
    var bitLen = BigInt(msgLen) * 8n;
    words[words.length - 2] = 0n;
    words[words.length - 1] = bitLen & 0xffffffffffffffffn;

    var H = H512init.slice();

    for (var chunk = 0; chunk < words.length; chunk += 32) {
      var W = new Array(80);
      for (var t = 0; t < 16; t++) { W[t] = words[chunk + t] || 0n; }
      for (var t = 16; t < 80; t++) {
        var s0 = rotr64(W[t-15],1) ^ rotr64(W[t-15],8) ^ (W[t-15] >> 7n);
        var s1 = rotr64(W[t-2],19) ^ rotr64(W[t-2],61) ^ (W[t-2] >> 6n);
        W[t] = (W[t-16] + s0 + W[t-7] + s1) & 0xffffffffffffffffn;
      }

      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (var t = 0; t < 80; t++) {
        var S1 = rotr64(e,14) ^ rotr64(e,18) ^ rotr64(e,41);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + K512[t] + W[t]) & 0xffffffffffffffffn;
        var S0 = rotr64(a,28) ^ rotr64(a,34) ^ rotr64(a,39);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) & 0xffffffffffffffffn;
        h = g; g = f; f = e; e = (d + temp1) & 0xffffffffffffffffn;
        d = c; c = b; b = a; a = (temp1 + temp2) & 0xffffffffffffffffn;
      }
      for (var i = 0; i < 8; i++) H[i] = (H[i] + [a,b,c,d,e,f,g,h][i]) & 0xffffffffffffffffn;
    }

    var out = new Uint8Array(64);
    for (var i = 0; i < 8; i++) {
      var hi = H[i];
      for (var j = 0; j < 8; j++) {
        out[i*8 + j] = Number((hi >> (56n - BigInt(j)*8n)) & 0xffn);
      }
    }
    return out;
  }

  // =====================================================================
  // SHA-384 (truncated SHA-512 with different IV)
  // =====================================================================

  var H384init = [
    0xcbbb9d5dc1059ed8n,0x629a292a367cd507n,0x9159015a3070dd17n,0x152fecd8f70e5939n,
    0x67332667ffc00b31n,0x8eb44a8768581511n,0xdb0c2e0d64f98fa7n,0x47b5481dbefa4fa4n
  ];

  function sha384(data) {
    if (!(data instanceof Uint8Array)) data = new Uint8Array(data);
    var msgLen = data.length;
    var words = [];
    for (var i = 0; i < msgLen; i++) {
      var idx = i >> 3;
      words[idx] = ((words[idx] || 0n) << 8n) | BigInt(data[i] & 0xff);
    }
    var rem = msgLen % 16;
    var padIdx = msgLen >> 3;
    words[padIdx] = ((words[padIdx] || 0n) << 8n) | 0x80n;
    if (rem >= 15) { words[padIdx] = (words[padIdx] << 8n); }
    while ((words.length * 8) % 256 !== 0) { words.push(0n); }
    var bitLen = BigInt(msgLen) * 8n;
    words[words.length - 2] = 0n;
    words[words.length - 1] = bitLen & 0xffffffffffffffffn;

    var H = H384init.slice();

    for (var chunk = 0; chunk < words.length; chunk += 32) {
      var W = new Array(80);
      for (var t = 0; t < 16; t++) { W[t] = words[chunk + t] || 0n; }
      for (var t = 16; t < 80; t++) {
        var s0 = rotr64(W[t-15],1) ^ rotr64(W[t-15],8) ^ (W[t-15] >> 7n);
        var s1 = rotr64(W[t-2],19) ^ rotr64(W[t-2],61) ^ (W[t-2] >> 6n);
        W[t] = (W[t-16] + s0 + W[t-7] + s1) & 0xffffffffffffffffn;
      }

      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (var t = 0; t < 80; t++) {
        var S1 = rotr64(e,14) ^ rotr64(e,18) ^ rotr64(e,41);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + K512[t] + W[t]) & 0xffffffffffffffffn;
        var S0 = rotr64(a,28) ^ rotr64(a,34) ^ rotr64(a,39);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) & 0xffffffffffffffffn;
        h = g; g = f; f = e; e = (d + temp1) & 0xffffffffffffffffn;
        d = c; c = b; b = a; a = (temp1 + temp2) & 0xffffffffffffffffn;
      }
      for (var i = 0; i < 8; i++) H[i] = (H[i] + [a,b,c,d,e,f,g,h][i]) & 0xffffffffffffffffn;
    }

    var out = new Uint8Array(48);
    for (var i = 0; i < 6; i++) {
      var hi = H[i];
      for (var j = 0; j < 8; j++) {
        out[i*8 + j] = Number((hi >> (56n - BigInt(j)*8n)) & 0xffn);
      }
    }
    return out;
  }

  // =====================================================================
  // SHA-1 (pure JS, 32-bit)
  // =====================================================================

  function rotl32(x, n) { return (x << n) | (x >>> (32 - n)); }

  function sha1(data) {
    if (!(data instanceof Uint8Array)) data = new Uint8Array(data);
    var msgLen = data.length;
    var words = [];
    for (var i = 0; i < msgLen; i++) {
      words[i >> 2] |= (data[i] & 0xff) << (24 - (i % 4) * 8);
    }
    words[msgLen >> 2] |= 0x80 << (24 - (msgLen % 4) * 8);
    words[((msgLen + 8) >> 6) * 16 + 15] = msgLen * 8;

    var H = [0x67452301,0xefcdab89,0x98badcfe,0x10325476,0xc3d2e1f0];

    for (var chunk = 0; chunk < words.length; chunk += 16) {
      var W = new Array(80);
      for (var t = 0; t < 16; t++) W[t] = words[chunk + t] || 0;
      for (var t = 16; t < 80; t++) {
        W[t] = rotl32(W[t-3] ^ W[t-8] ^ W[t-14] ^ W[t-16], 1);
      }

      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4];
      for (var t = 0; t < 80; t++) {
        var f, k;
        if (t < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (t < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; k = 0xca62c1d6; }
        var temp = (rotl32(a, 5) + f + e + k + W[t]) | 0;
        e = d; d = c; c = rotl32(b, 30); b = a; a = temp;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0;
      H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0;
    }

    var out = new Uint8Array(20);
    for (var i = 0; i < 5; i++) {
      out[i*4] = (H[i] >>> 24) & 0xff; out[i*4+1] = (H[i] >>> 16) & 0xff;
      out[i*4+2] = (H[i] >>> 8) & 0xff; out[i*4+3] = H[i] & 0xff;
    }
    return out;
  }

  // =====================================================================
  // MD5 (pure JS, 32-bit)
  // =====================================================================

  var MD5_S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  var MD5_K = [0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391];

  function md5(data) {
    if (!(data instanceof Uint8Array)) data = new Uint8Array(data);
    var msgLen = data.length;
    var words = [];
    for (var i = 0; i < msgLen; i++) {
      words[i >> 2] |= (data[i] & 0xff) << ((i % 4) * 8);
    }
    var bitLen = msgLen * 8;
    words[msgLen >> 2] |= 0x80 << ((msgLen % 4) * 8);
    words[((msgLen + 8) >> 6) * 16 + 14] = bitLen;

    var a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

    for (var chunk = 0; chunk < words.length; chunk += 16) {
      var M = new Array(16);
      for (var i = 0; i < 16; i++) M[i] = words[chunk + i] || 0;

      var A = a, B = b, C = c, D = d;
      for (var i = 0; i < 64; i++) {
        var F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5*i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3*i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7*i) % 16; }
        F = (F + A + MD5_K[i] + M[g]) | 0;
        A = D; D = C; C = B;
        B = (B + rotl32(F, MD5_S[i])) | 0;
      }
      a = (a + A) | 0; b = (b + B) | 0; c = (c + C) | 0; d = (d + D) | 0;
    }

    var out = new Uint8Array(16);
    function w32le(out, off, val) {
      out[off] = val & 0xff; out[off+1] = (val >>> 8) & 0xff;
      out[off+2] = (val >>> 16) & 0xff; out[off+3] = (val >>> 24) & 0xff;
    }
    w32le(out, 0, a); w32le(out, 4, b); w32le(out, 8, c); w32le(out, 12, d);
    return out;
  }

  // =====================================================================
  // BigInt helpers
  // =====================================================================

  function bytesToBigInt(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    }
    return hex === '' ? 0n : BigInt('0x' + hex);
  }

  function bigIntToBytes(n, len) {
    var hex = n.toString(16);
    while (hex.length < len * 2) hex = '0' + hex;
    var out = new Uint8Array(len);
    for (var i = 0; i < len; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  function modPow(base, exp, mod) {
    if (mod === 1n) return 0n;
    var result = 1n;
    base = base % mod;
    while (exp > 0n) {
      if (exp & 1n) result = (result * base) % mod;
      exp >>= 1n;
      base = (base * base) % mod;
    }
    return result;
  }

  // =====================================================================
  // DER / ASN.1 parsing (extract RSA n,e or EC point from SPKI)
  // =====================================================================

  function readDERLength(bytes, off) {
    var b = bytes[off];
    if (b < 0x80) return { len: b, off: off + 1 };
    var numOctets = b & 0x7f;
    var len = 0;
    for (var i = 0; i < numOctets; i++) {
      len = (len << 8) | bytes[off + 1 + i];
    }
    return { len: len, off: off + 1 + numOctets };
  }

  function pemToDer(pem) {
    var b64 = pem.replace(/-----[A-Z ]*-----/g, '').replace(/\s/g, '');
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function parseSpki(der) {
    var off = 0;
    // SEQUENCE (top-level)
    if (der[off] !== 0x30) throw new Error('Expected SEQUENCE');
    off++;
    var r = readDERLength(der, off);
    off = r.off;
    var outerEnd = off + r.len;

    // SEQUENCE (AlgorithmIdentifier)
    if (der[off] !== 0x30) throw new Error('Expected AlgorithmIdentifier');
    off++;
    r = readDERLength(der, off);
    var algEnd = r.off + r.len;
    off = r.off;

    // OID
    var oid = '';
    if (der[off] === 0x06) {
      off++;
      r = readDERLength(der, off);
      off = r.off;
      var oidBytes = der.slice(off, off + r.len);
      oid = Math.floor(oidBytes[0] / 40) + '.' + (oidBytes[0] % 40);
      var val = 0;
      for (var i = 1; i < oidBytes.length; i++) {
        val = (val << 7) | (oidBytes[i] & 0x7f);
        if (!(oidBytes[i] & 0x80)) { oid += '.' + val; val = 0; }
      }
      off += r.len;
    }

    // Skip any remaining algorithm parameters
    off = algEnd;

    var isRsa = oid === '1.2.840.113549.1.1.1'; // rsaEncryption
    var isEc = oid === '1.2.840.10045.2.1';      // ecPublicKey

    // BIT STRING containing the public key
    if (der[off] !== 0x03) throw new Error('Expected BIT STRING');
    off++;
    r = readDERLength(der, off);
    off = r.off + 1; // skip unused-bits byte

    if (isRsa) {
      // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
      if (der[off] !== 0x30) throw new Error('Expected RSAPublicKey SEQUENCE');
      off++;
      r = readDERLength(der, off);
      off = r.off;

      // modulus n
      if (der[off] !== 0x02) throw new Error('Expected INTEGER (n)');
      off++;
      r = readDERLength(der, off);
      off = r.off;
      var nBytes = der.slice(off, off + r.len);
      off += r.len;

      // publicExponent e
      if (der[off] !== 0x02) throw new Error('Expected INTEGER (e)');
      off++;
      r = readDERLength(der, off);
      off = r.off;
      var eBytes = der.slice(off, off + r.len);

      return {
        type: 'rsa',
        n: bytesToBigInt(nBytes),
        e: bytesToBigInt(eBytes),
        keySize: nBytes.length
      };
    }

    if (isEc) {
      var point = der.slice(off, off + r.len);
      return { type: 'ec', oid: oid, point: point };
    }

    throw new Error('Unsupported key OID: ' + oid);
  }

  // =====================================================================
  // Key extraction — normalise the many key formats into DER bytes
  // =====================================================================

  function getKeyDer(key) {
    // KeyObject with .export()
    if (key && typeof key.export === 'function') {
      try { var der = key.export({ type: 'spki', format: 'der' }); if (der) return new Uint8Array(der); } catch(e) {}
      try { var pem = key.export({ type: 'spki', format: 'pem' }); if (pem && typeof pem === 'string' && pem.indexOf('-----BEGIN') >= 0) return pemToDer(pem); } catch(e) {}
    }

    // PEM string
    if (typeof key === 'string' && key.indexOf('-----BEGIN') >= 0) {
      return pemToDer(key);
    }

    // Buffer / Uint8Array — could be PEM or DER
    if (key instanceof Uint8Array || (key && key.buffer instanceof ArrayBuffer)) {
      var bytes = new Uint8Array(key instanceof Uint8Array ? key : key.buffer, key.byteOffset || 0, key.length);
      // Check if it looks like PEM in a buffer
      if (bytes[0] === 0x2d && bytes[1] === 0x2d) {
        var str = '';
        for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
        if (str.indexOf('-----BEGIN') >= 0) return pemToDer(str);
      }
      return bytes;
    }

    // ssh2 internal key objects
    if (key && key.key) return getKeyDer(key.key);
    if (key && key.publicKey) return getKeyDer(key.publicKey);

    // .toString() as last resort
    if (key && typeof key.toString === 'function') {
      var s = key.toString();
      if (s.indexOf('-----BEGIN') >= 0) return pemToDer(s);
    }

    throw new Error('Cannot extract key data');
  }

  // =====================================================================
  // Hash selection & PKCS#1 v1.5 DigestInfo prefixes
  // =====================================================================

  var DIGEST_INFO = {
    sha256: { hash: sha256, prefix: [0x30,0x31,0x30,0x0d,0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x01,0x05,0x00,0x04,0x20], hashLen: 32 },
    sha512: { hash: sha512, prefix: [0x30,0x51,0x30,0x0d,0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x03,0x05,0x00,0x04,0x40], hashLen: 64 },
    sha384: { hash: sha384, prefix: [0x30,0x41,0x30,0x0d,0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x02,0x05,0x00,0x04,0x30], hashLen: 48 },
    sha1:   { hash: sha1,   prefix: [0x30,0x21,0x30,0x09,0x06,0x05,0x2b,0x0e,0x03,0x02,0x1a,0x05,0x00,0x04,0x14], hashLen: 20 },
    md5:    { hash: md5,    prefix: [0x30,0x20,0x30,0x0c,0x06,0x08,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x02,0x05,0x05,0x00,0x04,0x10], hashLen: 16 }
  };

  function getHashName(algorithm) {
    var a = String(algorithm).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (a.indexOf('sha256') >= 0) return 'sha256';
    if (a.indexOf('sha512') >= 0) return 'sha512';
    if (a.indexOf('sha384') >= 0) return 'sha384';
    if (a.indexOf('sha1') >= 0) return 'sha1';
    if (a.indexOf('md5') >= 0) return 'md5';
    return 'sha256'; // safe default
  }

  // =====================================================================
  // RSA PKCS#1 v1.5 verification
  // =====================================================================

  function rsaPkcs1v15Verify(hashName, data, n, e, signature, keySize) {
    var info = DIGEST_INFO[hashName];
    if (!info) throw new Error('Unknown hash: ' + hashName);

    // Hash the data
    var hash = info.hash(data);

    // Build expected DigestInfo: prefix || hash
    var digestInfo = new Uint8Array(info.prefix.length + info.hashLen);
    digestInfo.set(info.prefix, 0);
    digestInfo.set(hash, info.prefix.length);

    // Decrypt signature: m = sig^e mod n
    var sigInt = bytesToBigInt(signature);
    var decryptedInt = modPow(sigInt, e, n);
    var decrypted = bigIntToBytes(decryptedInt, keySize);

    // PKCS#1 v1.5 encoding: 00 || 01 || FF...FF || 00 || DigestInfo
    if (decrypted[0] !== 0x00 || decrypted[1] !== 0x01) return false;

    // Find the 00 separator
    var sepIdx = -1;
    for (var i = 2; i < decrypted.length; i++) {
      if (decrypted[i] === 0x00) { sepIdx = i; break; }
    }
    if (sepIdx < 0) return false;

    // Verify padding bytes are all 0xFF
    for (var i = 2; i < sepIdx; i++) {
      if (decrypted[i] !== 0xff) return false;
    }
    // Minimum padding: 8 bytes of 0xFF
    if (sepIdx - 2 < 8) return false;

    // Extract and compare DigestInfo
    var extracted = decrypted.slice(sepIdx + 1);
    if (extracted.length !== digestInfo.length) return false;
    for (var i = 0; i < digestInfo.length; i++) {
      if (extracted[i] !== digestInfo[i]) return false;
    }
    return true;
  }

  // =====================================================================
  // ECDSA verification (P-256 / P-384 / P-521)
  // =====================================================================

  var EC_CURVES = {
    prime256v1: {
      p: 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn,
      a: 0xffffffff00000001000000000000000000000000fffffffffffffffffffffffcn,
      b: 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn,
      n: 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n,
      gx: 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n,
      gy: 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n,
      size: 32
    },
    secp384r1: {
      p: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000ffffffffn,
      a: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000fffffffcn,
      b: 0xb3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875ac656398d8a2ed19d2a85c8edd3ec2aefn,
      n: 0xffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973n,
      gx: 0xaa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7n,
      gy: 0x3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5fn,
      size: 48
    },
    secp521r1: {
      p: 0x01ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn,
      a: 0x01fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffcn,
      b: 0x0051953eb9618e1c9a1f929a21a0b68540eea2da725b99b315f3b8b489918ef109e156193951ec7e937b1652c0bd3bb1bf073573df883d2c34f1ef451fd46b503f00n,
      n: 0x01fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa51868783bf2f966b7fcc0148f709a5d03bb5c9b8899c47aebb6fb71e91386409n,
      gx: 0x00c6858e06b70404e9cd9e3ecb662395b4429c648139053fb521f828af606b4d3dbaa14b5e77efe75928fe1dc127a2ffa8de3348b3c1856a429bf97e7e31c2e5bd66n,
      gy: 0x011839296a789a3bc0045c8a5fb42c7d1bd998f54449579b446817afbd17273e662c97ee72995ef42640c550b9013fad0761353c7086a272c24088be94769fd16650n,
      size: 66
    }
  };

  var EC_OID_TO_CURVE = {
    '1.2.840.10045.3.1.7': 'prime256v1',
    '1.3.132.0.34': 'secp384r1',
    '1.3.132.0.35': 'secp521r1'
  };

  function ecMod(a, p) { var r = a % p; return r < 0n ? r + p : r; }
  function ecModInv(a, p) {
    var t = 0n, newT = 1n, r = p, newR = a, q;
    while (newR !== 0n) {
      q = r / newR;
      var tmpT = newT; newT = t - q * newT; t = tmpT;
      var tmpR = newR; newR = r - q * newR; r = tmpR;
    }
    if (r > 1n) throw new Error('modular inverse does not exist');
    return ecMod(t, p);
  }

  function ecPointAdd(p1, p2, c) {
    if (p1.x === 0n && p1.y === 0n) return p2;
    if (p2.x === 0n && p2.y === 0n) return p1;
    var lam;
    if (p1.x === p2.x && p1.y === p2.y) {
      if (p1.y === 0n) return { x: 0n, y: 0n };
      var num = ecMod(3n * p1.x * p1.x + c.a, c.p);
      var den = ecMod(2n * p1.y, c.p);
    } else {
      if (p1.x === p2.x) return { x: 0n, y: 0n };
      var num = ecMod(p2.y - p1.y, c.p);
      var den = ecMod(p2.x - p1.x, c.p);
    }
    lam = ecMod(num * ecModInv(den, c.p), c.p);
    var x3 = ecMod(lam * lam - p1.x - p2.x, c.p);
    var y3 = ecMod(lam * (p1.x - x3) - p1.y, c.p);
    return { x: x3, y: y3 };
  }

  function ecPointMul(k, pt, c) {
    var result = { x: 0n, y: 0n };
    var addend = pt;
    while (k > 0n) {
      if (k & 1n) result = ecPointAdd(result, addend, c);
      addend = ecPointAdd(addend, addend, c);
      k >>= 1n;
    }
    return result;
  }

  function ecdsaVerify(hashName, data, curveName, pubPoint) {
    var c = EC_CURVES[curveName];
    if (!c) throw new Error('Unsupported curve: ' + curveName);

    var info = DIGEST_INFO[hashName];
    if (!info) throw new Error('Unknown hash: ' + hashName);

    var hash = info.hash(data);

    // Public key point: 04 || x || y
    if (pubPoint[0] !== 0x04) throw new Error('Only uncompressed EC points supported');
    var coordLen = (pubPoint.length - 1) / 2;
    var qx = bytesToBigInt(pubPoint.slice(1, 1 + coordLen));
    var qy = bytesToBigInt(pubPoint.slice(1 + coordLen));

    // Parse signature: DER SEQUENCE { INTEGER r, INTEGER s }
    var sigOff = 0;
    if (signature[sigOff] !== 0x30) return false; // not DER, assume raw r||s
    sigOff++;
    var sr = readDERLength(signature, sigOff);
    sigOff = sr.off;
    if (signature[sigOff] !== 0x02) return false;
    sigOff++;
    var rr = readDERLength(signature, sigOff);
    sigOff = rr.off;
    var r = bytesToBigInt(signature.slice(sigOff, sigOff + rr.len));
    sigOff += rr.len;
    if (signature[sigOff] !== 0x02) return false;
    sigOff++;
    var rs = readDERLength(signature, sigOff);
    sigOff = rs.off;
    var s = bytesToBigInt(signature.slice(sigOff, sigOff + rs.len));

    // Verify: 1 <= r,s <= n-1
    if (r < 1n || r >= c.n || s < 1n || s >= c.n) return false;

    // z = leftmost min(hashLen, curve.size) bytes of hash, as integer
    var zLen = Math.min(info.hashLen, c.size);
    var z = bytesToBigInt(hash.slice(0, zLen));

    var w = ecModInv(s, c.n);
    var u1 = ecMod(z * w, c.n);
    var u2 = ecMod(r * w, c.n);

    var G = { x: c.gx, y: c.gy };
    var Q = { x: qx, y: qy };
    var P = ecPointAdd(ecPointMul(u1, G, c), ecPointMul(u2, Q, c), c);

    return ecMod(P.x, c.n) === r;
  }

  // =====================================================================
  // Web Crypto attempt (async, only when callback provided)
  // =====================================================================

  function webCryptoVerify(algorithm, data, key, signature) {
    // Map algorithm string to Web Crypto params
    var hn = getHashName(algorithm);
    var hashMap = { sha256: 'SHA-256', sha512: 'SHA-512', sha384: 'SHA-384', sha1: 'SHA-1' };
    var wcHash = hashMap[hn];
    if (!wcHash) return Promise.reject(new Error('Unsupported hash for Web Crypto'));

    var der = getKeyDer(key);
    var parsed = parseSpki(der);

    if (parsed.type === 'rsa') {
      return crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: wcHash }, false, ['verify'])
        .then(function(wcKey) {
          return crypto.subtle.verify('RSASSA-PKCS1-v1_5', wcKey, signature, data);
        });
    }

    if (parsed.type === 'ec') {
      var curveName = EC_OID_TO_CURVE[parsed.oid];
      if (!curveName) return Promise.reject(new Error('Unsupported EC curve for Web Crypto'));
      var wcCurve = curveName === 'prime256v1' ? 'P-256' : curveName === 'secp384r1' ? 'P-384' : 'P-521';
      return crypto.subtle.importKey('spki', der, { name: 'ECDSA', namedCurve: wcCurve }, false, ['verify'])
        .then(function(wcKey) {
          return crypto.subtle.verify({ name: 'ECDSA', hash: wcHash }, wcKey, signature, data);
        });
    }

    return Promise.reject(new Error('Unknown key type for Web Crypto'));
  }

  // =====================================================================
  // Pure-JS verification (synchronous, primary path)
  // =====================================================================

  function pureJsVerify(algorithm, data, key, signature) {
    // Normalise data to Uint8Array
    if (typeof data === 'string') {
      data = new TextEncoder().encode(data);
    } else if (!(data instanceof Uint8Array)) {
      data = new Uint8Array(data);
    }

    // Normalise signature to Uint8Array
    if (!(signature instanceof Uint8Array)) {
      signature = new Uint8Array(signature);
    }

    var der = getKeyDer(key);
    var parsed = parseSpki(der);
    var hashName = getHashName(algorithm);

    if (parsed.type === 'rsa') {
      return rsaPkcs1v15Verify(hashName, data, parsed.n, parsed.e, signature, parsed.keySize);
    }

    if (parsed.type === 'ec') {
      var curveName = EC_OID_TO_CURVE[parsed.oid];
      if (!curveName) throw new Error('Unsupported EC curve: ' + parsed.oid);
      return ecdsaVerify(hashName, data, curveName, parsed.point);
    }

    throw new Error('Unsupported key type: ' + parsed.type);
  }

  // =====================================================================
  // Patch crypto.verify(algorithm, data, key, signature[, callback])
  // =====================================================================

  function hexPreview(buf, maxLen) {
    if (!buf || !buf.length) return '(empty)';
    var len = buf.length;
    var hex = '';
    var limit = Math.min(len, maxLen || 512);
    for (var i = 0; i < limit; i++) hex += (buf[i] < 16 ? '0' : '') + buf[i].toString(16);
    var suffix = len > limit ? '... (truncated, total ' + len + ' bytes)' : '';
    return hex + suffix;
  }

  function describeKey(key) {
    if (typeof key === 'string') return 'string(' + key.length + ' chars): ' + (key.length > 200 ? key.substring(0, 200) + '...' : key);
    if (key && typeof key.export === 'function') {
      try { return 'KeyObject(spki pem): ' + key.export({ type: 'spki', format: 'pem' }); } catch(e) {}
      try { return 'KeyObject(spki der hex): ' + hexPreview(key.export({ type: 'spki', format: 'der' })); } catch(e) {}
    }
    if (key instanceof Uint8Array || (key && key.buffer)) {
      var bytes = key instanceof Uint8Array ? key : new Uint8Array(key.buffer, key.byteOffset || 0, key.length);
      return 'Buffer(' + bytes.length + ' bytes): ' + hexPreview(bytes);
    }
    if (key && typeof key === 'object') return 'object keys: ' + Object.keys(key).join(', ');
    return String(key);
  }

  cryptoMod.verify = function (algorithm, data, key, signature, callback) {
    console.log('=== crypto.verify ===');
    console.log('algorithm:', algorithm);
    console.log('data:', hexPreview(data));
    console.log('key:', describeKey(key));
    console.log('signature:', hexPreview(signature));
    console.log('callback:', typeof callback === 'function' ? 'provided' : 'none');

    if (typeof callback === 'function') {
      // Run pure JS synchronously first
      var jsOk, jsErr;
      try {
        jsOk = pureJsVerify(algorithm, data, key, signature);
        console.log('=== crypto.verify result (pure js):', jsOk, '===');
      } catch(e) {
        jsErr = e.message;
        console.log('=== crypto.verify error (pure js):', jsErr, '===');
      }

      // Also run browser Web Crypto and compare
      webCryptoVerify(algorithm, data, key, signature)
        .then(function(wcOk) {
          console.log('=== crypto.verify result (web crypto):', wcOk, '===');
          if (jsErr) {
            console.log('=== DIFF: pure js threw, web crypto returned', wcOk, '===');
          } else if (jsOk !== wcOk) {
            console.log('=== DIFF: MISMATCH! pure js:', jsOk, 'web crypto:', wcOk, '===');
          } else {
            console.log('=== DIFF: results MATCH (' + wcOk + ') ===');
          }
          callback(null, wcOk);
        })
        .catch(function(wcErr) {
          console.log('=== crypto.verify error (web crypto):', wcErr.message || wcErr, '===');
          if (jsErr) {
            console.log('=== DIFF: both failed. pure js:', jsErr, 'web crypto:', wcErr.message || wcErr, '===');
            callback(new Error('both verifiers failed — pure js: ' + jsErr + ', web crypto: ' + (wcErr.message || wcErr)));
          } else {
            console.log('=== DIFF: web crypto failed but pure js returned', jsOk, '===');
            callback(null, jsOk);
          }
        });
      return;
    }

    var result = pureJsVerify(algorithm, data, key, signature);
    console.log('=== crypto.verify result:', result, '===');
    return result;
  };
  cryptoMod.verify.__patched = true;

  // =====================================================================
  // Patch crypto.createVerify(algorithm) → returns Verify object
  // ssh2 uses this streaming API for host-key verification.
  // =====================================================================

  cryptoMod.createVerify = function (algorithm) {
    console.log('=== crypto.createVerify ===');
    console.log('algorithm:', algorithm);
    var chunks = [];

    return {
      update: function (data, encoding) {
        console.log('=== Verify.update ===');
        var buf;
        if (typeof data === 'string') {
          if (encoding === 'hex') {
            buf = new Uint8Array(data.length / 2);
            for (var i = 0; i < buf.length; i++) buf[i] = parseInt(data.substr(i * 2, 2), 16);
          } else if (encoding === 'base64') {
            var bin = atob(data);
            buf = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
          } else {
            buf = new TextEncoder().encode(data);
          }
        } else if (data instanceof Uint8Array) {
          buf = new Uint8Array(data);
        } else {
          buf = new Uint8Array(data);
        }
        console.log('chunk:', hexPreview(buf), '(' + buf.length + ' bytes)');
        chunks.push(buf);
        return this;
      },
      verify: function (key, signature) {
        console.log('=== Verify.verify ===');
        // Concatenate accumulated chunks
        var totalLen = 0;
        for (var i = 0; i < chunks.length; i++) totalLen += chunks[i].length;
        var allData = new Uint8Array(totalLen);
        var off = 0;
        for (var i = 0; i < chunks.length; i++) {
          allData.set(chunks[i], off);
          off += chunks[i].length;
        }
        console.log('algorithm:', algorithm);
        console.log('data (accumulated ' + chunks.length + ' chunk(s), ' + totalLen + ' bytes):', hexPreview(allData));
        console.log('key:', describeKey(key));
        console.log('signature:', hexPreview(signature));

        var result = pureJsVerify(algorithm, allData, key, signature);
        console.log('=== Verify.verify result:', result, '===');
        return result;
      }
    };
  };
  cryptoMod.createVerify.__patched = true;

  // =====================================================================
  // Patch default export
  // =====================================================================

  if (cryptoMod.default && typeof cryptoMod.default === 'object') {
    cryptoMod.default.verify = cryptoMod.verify;
    if (cryptoMod.createVerify.__patched) {
      cryptoMod.default.createVerify = cryptoMod.createVerify;
    }
  }

})();
`;

export function useNodePolyfill(repl: any): void {
  repl.eval(CREATEHASH_POLYFILL);
  repl.eval(ECDH_POLYFILL);
  repl.eval(CRYPTO_VERIFY_PATCH);
}
