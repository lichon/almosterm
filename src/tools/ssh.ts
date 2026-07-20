import { defineCommand } from 'just-bash';
import { useVfsStore } from '../store/vfsStore';
import { getTerminal, setSshStream, writeTerm } from '../utils';
import { getContainer } from '../fs/configure';
import type { Client } from 'ssh2';

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
