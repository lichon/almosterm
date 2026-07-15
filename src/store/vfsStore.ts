import { create } from 'zustand';

interface VfsState {
  cwd: string;
  vfsReady: boolean;
  totalSize: number;
  maxSize: number;

  setCwd: (cwd: string) => void;
  setVfsReady: (ready: boolean) => void;
  setTotalSize: (size: number) => void;
}

export const useVfsStore = create<VfsState>((set) => ({
  cwd: '/home/user',
  vfsReady: false,
  totalSize: 0,
  maxSize: 100 * 1024 * 1024,

  setCwd: (cwd: string) => set({ cwd }),
  setVfsReady: (ready: boolean) => set({ vfsReady: ready }),
  setTotalSize: (size: number) => set({ totalSize: size }),
}));
