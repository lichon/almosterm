import { defineCommand } from 'just-bash';
import { useVfsStore } from '../store/vfsStore';
import { getTerminal, setSshStream, writeTerm } from '../utils';
import { getContainer } from '../fs/configure';
import type { Client } from 'ssh2';

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
// Polyfill: patch safer-buffer to use `new Buffer()` instead of `Buffer()`.
// The `buffer` polyfill in almostnode requires `new`; plain Buffer() calls
// inside safer-buffer's Safer.from / Safer.alloc would fail otherwise.
// ---------------------------------------------------------------------------

const SAFER_BUFFER_POLYFILL = `
(function patchSaferBufferAtRequire() {
  // load safer to cache
  var safer = require('safer-buffer');

  for (mid in require.cache) {
    if (mid.endsWith('node_modules/safer-buffer/safer.js')) {
      var module = require.cache[mid]
      if (module.exports.__patched) break; // already patched
      module.exports.__patched = true;
      module.exports.Buffer.isBuffer = function () {
        return true
      }

      module.exports.Buffer.from = function (value, encodingOrOffset, length) {
        if (typeof value === 'number') {
          throw new TypeError('The "value" argument must not be of type number. Received type ' + typeof value);
        }
        if (value && typeof value.length === 'undefined') {
          throw new TypeError('The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type ' + typeof value);
        }
        return new Buffer(value, encodingOrOffset, length);
      };

      // Patch Safer.alloc to use new Buffer()
      module.exports.Buffer.alloc = function (size, fill, encoding) {
        if (typeof size !== 'number') {
          throw new TypeError('The "size" argument must be of type number. Received type ' + typeof size);
        }
        if (size < 0 || size >= 2 * (1 << 30)) {
          throw new RangeError('The value "' + size + '" is invalid for option "size"');
        }
        var buf = new Buffer(size);
        if (!fill || fill.length === 0) {
          buf.fill(0);
        } else if (typeof encoding === 'string') {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
        return buf;
      };
      break;
    }
  }
})();
`;

// ---------------------------------------------------------------------------
// Patch: wrap crypto.verify to print debug logs with keys and all data.
// ---------------------------------------------------------------------------

const CRYPTO_VERIFY_PATCH = `
(function patchCryptoVerify() {
  var cryptoMod = require('crypto');
  var _origVerify = cryptoMod.verify;
  if (!_origVerify) return;
  if (_origVerify.__patched) return;

  cryptoMod.verify = function (algorithm, data, key, signature, callback) {
    console.log('--- crypto.verify ---');
    console.log('algorithm:', algorithm);
    console.log('data (length):', data && data.length, 'bytes');
    if (data && data.length <= 1024) {
      console.log('data (hex):', Buffer.from(data).toString('hex'));
    } else if (data) {
      console.log('data (first 512 hex):', Buffer.from(data.slice(0, 512)).toString('hex'));
      console.log('data (last 512 hex):', Buffer.from(data.slice(-512)).toString('hex'));
    }
    console.log('key (type):', typeof key, key && key.constructor && key.constructor.name);
    if (typeof key === 'string') {
      console.log('key (value):', key);
    } else if (key && key.export && typeof key.export === 'function') {
      try {
        console.log('key (exported):', key.export({ type: 'spki', format: 'pem' }));
      } catch (e) {
        console.log('key (export failed):', e.message);
      }
    } else if (key) {
      console.log('key (keys):', Object.keys(key));
    }
    console.log('signature (length):', signature && signature.length, 'bytes');
    if (signature && signature.length <= 1024) {
      console.log('signature (hex):', Buffer.from(signature).toString('hex'));
    } else if (signature) {
      console.log('signature (first 512 hex):', Buffer.from(signature.slice(0, 512)).toString('hex'));
      console.log('signature (last 512 hex):', Buffer.from(signature.slice(-512)).toString('hex'));
    }

    var ret = _origVerify.call(this, algorithm, data, key, signature, callback);
    console.log('----------------------- result', ret);
    return ret;
  };
  cryptoMod.verify.__patched = true;

  // Also patch default export if it differs
  if (cryptoMod.default && typeof cryptoMod.default === 'object' && cryptoMod.default.verify && !cryptoMod.default.verify.__patched) {
    cryptoMod.default.verify = cryptoMod.verify;
  }
})();
`;

