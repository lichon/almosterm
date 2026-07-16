import { getVfs } from './configure';
import { useVfsStore } from '../store/vfsStore';

export interface ImportResult {
  imported: number;
  errors: string[];
}

interface VfsEntry {
  type: 'file' | 'directory';
  content?: string;
  size?: number;
}

interface VfsSnapshot {
  version: number;
  exportedAt?: string;
  files: Record<string, VfsEntry>;
}

/**
 * Import VFS files from a JSON snapshot object.
 */
export function importFromJson(json: string): ImportResult {
  const errors: string[] = [];
  let snapshot: VfsSnapshot;

  try {
    snapshot = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON: could not parse snapshot');
  }

  if (!snapshot.files || typeof snapshot.files !== 'object') {
    throw new Error('Invalid snapshot format: missing "files" object');
  }

  const vfs = getVfs();
  let imported = 0;

  for (const [path, entry] of Object.entries(snapshot.files)) {
    try {
      if (entry.type === 'file') {
        const dir = path.substring(0, path.lastIndexOf('/'));
        if (dir && !vfs.existsSync(dir)) {
          vfs.mkdirSync(dir, { recursive: true });
        }
        vfs.writeFileSync(path, entry.content || '');
        imported++;
      } else if (entry.type === 'directory') {
        if (!vfs.existsSync(path)) {
          vfs.mkdirSync(path, { recursive: true });
        }
      }
    } catch (err: any) {
      errors.push(`${path}: ${err.message}`);
    }
  }

  // Ensure cwd still exists after import
  const cwd = useVfsStore.getState().cwd;
  if (!vfs.existsSync(cwd)) {
    useVfsStore.getState().setCwd('/home/user');
  }

  return { imported, errors };
}

/**
 * Import VFS from a File blob (drag-and-drop or file picker).
 * Supports .vfs.json, .vfs.tar, and .vfs.zip.
 */
export async function importFromBlob(file: File, _merge: boolean = false): Promise<ImportResult> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.vfs.json') || name.endsWith('.json')) {
    const text = await file.text();
    return importFromJson(text);
  }

  if (name.endsWith('.vfs.tar')) {
    throw new Error('TAR import not yet supported. Use .vfs.json format.');
  }

  if (name.endsWith('.vfs.zip') || name.endsWith('.zip')) {
    throw new Error('ZIP import not yet supported. Use .vfs.json format.');
  }

  throw new Error(`Unsupported file format: ${file.name}. Expected .vfs.json, .vfs.tar, or .vfs.zip`);
}
