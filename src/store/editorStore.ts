import { create } from 'zustand';

interface EditorState {
  /** Whether the edit dialog should be open */
  open: boolean;
  /** Optional file path to pre-load */
  filePath: string | undefined;

  /** Open the editor for a specific file */
  openEditor: (path?: string) => void;
  /** Close the editor */
  closeEditor: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  open: false,
  filePath: undefined,

  openEditor: (path?: string) => set({ open: true, filePath: path }),
  closeEditor: () => set({ open: false, filePath: undefined }),
}));