/**
 * ssh — connect to a remote host via SSH protocol (ssh2 runs client-side).
 *
 * Usage:
 *   ssh <user@host> [-p <port>] [-pw <password>] [-i <identity-file>] [-v]
 *
 * The Worker acts as a pure TCP proxy (WebSocket → raw TCP).
 * All SSH protocol handling — encryption, authentication, key exchange —
 * runs in the browser via the ssh2 library.
 */

// ---------------------------------------------------------------------------
// WebSocketSocket — bridges a browser WebSocket to a Node.js net.Socket-like
// duplex stream. ssh2 uses this as its underlying TCP transport via cfg.sock.
// ---------------------------------------------------------------------------

class WebSocketSocket {
  private _ws: WebSocket;
  private _listeners: Record<string, Array<(...args: any[]) => void>> = {};
  private _closed = false;

  writable: boolean;
  _readableState: { ended: boolean };

  constructor(ws: WebSocket) {
    this._ws = ws;
    this.writable = true;
    this._readableState = { ended: false };

    ws.onmessage = (event) => {
      if (this._closed) return;
      let data: Uint8Array;
      if (event.data instanceof ArrayBuffer) {
        // ssh2 need buffer callback
        data = Buffer.from(event.data);
      } else if (event.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
          if (!this._closed && reader.result instanceof ArrayBuffer) {
            this._emit('data', new Uint8Array(reader.result));
          }
        };
        reader.readAsArrayBuffer(event.data);
        return;
      } else if (typeof event.data === 'string') {
        data = new TextEncoder().encode(event.data);
      } else {
        return;
      }
      this._emit('data', data);
    };

    ws.onclose = () => {
      if (this._closed) return;
      this._closed = true;
      this._emit('close');
    };

