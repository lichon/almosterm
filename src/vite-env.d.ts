declare module '*.css';
declare module 'xterm/css/xterm.css';

declare module 'crypto-js' {
  interface WordArray {
    words: number[];
    sigBytes: number;
    toString(encoder?: Encoder): string;
    concat(wordArray: WordArray): WordArray;
    clamp(): void;
    clone(): WordArray;
  }

  interface Encoder {
    stringify(wordArray: WordArray): string;
    parse(str: string): WordArray;
  }

  interface Hasher {
    update(messageUpdate: WordArray | string): Hasher;
    finalize(messageUpdate?: WordArray | string): WordArray;
  }

  interface HasherStatic {
    create(): Hasher;
  }

  interface Cipher {
    encrypt(message: WordArray | string, key: WordArray, cfg?: { iv: WordArray }): WordArray;
    decrypt(ciphertext: WordArray | string, key: WordArray, cfg?: { iv: WordArray }): WordArray;
  }

  interface CryptoJS {
    lib: {
      WordArray: {
        create(words?: number[], sigBytes?: number): WordArray;
        random(nBytes: number): WordArray;
      };
      Hasher: HasherStatic;
    };
    algo: {
      SHA256: HasherStatic;
      MD5: HasherStatic;
      SHA1: HasherStatic;
      SHA224: HasherStatic;
      SHA384: HasherStatic;
      SHA512: HasherStatic;
      SHA3: HasherStatic;
      RIPEMD160: HasherStatic;
    };
    enc: {
      Hex: Encoder;
      Utf8: Encoder;
      Base64: Encoder;
    };
    SHA256(message: WordArray | string): WordArray;
    MD5(message: WordArray | string): WordArray;
    SHA1(message: WordArray | string): WordArray;
    HmacSHA256(message: WordArray | string, key: WordArray | string): WordArray;
  }

  const CryptoJS: CryptoJS;
  export default CryptoJS;
}

declare module 'pako' {
  export function inflate(data: Uint8Array): Uint8Array;
  export function inflate(data: ArrayBuffer): Uint8Array;
  export function deflate(data: Uint8Array, options?: unknown): Uint8Array;
  export function gzip(data: Uint8Array, options?: unknown): Uint8Array;
  const pako: {
    inflate: typeof inflate;
    deflate: typeof deflate;
    gzip: typeof gzip;
  };
  export default pako;
}
