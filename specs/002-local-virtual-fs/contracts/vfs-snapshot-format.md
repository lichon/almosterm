# VFS Export / Import Contract

**Feature**: 002-local-virtual-fs
**Version**: 1.0.0
**Library**: ZenFS (`@zenfs/core`)

## Overview

The virtual file system is backed by ZenFS. Export produces a standard **TAR** archive (`.vfs.tar`) of the filesystem contents. Import reads a TAR or ZIP archive and populates the active ZenFS backend. This replaces the custom JSON snapshot format from the earlier plan.

## Export Format

### File Extension

`.vfs.tar` (preferred) or `.vfs.zip`

### MIME Type (for downloads)

`application/x-tar`

### TAR Archive Structure

The TAR archive mirrors the VFS directory structure. Root directory entries are included at the top level:

```
home/user/hello.txt     →  /home/user/hello.txt
home/user/project/       →  /home/user/project/ (directory marker)
etc/hostname             →  /etc/hostname
tmp/                     →  /tmp/ (directory marker)
```

### Export Command

The `vfs-export` built-in command triggers a download:

```
vfs-export                    # Export entire VFS as .vfs.tar
vfs-export --format zip       # Export as .vfs.zip
vfs-export /home/user         # Export only a subtree
```

### Export Flow

1. Command handler walks the ZenFS filesystem starting from the specified path (default: `/`)
2. For each file: read content, create TAR entry with path, permissions, timestamps
3. For each directory: create TAR directory entry
4. Stream the TAR archive to a Blob
5. Trigger browser download via `URL.createObjectURL(blob)`

### Archive Metadata

A special `.almosterm-meta.json` entry at the archive root contains:

```json
{
  "version": 1,
  "exportedAt": "2026-07-15T12:00:00Z",
  "fsBackend": "InMemory",
  "totalFiles": 100,
  "totalDirectories": 25,
  "totalSize": 1048576
}
```

## Import Format

### Supported Formats

- `.vfs.tar` (TAR archive)
- `.vfs.zip` (ZIP archive)
- Legacy `.vfs.json` (previous custom format — conversion path provided)

### Import Command

```
vfs-import <path-to-archive>    # Import archive into VFS
vfs-import --merge <archive>    # Merge archive contents (don't clear existing)
vfs-import --clear <archive>    # Clear VFS before import (default)
```

### Import Flow

1. User provides file via file picker or drag-and-drop
2. Parse the archive (TAR, ZIP, or legacy JSON)
3. If `--clear` (default): wipe the current ZenFS backend and re-create
4. Iterate archive entries and write each file/directory into ZenFS
5. Validate: check total size against `maxSize` limit before writing
6. Refresh the terminal's cwd to `/home/user` if old cwd no longer exists

### Import Validation

On import, the system MUST:

1. Verify archive format is recognizable (magic bytes for TAR, ZIP, or JSON)
2. Check total uncompressed size against `maxSize` (reject if exceeded)
3. Validate path names: no `..` traversal, no absolute paths outside VFS, no null bytes
4. Skip entries with invalid names (log warning, continue)
5. Reject the entire import if any critical validation fails

## Default VFS Structure (Initial State)

When no persistence data exists, ZenFS creates this default structure on first launch:

```
/
├── home/
│   └── user/              # Default working directory
│       └── .almostermrc   # Terminal configuration (JSON)
├── tmp/                   # Temporary files (writable)
├── etc/                   # System configuration (read-only)
│   └── hostname           # Contains "almosterm-local"
├── bin/                   # Executable tools directory
├── usr/
│   ├── local/
│   │   └── bin/           # User-installed tools
│   └── share/             # Shared data
└── var/                   # Variable data
```

## Persistence via ZenFS IndexedDB Backend

ZenFS handles persistence transparently when the IndexedDB backend is configured:

| Database | `almosterm-vfs` |
|----------|-----------------|
| Backend | `@zenfs/core` IndexedDB backend |
| Configuration | Set at app startup: `fs.useBackend(IndexedDB, { storeName: 'almosterm-vfs' })` |
| Auto-save | Automatic — every `fs.writeFile` persists to IndexedDB |

No manual serialization needed. The filesystem state persists across page reloads via IndexedDB.