    ws.onerror = (err) => {
      if (this._closed) return;
      this._emit('error', err);
    };
  }

  write(data: Uint8Array | string, _encoding?: string): boolean {
    if (this._closed) return false;
    if (this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      this._ws.send(data);
      return true;
    } catch {
      return false;
    }
  }

  end(): void {
    if (this._closed) return;
    this._closed = true;
    try { this._ws.close(); } catch {}
    this._emit('close');
  }

  destroy(): void {
    this.end();
  }

  resume(): void {
  }

  pause(): void {
  }

  setNoDelay(_noDelay?: boolean): void {}

  on(event: string, cb: (...args: any[]) => void): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
    return this;
  }

  removeAllListeners(event?: string): void {
    if (event) {
      delete this._listeners[event];
    } else {
      this._listeners = {};
    }
  }

  private _emit(event: string, ...args: any[]): void {
    const cbs = this._listeners[event];
    if (cbs) for (const cb of cbs) cb(...args);
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const ssh = defineCommand('ssh', async (args, _ctx) => {
  const capabilities = useVfsStore.getState().capabilities;
  const hasSshProxy = capabilities.includes('ssh-proxy');

  if (!hasSshProxy) {
    writeTerm(
      'ssh: SSH proxy unavailable.\n' +
        'Run locally with `npm run cf-dev` to enable SSH connections.\n',
      'stderr',
    );
    return { stdout: '', stderr: '', exitCode: 1 };
  }

  if (args.length === 0) {
    return {
      stdout: '',
      stderr:
        'ssh: missing host\n' +
        'Usage: ssh <user@host> [-p <port>] [-pw <password>] [-i <identity-file>] [-v]\n',
      exitCode: 1,
    };
  }

  const target = args[0];
  let port = 22;
  let password: string | undefined;
  let privateKey: string | undefined;
  let verbosity = 0;

  // Parse flags
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '-p' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        return {
          stdout: '',
          stderr: `ssh: invalid port: ${args[i + 1]}\n`,
          exitCode: 1,
        };
      }
      i++;
    } else if (args[i] === '-pw' && args[i + 1]) {
      password = args[i + 1];
      i++;
    } else if (args[i] === '-v' || args[i] === '-vv' || args[i] === '-vvv') {
      verbosity = args[i].match(/^-(v+)$/) ? args[i].length - 1 : 1;
    } else if (args[i] === '-i' && args[i + 1]) {
      const keyPath = args[i + 1];
      try {
        const { getVfs } = await import('../fs/configure');
        const vfs = getVfs();
        if (!vfs.existsSync(keyPath)) {
          return {
            stdout: '',
            stderr: `ssh: identity file not found: ${keyPath}\n`,
            exitCode: 1,
          };
        }
        const raw = vfs.readFileSync(keyPath) as Uint8Array;
        // privateKey = Buffer.from(raw);
      } catch (err: any) {
        return {
          stdout: '',
          stderr: `ssh: could not read identity file: ${err.message}\n`,
          exitCode: 1,
        };
      }
      i++;
    }
  }

  // Parse user@host
  const atIdx = target.lastIndexOf('@');
  const user = atIdx >= 0 ? target.slice(0, atIdx) : '';
  const host = atIdx >= 0 ? target.slice(atIdx + 1) : target;

  if (!host) {
    return { stdout: '', stderr: 'ssh: invalid host\n', exitCode: 1 };
  }

  const username = user || 'root';

  writeTerm(`ssh: connecting to ${username}@${host}:${port}...\r\n`);

  const repl = getContainer().createREPL();
  repl.eval(CREATEHASH_POLYFILL);
  repl.eval(SAFER_BUFFER_POLYFILL);
  repl.eval(ECDH_POLYFILL);
  repl.eval(CRYPTO_VERIFY_PATCH);

  // ---- Step 1: Open WebSocket to Worker (raw TCP proxy) ----
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/connect?host=${encodeURIComponent(host)}&port=${port}`;
  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  const wsOpen = await new Promise<boolean>((resolve) => {
    ws.onopen = () => resolve(true);
    ws.onerror = () => resolve(false);
    ws.onclose = () => resolve(false);
  });

  if (!wsOpen) {
    return {
      stdout: '',
      stderr: `ssh: could not reach ${host}:${port} via proxy\n`,
      exitCode: 1,
    };
  }

  // ---- Step 2: Wrap WebSocket as a socket for ssh2 ----
  const sock = new WebSocketSocket(ws);

  // ---- Step 3: Create ssh2 client ----
  const conn = repl.eval(`new (require('ssh2').Client)()`) as Client;

  const sshReady = new Promise<'ready' | 'error'>((resolve) => {
    conn.on('ready', () => resolve('ready'));
    conn.on('error', (err) => {
      writeTerm(`ssh: ${err.message}\r\n`, 'stderr');
      writeTerm(`Stack trace:\r\n${err.stack}\r\n`, 'stderr');
      resolve('error');
    });
    conn.on('banner', (msg) => {
      if (verbosity > 0) writeTerm(`${msg}\r\n`);
    });
  });

  conn.connect({
    sock: sock as any,
    username,
    password,
    debug: verbosity > 0
      ? (msg) => {
          writeTerm(`debug1: ${msg}\r\n`);
        }
      : undefined,
    algorithms: {
      kex: ['ecdh-sha2-nistp256'],
      serverHostKey: ['rsa-sha2-256'],
      compress: ['none'],
    },
  });

  const result = await sshReady;
  if (result === 'error') {
    sock.destroy();
    return { stdout: '', stderr: '', exitCode: 1 };
  }

  writeTerm(`ssh: connected to ${username}@${host}:${port}\r\n\r\n`);

  // ---- Step 4: Open shell and bridge to terminal ----
  conn.shell({ term: 'xterm-256color' }, (err, stream) => {
    if (err) {
      writeTerm(`ssh: shell open failed: ${err.message}\r\n`, 'stderr');
      conn.end();
      return;
    }

    // Register the stream so Terminal.tsx forwards keystrokes to it.
    // Terminal.onData checks window.__almosterm_ssh_stream at the top
    // of its handler; when set, all keystrokes go directly to SSH.
    setSshStream(stream);
    const term = getTerminal()

    // SSH shell stdout → terminal
    stream.on('data', (data: any) => {
      term.write(data.toString('utf-8'));
    });

    // SSH shell stderr → terminal
    stream.stderr.on('data', (data: any) => {
      term.write(data.toString('utf-8'));
    });

    // Shell closed — clean up and return control to bash
    const teardown = () => {
      setSshStream(null);
      try { conn.end(); } catch {}
    };

    stream.on('close', () => {
      writeTerm('\r\nssh: disconnected\r\n');
      teardown();
    });

    conn.on('close', teardown);
    sock.on('close', teardown);
  });

  conn.on('close', () => {
    setSshStream(null);
  });

  return { stdout: '', stderr: '', exitCode: 0 };
});
