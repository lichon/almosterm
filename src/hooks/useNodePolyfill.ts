// Polyfills injected into the almostnode container so ssh2 can run in the browser.
// Extracted from src/tools/ssh.ts — see that file for the SSH command itself.

import CryptoJS from 'crypto-js';

// Expose crypto-js globally so the almostnode REPL eval scripts can access it
(globalThis as any).__cryptoJS = CryptoJS;

// ---------------------------------------------------------------------------
// createHash polyfill — replaces almostnode's non-cryptographic syncHash
// with crypto-js SHA-256 / MD5 so ssh2
// can compute correct session IDs, verify host keys, and run MACs.
// ---------------------------------------------------------------------------

const CREATEHASH_POLYFILL = `
(function patchCreateHash() {
  var cryptoMod = require('crypto');
  var C = globalThis.__cryptoJS;

  function toWordArray(data) {
    if (typeof data === 'string') return C.enc.Utf8.parse(data);
    if (data instanceof Uint8Array) {
      var words = [];
      for (var i = 0; i < data.length; i++) {
        words[i >>> 2] |= (data[i] & 0xff) << (24 - (i % 4) * 8);
      }
      return C.lib.WordArray.create(words, data.length);
    }
    if (data && data.buffer) {
      var arr = new Uint8Array(data.buffer, data.byteOffset || 0, data.length);
      return toWordArray(arr);
    }
    return C.lib.WordArray.create([], 0);
  }

  function parseData(data, encoding) {
    if (typeof data === 'string') {
      if (encoding === 'hex') return C.enc.Hex.parse(data);
      if (encoding === 'base64') return C.enc.Base64.parse(data);
      return C.enc.Utf8.parse(data);
    }
    return toWordArray(data);
  }

  var ALGO_MAP = {
    'MD5': 'MD5',
    'SHA1': 'SHA1',
    'SHA224': 'SHA224',
    'SHA256': 'SHA256',
    'SHA384': 'SHA384',
    'SHA512': 'SHA512',
    'SHA3': 'SHA3',
    'SHA3224': 'SHA3',
    'SHA3256': 'SHA3',
    'SHA3384': 'SHA3',
    'SHA3512': 'SHA3',
    'RIPEMD160': 'RIPEMD160'
  };

  function Hash(algorithm) {
    var algo = algorithm.toUpperCase().replace(/[^A-Z0-9]/g, '');
    var name = ALGO_MAP[algo];
    if (!name || !C.algo[name]) throw new Error('Unsupported hash algorithm: ' + algorithm);
    this._hasher = C.algo[name].create();
  }

  Hash.prototype.update = function (data, encoding) {
    this._hasher.update(parseData(data, encoding));
    return this;
  };

  Hash.prototype.digest = function (encoding) {
    var result = this._hasher.finalize();
    if (encoding === 'hex') return result.toString(C.enc.Hex);
    if (encoding === 'base64') return result.toString(C.enc.Base64);
    return Buffer.from(result);
  };

  cryptoMod.createHash = function (algorithm) {
    return new Hash(algorithm);
  };
  cryptoMod.getHashes = function () {
    return ['sha1', 'sha224', 'sha256', 'sha384', 'sha512', 'sha3', 'sha3-224', 'sha3-256', 'sha3-384', 'sha3-512', 'md5', 'ripemd160'];
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
      return Buffer.from(slice).toString('base64');
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
    var c = CURVES[curveName];
    if (!c) throw new Error('Unsupported curve: ' + curveName);
    this._curve = c;
    this._curveName = curveName;
    this._priv = null;
    this._pub = null;
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
    return this.getPublicKey();
  };

  ECDH.prototype.getPublicKey = function () {
    if (!this._pub) throw new Error('Keys not generated');
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
    if (typeof privateKey === 'string') {
      privateKey = Buffer.from(privateKey, 'hex');
    } else {
    }
    this._priv = bufToBigInt(privateKey);
    this._pub = pointMul(this._priv, { x: this._curve.gx, y: this._curve.gy }, this._curve);
  };

  ECDH.prototype.computeSecret = function (otherPublicKey) {
    if (this._priv === null) throw new Error('Private key not set');
    var buf = otherPublicKey;
    if (!(buf instanceof Uint8Array)) buf = new Uint8Array(buf);
    if (buf[0] !== 0x04) throw new Error('Only uncompressed public keys are supported');
    var size = this._curve.size;
    var ox = bufToBigInt(buf.slice(1, 1 + size));
    var oy = bufToBigInt(buf.slice(1 + size, 1 + size * 2));
    var shared = pointMul(this._priv, { x: ox, y: oy }, this._curve);
    var secret = bigIntToBuf(shared.x, size);
    return secret;
  };

  var createECDH = function (curveName) {
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
// RSA PKCS#1 v1.5 (SHA-256) and ECDSA (P-256/384/521).
// When an async callback is provided it also tries the browser's native
// Web Crypto API (crypto.subtle.verify) before falling back to pure JS.
// The original crypto.verify is NOT preserved or called.
// ---------------------------------------------------------------------------

const CRYPTO_VERIFY_PATCH = `
(function patchCryptoVerify() {
  var cryptoMod = require('crypto');
  if (cryptoMod.verify && cryptoMod.verify.__patched) return;

  // =====================================================================
  // SHA-256 (delegates to crypto-js)
  // =====================================================================

  function sha256(data) {
    if (!(Buffer.isBuffer(data))) data = Buffer.from(data);
    var C = globalThis.__cryptoJS;
    // Convert Uint8Array → hex → crypto-js hash → hex → Uint8Array
    var hexIn = data.toString('hex');
    var hashHex = C.SHA256(C.enc.Hex.parse(hexIn)).toString(C.enc.Hex);
    return new Uint8Array(
      hashHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    );
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
    if (off >= bytes.length) return { len: 0, off: off };
    var b = bytes[off];
    if (b < 0x80) return { len: b, off: off + 1 };
    var numOctets = b & 0x7f;
    var len = 0;
    for (var i = 0; i < numOctets; i++) {
      if (off + 1 + i >= bytes.length) break;
      len = (len << 8) | bytes[off + 1 + i];
    }
    return { len: len, off: off + 1 + numOctets };
  }

  function pemToDer(pem) {
    var b64 = pem.replace(\/-----[A-Z ]*-----\/g, '').replaceAll("\\r", '').replaceAll("\\n", '');
    return Buffer.from(b64, 'base64');
  }

  // Parse an RSA public key from DER bytes.
  // Handles both SPKI (X.509 SubjectPublicKeyInfo) and PKCS#1 formats.
  //
  // SPKI:  SEQUENCE { AlgorithmIdentifier, BIT STRING { RSAPublicKey } }
  // PKCS#1: SEQUENCE { INTEGER n, INTEGER e }
  function parseSpki(der) {
    var off = 0;

    // Detect format: PKCS#1 = SEQUENCE containing two INTEGERs (no AlgorithmIdentifier)
    // SPKI = SEQUENCE containing AlgorithmIdentifier SEQUENCE
    if (der[off] !== 0x30) {
      throw new Error('Expected SEQUENCE at offset ' + off + ', got 0x' + der[off].toString(16));
    }
    off++;
    var r = readDERLength(der, off);
    off = r.off;

    // Peek: PKCS#1 format has an INTEGER (0x02) right after the top-level SEQUENCE header
    if (der[off] === 0x02) {
      // ---- PKCS#1: RSAPublicKey ::= SEQUENCE { INTEGER n, INTEGER e } ----

      // modulus n
      off++;
      r = readDERLength(der, off);
      off = r.off;
      var nLen = r.len;
      if (off + nLen > der.length) {
        nLen = der.length - off;
      }
      var nBytes = der.slice(off, off + nLen);
      off += nLen;

      // publicExponent e — if DER is truncated right after the modulus,
      // fall back to the standard RSA exponent 65537 (0x010001)
      if (off >= der.length) {
        var eBytes = new Uint8Array([0x01, 0x00, 0x01]);
      } else if (der[off] !== 0x02) {
        throw new Error('Expected INTEGER (e)');
      } else {
        off++;
        r = readDERLength(der, off);
        off = r.off;
        var eBytes = der.slice(off, off + r.len);
      }

      var keySize = nBytes.length;
      if (keySize > 1 && nBytes[0] === 0x00) keySize--;

      return {
        type: 'rsa',
        n: bytesToBigInt(nBytes),
        e: bytesToBigInt(eBytes),
        keySize: keySize
      };
    }

    // ---- SPKI: SubjectPublicKeyInfo ----
    // SEQUENCE (AlgorithmIdentifier)
    if (der[off] !== 0x30) {
      throw new Error('Expected AlgorithmIdentifier SEQUENCE or INTEGER at offset ' + off + ', got 0x' + (der[off] !== undefined ? der[off].toString(16) : 'undefined'));
    }
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

    var isRsa = oid === '1.2.840.113549.1.1.1';  // rsaEncryption
    var isEc = oid === '1.2.840.10045.2.1';      // ecPublicKey

    if (!isRsa && !isEc) {
      throw new Error('Unsupported key OID: ' + oid);
    }

    // BIT STRING containing the public key
    if (der[off] !== 0x03) {
      throw new Error('Expected BIT STRING');
    }
    off++;
    r = readDERLength(der, off);
    off = r.off + 1; // skip unused-bits byte

    if (isRsa) {
      // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
      if (der[off] !== 0x30) {
        throw new Error('Expected RSAPublicKey SEQUENCE');
      }
      off++;
      r = readDERLength(der, off);
      off = r.off;

      // modulus n
      if (der[off] !== 0x02) {
        throw new Error('Expected INTEGER (n)');
      }
      off++;
      r = readDERLength(der, off);
      off = r.off;
      // Safety: if n length exceeds remaining buffer, clip it
      var nLen = r.len;
      if (off + nLen > der.length) {
        nLen = der.length - off;
      }
      var nBytes = der.slice(off, off + nLen);
      off += nLen;

      // publicExponent e — if DER is truncated right after the modulus,
      // fall back to the standard RSA exponent 65537 (0x010001)
      if (off >= der.length) {
        var eBytes = new Uint8Array([0x01, 0x00, 0x01]);
      } else if (der[off] !== 0x02) {
        throw new Error('Expected INTEGER (e)');
      } else {
        off++;
        r = readDERLength(der, off);
        off = r.off;
        var eBytes = der.slice(off, off + r.len);
      }

      // DER INTEGER encoding prepends 0x00 for positive integers whose
      // high bit is set. The real RSA key size excludes this padding byte.
      var keySize = nBytes.length;
      if (keySize > 1 && nBytes[0] === 0x00) keySize--;

      return {
        type: 'rsa',
        n: bytesToBigInt(nBytes),
        e: bytesToBigInt(eBytes),
        keySize: keySize
      };
    }

    if (isEc) {
      // r.len includes the unused-bits byte we already skipped
      var point = der.slice(off, off + r.len - 1);
      return { type: 'ec', oid: oid, point: point };
    }

    throw new Error('Unsupported key type');
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
    // sha512: { hash: sha512, prefix: [0x30,0x51,0x30,0x0d,0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x03,0x05,0x00,0x04,0x40], hashLen: 64 },
    // sha384: { hash: sha384, prefix: [0x30,0x41,0x30,0x0d,0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x02,0x05,0x00,0x04,0x30], hashLen: 48 },
    // sha1:   { hash: sha1,   prefix: [0x30,0x21,0x30,0x09,0x06,0x05,0x2b,0x0e,0x03,0x02,0x1a,0x05,0x00,0x04,0x14], hashLen: 20 },
    // md5:    { hash: md5,    prefix: [0x30,0x20,0x30,0x0c,0x06,0x08,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x02,0x05,0x05,0x00,0x04,0x10], hashLen: 16 }
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
  // Pure-JS verification
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

    let keyBuffer = pemToDer(key);
    let hashName = getHashName(algorithm);
    if (typeof callback === 'function') {
      crypto.subtle.importKey('spki', keyBuffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
        .then(function (wcKey) {
          return crypto.subtle.verify('RSASSA-PKCS1-v1_5', wcKey, signature, data);
        })
        .then(function (res) {
          callback(res);
        })
      return;
    }

    return pureJsVerify(algorithm, data, key, signature);
  };
  cryptoMod.verify.__patched = true;

  // =====================================================================
  // Patch crypto.createVerify(algorithm) → returns Verify object
  // ssh2 uses this streaming API for host-key verification.
  // =====================================================================

  cryptoMod.createVerify = function (algorithm) {
    var chunks = [];

    return {
      update: function (data, encoding) {
        var buf;
        if (typeof data === 'string') {
          if (encoding === 'hex') {
            buf = new Uint8Array(data.length / 2);
            for (var i = 0; i < buf.length; i++) buf[i] = parseInt(data.substr(i * 2, 2), 16);
          } else if (encoding === 'base64') {
            buf = new Uint8Array(Buffer.from(data, 'base64'));
          } else {
            buf = new TextEncoder().encode(data);
          }
        } else if (data instanceof Uint8Array) {
          buf = new Uint8Array(data);
        } else {
          buf = new Uint8Array(data);
        }
        chunks.push(buf);
        return this;
      },
      verify: function (key, signature) {
        // Concatenate accumulated chunks
        var totalLen = 0;
        for (var i = 0; i < chunks.length; i++) totalLen += chunks[i].length;
        var allData = new Uint8Array(totalLen);
        var off = 0;
        for (var i = 0; i < chunks.length; i++) {
          allData.set(chunks[i], off);
          off += chunks[i].length;
        }

        var result = pureJsVerify(algorithm, allData, key, signature);
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

// ---------------------------------------------------------------------------
// zlib polyfill — provides createInflate / createDeflate / createGunzip /
// createGzip / createInflateRaw / createDeflateRaw streaming stubs.
// ssh2/lib/protocol/zlib.js calls createInflate()._handle.constructor and
// uses the resulting ZlibHandle class with init / writeSync / close.
// No actual compression — data passes through unchanged.
// ---------------------------------------------------------------------------

const ZLIB_POLYFILL = `
(function patchZlib() {
  var zlibMod = require('zlib');
  if (zlibMod.createInflate && zlibMod.createInflate.__patched) return;

  // ---- constants (add DEFLATE / INFLATE if missing) ----
  var c = zlibMod.constants || {};
  if (c.DEFLATE === undefined) c.DEFLATE = 1;
  if (c.INFLATE === undefined) c.INFLATE = 2;

  // ---- ZlibHandle — mimics Node's internal C++ binding handle ----
  function ZlibHandle(mode) {
    this._mode = mode;
    this._owner = null;
    this.onerror = null;
    this._writeState = null;
  }

  ZlibHandle.prototype.init = function (windowBits, level, memLevel, strategy, writeState, processCallback, dictionary) {
    this._writeState = writeState;
  };

  ZlibHandle.prototype.writeSync = function (flush, chunk, inOff, inLen, buffer, outOff, outLen) {
    // Passthrough: copy as much as fits
    var toCopy = inLen < outLen ? inLen : outLen;
    if (toCopy > 0) {
      for (var i = 0; i < toCopy; i++) {
        buffer[outOff + i] = chunk[inOff + i];
      }
    }
    // writeState[0] = availOutAfter, writeState[1] = availInAfter
    this._writeState[0] = outLen - toCopy;
    this._writeState[1] = inLen - toCopy;
  };

  ZlibHandle.prototype.close = function () {};

  // ---- stream objects returned by create* ----
  function ZStream() {
    this._handle = { constructor: ZlibHandle };
    this._listeners = {};
  }

  ZStream.prototype.on = function (event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
    return this;
  };

  ZStream.prototype.write = function (chunk) {
    var cbs = this._listeners['data'];
    if (cbs) {
      var data = chunk instanceof Uint8Array ? Buffer.from(chunk) : chunk;
      for (var i = 0; i < cbs.length; i++) cbs[i](data);
    }
    return true;
  };

  ZStream.prototype.end = function () {
    var cbs = this._listeners['end'];
    if (cbs) for (var i = 0; i < cbs.length; i++) cbs[i]();
  };

  ZStream.prototype.flush = ZStream.prototype.end;

  function makeStream() { return new ZStream(); }
  makeStream.__patched = true;

  zlibMod.createInflate = makeStream;
  zlibMod.createDeflate = makeStream;
  zlibMod.createInflateRaw = makeStream;
  zlibMod.createDeflateRaw = makeStream;
  zlibMod.createGunzip = makeStream;
  zlibMod.createGzip = makeStream;

  // Patch default export too
  if (zlibMod.default && typeof zlibMod.default === 'object') {
    zlibMod.default.createInflate = makeStream;
    zlibMod.default.createDeflate = makeStream;
    zlibMod.default.createInflateRaw = makeStream;
    zlibMod.default.createDeflateRaw = makeStream;
    zlibMod.default.createGunzip = makeStream;
    zlibMod.default.createGzip = makeStream;
  }
})();
`;

export function useNodePolyfill(repl: any): void {
  repl.eval(CREATEHASH_POLYFILL);
  repl.eval(ECDH_POLYFILL);
  repl.eval(CRYPTO_VERIFY_PATCH);
  repl.eval(ZLIB_POLYFILL);
}
