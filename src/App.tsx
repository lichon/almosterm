import React, { useEffect, useState, useCallback } from 'react';
import { useVfsStore } from './store/vfsStore';
import { useToolStore } from './store/toolStore';
import { getVfs, populateDefaultVfs, loadPersistedVfs } from './fs/configure';
import Bash from './bash';
import { StatusBar } from './components/StatusBar';
import { ImportDialog } from './components/ImportDialog';
import { EditDialog } from './components/EditDialog';
import { useEditorStore } from './store/editorStore';
import './styles/terminal.css';

const App: React.FC = () => {
  const { setVfsReady, vfsReady } = useVfsStore();
  const loadTools = useToolStore((s) => s.loadFromStorage);
  const [initError, setInitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const { open: editOpen, filePath: editPath, openEditor, closeEditor } = useEditorStore();

  // Warn before closing the tab — protects against accidental Ctrl+W
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const handleExport = useCallback(() => {
    const vfs = getVfs();
    const files: Record<string, any> = {};
    collectFiles(vfs, '/', files);
    const snapshot = { version: 1, exportedAt: new Date().toISOString(), files };
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `almosterm-vfs-${dateStr}.vfs.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  function collectFiles(vfs: ReturnType<typeof getVfs>, dir: string, result: Record<string, any>): void {
    if (!vfs.existsSync(dir)) return;
    try {
      for (const entry of vfs.readdirSync(dir)) {
        const fp = dir === '/' ? `/${entry}` : `${dir}/${entry}`;
        try {
          const stat = vfs.statSync(fp);
          if (stat.isDirectory()) {
            result[fp] = { type: 'directory' };
            collectFiles(vfs, fp, result);
          } else {
            result[fp] = { type: 'file', content: vfs.readFileSync(fp, 'utf-8'), size: stat.size };
          }
        } catch {}
      }
    } catch {}
  }

  useEffect(() => {
    async function init() {
      try {
        loadTools();

        // Detect Worker proxy capabilities. If /api/status resolves,
        // route npm through the proxy; otherwise keep direct registry.
        try {
          const res = await fetch('/api/status');
          if (res.ok) {
            const status = await res.json() as { capabilities?: string[] };
            useVfsStore.getState().setCapabilities(status.capabilities ?? []);
          }
        } catch {
          // No Worker — keep default npm registry
        }

        const vfs = getVfs();
        const hasData = loadPersistedVfs(vfs);

        if (!hasData) {
          populateDefaultVfs(vfs);
        }

        setVfsReady(true);
      } catch (err: any) {
        console.error('Init error:', err);
        setInitError(err.message || 'Failed to initialize');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  if (loading) return <div className="loading-screen"><span>Initializing almosterm...</span></div>;
  if (initError) return <div className="error-screen"><p>{initError}</p><button onClick={() => window.location.reload()}>Retry</button></div>;
  if (!vfsReady) return <div className="loading-screen"><span>Filesystem not ready...</span></div>;

  return (
    <div className="app-container">
      <div className="terminal-wrapper"><Bash /></div>
      <StatusBar
        onImport={() => setImportOpen(true)}
        onExport={handleExport}
        onEdit={() => openEditor()}
      />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <EditDialog open={editOpen} onClose={closeEditor} initialPath={editPath} />
    </div>
  );
};

export default App;
