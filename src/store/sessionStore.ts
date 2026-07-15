import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

interface SessionState {
  /** Unique session identifier */
  sessionId: string;
  /** Ordered list of previously executed commands */
  commandHistory: string[];
  /** Position in history navigation (-1 = not navigating) */
  historyIndex: number;

  // Actions
  addToHistory: (command: string) => void;
  navigateHistory: (direction: 'up' | 'down') => string | null;
  resetHistoryNavigation: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessionId: uuidv4(),
  commandHistory: [],
  historyIndex: -1,

  addToHistory: (command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;
    set((state) => ({
      commandHistory: [...state.commandHistory, trimmed],
      historyIndex: -1,
    }));
  },

  navigateHistory: (direction: 'up' | 'down') => {
    const { commandHistory, historyIndex } = get();
    if (commandHistory.length === 0) return null;

    let newIndex: number;
    if (direction === 'up') {
      if (historyIndex === -1) {
        newIndex = commandHistory.length - 1;
      } else {
        newIndex = Math.max(0, historyIndex - 1);
      }
    } else {
      if (historyIndex === -1) return null;
      newIndex = historyIndex + 1;
      if (newIndex >= commandHistory.length) {
        set({ historyIndex: -1 });
        return null;
      }
    }

    set({ historyIndex: newIndex });
    return commandHistory[newIndex];
  },

  resetHistoryNavigation: () => set({ historyIndex: -1 }),
}));
