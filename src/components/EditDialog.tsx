import React, { useState, useEffect, useRef } from 'react';
import { getVfs } from '../fs/configure';

interface EditDialogProps {
  open: boolean;
  onClose: () => void;
  /** Optional file path to pre-load for editing */
  initialPath?: string;
}

export const EditDialog: React.FC<EditDialogProps> = ({ open, onClose, initialPath }) => {
  const [filePath, setFilePath] = useState('');
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setError('');
      setSuccess('');
      setLoaded(false);
      setDirty(false);

      if (initialPath) {
        setFilePath(initialPath);
        loadFile(initialPath);
      } else {
        setFilePath('');
        setContent('');
        setOriginal('');
      }
    }
  }, [open, initialPath]);

  const loadFile = (path: string) => {
    setError('');
    setSuccess('');

    const vfs = getVfs();
    if (!vfs.existsSync(path)) {
      setError(`File not found: ${path}`);
      setLoaded(false);
      return;
    }

    const stat = vfs.statSync(path);
    if (stat.isDirectory()) {
      setError(`Cannot edit: '${path}' is a directory`);
      setLoaded(false);
      return;
    }

    try {
      const text = vfs.readFileSync(path, 'utf-8') as string;
      setContent(text);
      setOriginal(text);
      setLoaded(true);
      setDirty(false);
    } catch (err: any) {
      setError(`Failed to read file: ${err.message}`);
      setLoaded(false);
    }
  };

  const handleLoad = () => {
    if (!filePath.trim()) {
      setError('Please enter a file path');
      return;
    }
    loadFile(filePath.trim());
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setDirty(e.target.value !== original);
  };

  const handleSave = () => {
    setError('');
    setSuccess('');

    if (!filePath.trim()) {
      setError('File path is required');
      return;
    }
    if (!loaded) {
      setError('No file loaded. Load a file first.');
      return;
    }

    try {
      const vfs = getVfs();
      // Ensure parent directory exists
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      if (dir && !vfs.existsSync(dir)) {
        vfs.mkdirSync(dir, { recursive: true });
      }
      vfs.writeFileSync(filePath, content);
      setOriginal(content);
      setDirty(false);
      setSuccess(`✅ File saved: ${filePath}`);

      setTimeout(() => {
        setSuccess('');
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(`Failed to save: ${err.message}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  if (!open) return null;

  return (
    <div
      className="dialog-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div className="dialog edit-dialog">
        <h2>✏️ Edit File</h2>

        {/* File path input with load button */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'flex-end' }}>
          <label style={{ flex: 1, marginBottom: 0 }}>
            File Path
            <input
              value={filePath}
              onChange={(e) => {
                setFilePath(e.target.value);
                setLoaded(false);
                setError('');
                setSuccess('');
              }}
              placeholder="/home/user/example.txt"
              style={{ marginTop: '4px' }}
              autoFocus={!initialPath}
            />
          </label>
          <button
            className="btn-secondary"
            onClick={handleLoad}
            style={{
              padding: '8px 14px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '13px',
              background: '#333',
              color: 'var(--text)',
              height: '36px',
              whiteSpace: 'nowrap',
            }}
          >
            📂 Load
          </button>
        </div>

        {/* Content editor */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '4px',
            fontSize: '12px',
            color: 'var(--text-dim)',
          }}>
            <span>{loaded ? `Editing: ${filePath}` : 'File content'}</span>
            {loaded && (
              <span>
                Lines: {content.split('\n').length} | Size: {content.length} bytes
                {dirty && ' (modified)'}
              </span>
            )}
          </div>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            placeholder={
              loaded
                ? 'Edit file content...'
                : 'Enter a file path and click "Load" to edit.'
            }
            disabled={!loaded}
            style={{
              width: '100%',
              height: '350px',
              background: 'var(--terminal-bg, #0d0d1a)',
              color: 'var(--text, #e0e0e0)',
              border: `1px solid ${dirty ? 'var(--warning, #ffb86c)' : 'var(--border, #333366)'}`,
              borderRadius: '4px',
              padding: '12px',
              fontSize: '13px',
              fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
              resize: 'vertical',
              outline: 'none',
              opacity: loaded ? 1 : 0.5,
              tabSize: 2,
              lineHeight: 1.5,
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--accent, #00e5ff)'}
            onBlur={(e) => e.target.style.borderColor = dirty ? 'var(--warning, #ffb86c)' : 'var(--border, #333366)'}
            spellCheck={false}
          />
        </div>

        {error && (
          <div style={{ color: 'var(--error)', fontSize: '13px', marginTop: '8px' }}>
            ❌ {error}
          </div>
        )}
        {success && (
          <div style={{ color: 'var(--success)', fontSize: '13px', marginTop: '8px' }}>
            {success}
          </div>
        )}

        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!loaded || !dirty}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              cursor: !loaded || !dirty ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontSize: '13px',
              background: !loaded || !dirty ? '#555' : 'var(--accent)',
              color: !loaded || !dirty ? '#999' : 'var(--bg)',
              opacity: !loaded || !dirty ? 0.6 : 1,
            }}
          >
            💾 Save
          </button>
        </div>
      </div>
    </div>
  );
};
