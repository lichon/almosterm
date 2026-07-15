# Implementation Plan: Local Virtual File System Terminal

**Branch**: `002-local-virtual-fs` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-local-virtual-fs/spec.md`

**Note**: User specified technology stack: Vite (build/dev), React (UI), almostnode (Node.js runtime), just-bash (app entry as bash shell).

## Summary

Build a browser-based terminal application that runs entirely locally (no remote host). The terminal presents a bash-like shell backed by **ZenFS** (`@zenfs/core`), a browser-native filesystem that implements the Node.js `fs` API. Built-in command handlers use the ZenFS API to interpret bash commands against the virtual filesystem. A local almostnode companion server provides Node.js script execution. The UI is built with React + xterm.js, bundled with Vite.

## Technical Context

**Language/Version**: TypeScript 5.x

**Primary Dependencies**:
- **Frontend**: React 18, xterm.js (terminal emulator), Zustand (state management), ZenFS (`@zenfs/core` + `@zenfs/dom` for backends), Vite (bundler/dev server)
- **Backend**: almostnode (Node.js 22.x compatible runtime), `ws` (WebSocket server), Express (HTTP API)
- **Storage**: ZenFS IndexedDB backend (automatic VFS persistence), localStorage (session config)
- **Testing**: Vitest, React Testing Library

**Storage**: ZenFS IndexedDB backend (auto-persistence on every `fs` write). Export via `.vfs.tar` archives, import from TAR/ZIP. Ephemeral session state only in memory.

**Testing**: Vitest for unit/integration tests. Built-in command handlers tested as pure functions with mock VFS. React Testing Library for component tests.

**Target Platform**: Browser (Chromium-based + Firefox) for UI; local Node.js server for almostnode execution (localhost only, no remote host).

**Project Type**: Web application — local-first, no cloud dependency. Browser frontend + local companion server.

**Performance Goals**:
- VFS operations (ls, mkdir, touch) < 500ms for directories with 1,000 entries (SC-002)
- Tab completion < 300ms (SC-005)
- 10,000 files across 100 directories without degradation (SC-006)
- Node.js script execution < 3s (SC-004)
- VFS export (100 files, 1MB) < 2s (SC-003)

**Constraints**:
- No remote host: everything runs on the user's local machine
- VFS size limit: 100MB total
- Text-only file content (UTF-8), no binary support in v1
- Simplified permissions: owner r/w/x only, no user/group model
- Single user, localhost-only

**Scale/Scope**:
- Single user, single VFS instance
- 10,000+ files, 1,000+ entries per directory
- 100+ registered custom CLI tools
- Node.js scripts up to 30s timeout

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: ✅ PASS (No gates defined)

The project constitution template has not been filled in — no specific principles, constraints, or governance rules are enforced.

**Post-Design Re-check**: ✅ PASS (No changes to report)

## Project Structure

### Documentation (this feature)

```text
specs/002-local-virtual-fs/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: technical research & decisions
├── data-model.md        # Phase 1: entity definitions & relationships
├── quickstart.md        # Phase 1: validation & run guide
├── contracts/           # Phase 1: interface contracts
│   ├── websocket-protocol.md     # Browser ↔ local almostnode server protocol
│   └── vfs-snapshot-format.md    # VFS export/import file format
└── tasks.md             # Phase 2: /speckit.tasks output (not yet created)
```

### Source Code (repository root)

```text
src/                              # Frontend (Vite + React)
├── main.tsx                      # Vite entry point
├── App.tsx                       # Root React component
├── index.html                    # Entry HTML shell
├── bash.tsx                      # Bash shell entry component (just-bash)
├── components/
│   ├── Terminal.tsx              # xterm.js React wrapper
│   ├── StatusBar.tsx             # Session info: cwd, node version, VFS size
│   ├── ToolDialog.tsx            # Custom CLI tool registration UI
│   └── ImportDialog.tsx          # VFS import UI
├── fs/
│   ├── configure.ts              # ZenFS backend configuration (InMemory, IndexedDB, Overlay)
│   ├── defaults.ts               # Default VFS structure factory (populate on first launch)
│   └── export-import.ts          # TAR/ZIP export and import via ZenFS streams
├── commands/
│   ├── registry.ts               # CommandRegistry: builtins + custom tools
│   ├── parser.ts                 # Command line parser (args, quotes, redirects)
│   ├── types.ts                  # CommandHandler, CommandResult types
│   └── builtins/
│       ├── ls.ts                 # List directory contents
│       ├── cd.ts                 # Change directory
│       ├── pwd.ts                # Print working directory
│       ├── cat.ts                # Display file content
│       ├── echo.ts               # Print text + redirect (> , >>)
│       ├── mkdir.ts              # Create directory
│       ├── touch.ts              # Create empty file / update timestamp
│       ├── rm.ts                 # Remove file or directory (-r flag)
│       ├── cp.ts                 # Copy file (-r for directory)
│       ├── mv.ts                 # Move/rename file or directory
│       ├── node.ts               # Proxy to almostnode server via WebSocket
│       ├── vfs-export.ts         # Export VFS to .vfs.tar download
│       ├── vfs-import.ts         # Import VFS from .vfs.tar/.vfs.zip file
│       ├── clear.ts              # Clear terminal screen
│       └── help.ts               # Show available commands
├── runtime/
│   ├── almostnode-client.ts      # WebSocket client for almostnode server
│   └── types.ts                  # Shared types for exec protocol
├── tools/
│   └── custom-tool-registry.ts   # Custom CLI tool CRUD (backed by localStorage)
├── store/
│   ├── vfsStore.ts               # Zustand store: VFS instance, cwd, dirty flag
│   ├── sessionStore.ts           # Zustand store: command history, session id
│   └── toolStore.ts              # Zustand store: registered custom tools
├── hooks/
│   ├── useTerminal.ts            # xterm.js lifecycle hook
│   ├── useCommandExecution.ts    # Command dispatch: parse → resolve → execute → render
│   └── useTabCompletion.ts       # Tab completion logic for VFS paths
└── styles/
    └── terminal.css              # Terminal styling, stdout/stderr colors

server/                           # Local almostnode companion server
├── index.ts                      # Express + WebSocket server entry
├── executor.ts                   # Node.js script executor (spawn, stream I/O)
├── workspace.ts                  # Temp workspace: materialize VFS files, cleanup
└── vfs-bridge.ts                 # Virtual fs module for Node scripts (path translation)
```

**Structure Decision**: Web application structure with separate frontend (`src/`) and companion server (`server/`). The frontend runs in the browser and manages the ZenFS filesystem (InMemory or IndexedDB backend), the command interpreter, and the terminal UI. The companion server is a lightweight local process that only handles `node`/`npx` command execution — it receives script content and VFS context from the browser over WebSocket and returns results. The custom `vfs/` directory from earlier plans is replaced by a lightweight `fs/` directory that configures ZenFS backends and populates the default filesystem structure.

## Complexity Tracking

> No constitution violations to justify. The architecture uses a local companion server only for the specific capability (Node.js execution) that cannot run in a browser. All other terminal functionality runs purely client-side in the VFS.
