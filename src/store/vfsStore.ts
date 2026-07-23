import { create } from 'zustand';

interface VfsState {
  cwd: string;
  vfsReady: boolean;
  totalSize: number;
  maxSize: number;
  /** npm registry URL (defaults to registry.npmjs.org) */
  npmRegistry: string;
  /** Worker capabilities detected at init */
  capabilities: string[];
  /** Whether the VFS is auto-persisted to localStorage after every mutation */
  autoSave: boolean;

  setCwd: (cwd: string) => void;
  setVfsReady: (ready: boolean) => void;
  setTotalSize: (size: number) => void;
  setNpmRegistry: (url: string) => void;
  setCapabilities: (capabilities: string[]) => void;
  setAutoSave: (enabled: boolean) => void;
}

export const useVfsStore = create<VfsState>((set) => ({
  cwd: '/home/user',
  vfsReady: false,
  totalSize: 0,
  maxSize: 100 * 1024 * 1024,
  npmRegistry: 'https://registry.npmjs.org',
  capabilities: [],
  autoSave: true,

  setCwd: (cwd: string) => set({ cwd }),
  setVfsReady: (ready: boolean) => set({ vfsReady: ready }),
  setTotalSize: (size: number) => set({ totalSize: size }),
  setNpmRegistry: (url: string) => set({ npmRegistry: url }),
  setCapabilities: (capabilities: string[]) => set({ capabilities }),
  setAutoSave: (enabled: boolean) => set({ autoSave: enabled }),
}));
