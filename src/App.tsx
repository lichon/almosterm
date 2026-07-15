import React, { useEffect, useState } from 'react';
import { useVfsStore } from './store/vfsStore';
import { useToolStore } from './store/toolStore';
import { getVfs, populateDefaultVfs, loadPersistedVfs } from './fs/configure';
import Bash from './bash';
import { StatusBar } from './components/StatusBar';
import './styles/terminal.css';

const App: React.FC = () => {
  const { setVfsReady, vfsReady } = useVfsStore();
  const loadTools = useToolStore((s) => s.loadFromStorage);
  const [initError, setInitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        loadTools();

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
      <StatusBar />
    </div>
  );
};

export default App;
