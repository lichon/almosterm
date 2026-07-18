import { create } from 'zustand';

interface VfsState {
  cwd: string;
  vfsReady: boolean;
  totalSize: number;
  maxSize: number;
  /** npm registry URL — set to /api/npm when Worker proxy is available, else direct */
  npmRegistry: string;
  /** Worker capabilities detected at init */
  capabilities: string[];

  setCwd: (cwd: string) => void;
  setVfsReady: (ready: boolean) => void;
  setTotalSize: (size: number) => void;
  setNpmRegistry: (url: string) => void;
  setCapabilities: (capabilities: string[]) => void;
}

export const useVfsStore = create<VfsState>((set) => ({
  cwd: '/home/user',
  vfsReady: false,
  totalSize: 0,
  maxSize: 100 * 1024 * 1024,
  npmRegistry: 'https://registry.npmjs.org',
  capabilities: [],

  setCwd: (cwd: string) => set({ cwd }),
  setVfsReady: (ready: boolean) => set({ vfsReady: ready }),
  setTotalSize: (size: number) => set({ totalSize: size }),
  setNpmRegistry: (url: string) => set({ npmRegistry: url }),
  setCapabilities: (capabilities: string[]) => set({ capabilities }),
}));
