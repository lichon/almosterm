import React, { useState, useCallback } from 'react';
import { importFromBlob, importFromJson } from '../fs/export-import';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
}

type Tab = 'file' | 'paste';

export const ImportDialog: React.FC<ImportDialogProps> = ({ open, onClose }) => {
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('file');
  const [pasteContent, setPasteContent] = useState('');

  const showResult = useCallback((success: boolean, message: string) => {
    setResult({ success, message });
    if (success) {
      setTimeout(() => onClose(), 2000);
    }
  }, [onClose]);

  const handleFile = useCallback(async (file: File) => {
    setImporting(true);
    setResult(null);
    try {
      const res = await importFromBlob(file, false);
      showResult(true, `Imported ${res.imported} files successfully.${res.errors.length > 0 ? ` ${res.errors.length} errors.` : ''}`);
    } catch (err: any) {
      showResult(false, err.message);
    } finally {
      setImporting(false);
    }
  }, [showResult]);

  const handlePasteImport = useCallback(() => {
    if (!pasteContent.trim()) {
      showResult(false, 'Paste VFS JSON content first');
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const res = importFromJson(pasteContent);
      showResult(true, `Imported ${res.imported} files successfully.${res.errors.length > 0 ? ` ${res.errors.length} errors.` : ''}`);
    } catch (err: any) {
      showResult(false, err.message);
    } finally {
      setImporting(false);
    }
  }, [pasteContent, showResult]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // Also allow paste anywhere in the dialog via Ctrl+V
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    // If we're on the paste tab with the textarea focused, let the default work
    if (activeTab === 'paste' && e.target instanceof HTMLTextAreaElement) return;

    // Check for pasted file
    const items = e.clipboardData?.items;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleFile(file);
          return;
        }
        // If text was pasted and it looks like JSON, switch to paste tab
        if (item.kind === 'string' && item.type === 'text/plain') {
          item.getAsString((text) => {
            if (text.trim().startsWith('{') && text.includes('"files"')) {
              e.preventDefault();
              setActiveTab('paste');
              setPasteContent(text);
            }
          });
        }
      }
    }
  }, [activeTab, handleFile]);

  if (!open) return null;

  return (
    <div
      className="dialog-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onPaste={handlePaste}
    >
      <div className="dialog">
        <h2>Import VFS Snapshot</h2>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
          <button
            className={activeTab === 'file' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 14px', fontSize: '13px' }}
            onClick={() => setActiveTab('file')}
          >
            📁 File
          </button>
          <button
            className={activeTab === 'paste' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 14px', fontSize: '13px' }}
            onClick={() => setActiveTab('paste')}
          >
            📋 Paste JSON
          </button>
        </div>

        {activeTab === 'file' && (
          <>
            <div
              className={`drop-zone${dragOver ? ' drop-zone--active' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <div className="drop-zone__icon">📁</div>
              <div>Drag & drop a .vfs.json file here</div>
              <div style={{ fontSize: '12px', marginTop: '8px' }}>or click to browse</div>
            </div>

            <input
              type="file"
              accept=".vfs.tar,.vfs.zip,.vfs.json"
              onChange={handleFileInput}
              style={{ display: 'none' }}
              id="vfs-import-file"
            />
            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <label htmlFor="vfs-import-file" className="btn-primary" style={{
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'inline-block',
                fontSize: '13px',
              }}>
                Browse Files
              </label>
            </div>
          </>
        )}

        {activeTab === 'paste' && (
          <>
            <textarea
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              placeholder={'Paste your VFS snapshot JSON here...\n\nExample:\n{\n  "version": 1,\n  "files": {\n    "/home/user/readme.md": {\n      "type": "file",\n      "content": "# Hello"\n    }\n  }\n}'}
              style={{
                width: '100%',
                height: '200px',
                background: 'var(--bg-input, #1a1a2e)',
                color: 'var(--text-primary, #e0e0e0)',
                border: '1px solid var(--border, #333366)',
                borderRadius: '4px',
                padding: '12px',
                fontSize: '12px',
                fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                resize: 'vertical',
                outline: 'none',
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent, #00e5ff)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border, #333366)'}
            />
            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button className="btn-primary" onClick={handlePasteImport} style={{
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}>
                Import from Paste
              </button>
            </div>
          </>
        )}

        {importing && <div style={{ textAlign: 'center', marginTop: '12px', color: 'var(--text-dim)' }}>Importing...</div>}
        {result && (
          <div style={{
            textAlign: 'center',
            marginTop: '12px',
            fontSize: '13px',
            color: result.success ? 'var(--success)' : 'var(--error)',
          }}>
            {result.message}
          </div>
        )}

        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
