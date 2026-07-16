import React from 'react';
import { useVfsStore } from '../store/vfsStore';

interface StatusBarProps {
  onImport?: () => void;
  onExport?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({ onImport, onExport }) => {
  const { cwd, totalSize, vfsReady } = useVfsStore();

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="status-bar">
      <div className="status-bar__item">
        <span className="status-bar__label">cwd:</span>
        <span className="status-bar__value">{cwd}</span>
      </div>
      <div className="status-bar__item">
        <span className="status-bar__label">runtime:</span>
        <span className={`status-bar__value${vfsReady ? ' status-bar__value--success' : ''}`}>
          almostnode
        </span>
      </div>
      <div className="status-bar__item">
        <span className="status-bar__label">size:</span>
        <span className="status-bar__value">{formatSize(totalSize)}</span>
      </div>
      <div style={{ flex: 1 }} />
      <div className="status-bar__item">
        <span className="status-bar__label">session:</span>
        <span className="status-bar__value">local</span>
      </div>
      {onImport && (
        <button
          className="status-bar__btn"
          onClick={onImport}
          title="Import VFS snapshot"
          style={{
            background: 'transparent',
            border: '1px solid var(--border, #333366)',
            color: 'var(--text-dim)',
            padding: '2px 10px',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '12px',
            marginLeft: '8px',
          }}
        >
          📥 Import
        </button>
      )}
      {onExport && (
        <button
          className="status-bar__btn"
          onClick={onExport}
          title="Export VFS snapshot"
          style={{
            background: 'transparent',
            border: '1px solid var(--border, #333366)',
            color: 'var(--text-dim)',
            padding: '2px 10px',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '12px',
            marginLeft: '4px',
          }}
        >
          📤 Export
        </button>
      )}
    </div>
  );
};
