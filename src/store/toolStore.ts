import { create } from 'zustand';

export interface CustomCliTool {
  name: string;
  type: 'script' | 'binary';
  scriptContent: string | null;
  executablePath: string | null;
  description: string | null;
  version: string | null;
  registeredAt: number;
}

interface ToolState {
  tools: Record<string, CustomCliTool>;

  registerTool: (tool: CustomCliTool) => { success: boolean; error?: string };
  unregisterTool: (name: string) => boolean;
  getTool: (name: string) => CustomCliTool | undefined;
  listTools: () => CustomCliTool[];
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const STORAGE_KEY = 'almosterm-tools';

export const useToolStore = create<ToolState>((set, get) => ({
  tools: {},

  registerTool: (tool: CustomCliTool) => {
    const { tools } = get();

    // Validate name
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(tool.name)) {
      return { success: false, error: 'Invalid tool name. Must start with a letter and contain only alphanumeric, dash, or underscore characters.' };
    }

    // Check for duplicates
    if (tools[tool.name]) {
      return { success: false, error: `Tool '${tool.name}' is already registered.` };
    }

    const newTools = { ...tools, [tool.name]: { ...tool, registeredAt: Date.now() } };
    set({ tools: newTools });
    get().saveToStorage();
    return { success: true };
  },

  unregisterTool: (name: string) => {
    const { tools } = get();
    if (!tools[name]) return false;

    const newTools = { ...tools };
    delete newTools[name];
    set({ tools: newTools });
    get().saveToStorage();
    return true;
  },

  getTool: (name: string) => {
    return get().tools[name];
  },

  listTools: () => {
    return Object.values(get().tools);
  },

  loadFromStorage: () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const tools = JSON.parse(stored);
        set({ tools });
      }
    } catch {
      console.warn('Failed to load tools from storage');
    }
  },

  saveToStorage: () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(get().tools));
    } catch {
      console.warn('Failed to save tools to storage');
    }
  },
}));
