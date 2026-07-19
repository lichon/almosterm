declare module '*.css';
declare module 'xterm/css/xterm.css';

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
