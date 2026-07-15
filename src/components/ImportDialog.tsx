import React, { useState, useCallback } from 'react';
import { importFromBlob } from '../fs/export-import';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({ open, onClose }) => {
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setImporting(true);
    setResult(null);

    try {
      const res = await importFromBlob(file, false);
      setResult({
        success: true,
        message: `Imported ${res.imported} files successfully.${res.errors.length > 0 ? ` ${res.errors.length} errors.` : ''}`,
      });
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      setResult({ success: false, message: err.message });
    } finally {
      setImporting(false);
    }
  }, [onClose]);

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

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="dialog">
        <h2>Import VFS Snapshot</h2>

        <div
          className={`drop-zone${dragOver ? ' drop-zone--active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="drop-zone__icon">📁</div>
          <div>Drag & drop a .vfs.json or .vfs.tar file here</div>
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
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};
