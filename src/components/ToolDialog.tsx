import React, { useState } from 'react';
import { useToolStore } from '../store/toolStore';

interface ToolDialogProps {
  open: boolean;
  onClose: () => void;
}

export const ToolDialog: React.FC<ToolDialogProps> = ({ open, onClose }) => {
  const registerTool = useToolStore((s) => s.registerTool);

  const [name, setName] = useState('');
  const [executablePath, setExecutablePath] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = () => {
    setError('');
    setSuccess('');

    if (!name.trim() || !executablePath.trim()) {
      setError('Name and executable path are required');
      return;
    }

    const result = registerTool({
      name: name.trim(),
      type: 'binary' as const,
      executablePath: executablePath.trim(),
      scriptContent: null,
      description: description.trim() || null,
      version: version.trim() || null,
      registeredAt: Date.now(),
    });

    if (!result.success) {
      setError(result.error || 'Registration failed');
    } else {
      setSuccess(`Tool '${name}' registered successfully`);
      setName('');
      setExecutablePath('');
      setDescription('');
      setVersion('');
      setTimeout(() => {
        setSuccess('');
        onClose();
      }, 1500);
    }
  };

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="dialog">
        <h2>Register Custom Tool</h2>

        <label>
          Tool Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="myscript"
            autoFocus
          />
        </label>

        <label>
          Executable Path (in VFS)
          <input
            value={executablePath}
            onChange={(e) => setExecutablePath(e.target.value)}
            placeholder="/usr/local/bin/myscript"
          />
        </label>

        <label>
          Description
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this tool do?"
          />
        </label>

        <label>
          Version
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.0.0"
          />
        </label>

        {error && <div style={{ color: 'var(--error)', fontSize: '13px', marginTop: '8px' }}>{error}</div>}
        {success && <div style={{ color: 'var(--success)', fontSize: '13px', marginTop: '8px' }}>{success}</div>}

        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit}>Register</button>
        </div>
      </div>
    </div>
  );
};
