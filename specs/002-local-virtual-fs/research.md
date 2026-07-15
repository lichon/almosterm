# Research: Local Virtual File System Terminal

**Feature**: 002-local-virtual-fs
**Date**: 2026-07-15

## 1. Terminal Emulation: xterm.js + React Integration

**Decision**: Wrap xterm.js in a React component using `useRef` for the terminal instance and `useEffect` for lifecycle management. Use the xterm.js addons (`fit`, `web-links`) for auto-resize and URL detection.

**Rationale**:
- xterm.js is not a React library; it manages its own DOM. The standard pattern is a thin React wrapper that owns the terminal instance via a ref.
- The `FitAddon` automatically resizes the terminal when the container dimensions change, handled via `ResizeObserver`.
- React state (via Zustand) drives the status bar, tool panel, and session info — not the terminal rendering itself.
- This pattern is battle-tested in VS Code's terminal, Playground environments (CodeSandbox, StackBlitz), and numerous open-source web terminals.

**Alternatives considered**:
- `react-terminal` / `terminal-in-react`: Limited escape sequence support; no PTY; not suitable for real terminal emulation.
- Custom canvas-based terminal: Massive effort to reimplement VT100/VT520 sequences.
- Raw xterm.js without React: Loses React's component model for the surrounding UI (status bar, tool panel, dialogs).

## 2. Virtual File System: ZenFS

**Decision**: Use **ZenFS** (`@zenfs/core`) as the virtual file system implementation. ZenFS provides a complete Node.js `fs` API in the browser with swappable backends. Use the **InMemory** backend for runtime operations and the **IndexedDB** backend for persistence.

**Rationale**:
- ZenFS implements the full `fs` module API (`fs/promises`, streams, `path` resolution, directory operations, permissions) — no need to build a custom VFS from scratch.
- InMemory backend: fast, pure in-memory filesystem ideal for terminal operations.
- IndexedDB backend: transparent persistence without manual serialization; just switch the backend for save/load.
- Immediate compatibility with Node.js scripts running on almostnode: scripts can `require('fs')` or `import 'fs'` and work against the same VFS.
- Battle-tested library used by tools like Phoenix Code, providing filesystem functionality for browser-based IDEs.
- Eliminates the need for custom VirtualNode, VirtualFile, VirtualDirectory classes — reducing implementation surface and bug risk.
- Built-in support for file permissions (chmod), symlinks, and standard Unix FS semantics.

**Alternatives considered**:
- Custom tree-based VFS (previous plan): Significant implementation effort; must handle edge cases (permissions, symlinks, path traversal); harder to test; no `fs` API compatibility.
- BrowserFS (predecessor to ZenFS): Legacy; ZenFS is the maintained successor with better API and TypeScript support.
- MemFS (VS Code's in-memory FS): Tied to VS Code internals; not a standalone package.

## 3. Command Parsing and Built-in Handlers

**Decision**: A command registry maps command names to handler functions. A parser splits input into command name, arguments (respecting quotes), and redirect operators (`>`, `>>`). Handlers receive parsed args, the current VFS instance, and session context; they return `{ stdout, stderr, exitCode }`.

**Rationale**:
- Registry pattern enables both built-in commands and custom CLI tools (FR-007) to be treated uniformly.
- Parser handles: whitespace splitting, single/double-quoted strings, escape sequences, and redirection (`>`, `>>`, `2>`).
- Each built-in command is a pure function: `(args, vfs, session) => CommandResult`. This makes them independently testable.
- The `node` built-in is special: it delegates to the local almostnode server via WebSocket rather than running inline.

**Alternatives considered**:
- Full bash parser (shell-quote, bashlex): Overkill for the subset of commands; adds complexity and bundle size.
- Each command as a class with inheritance: Adds ceremony without benefit over simple functions.

## 4. almostnode Integration via Local Server

**Decision**: A lightweight local Node.js server (running on almostnode) handles `node` and `npx` command execution. The browser sends script content and VFS context via WebSocket; the server spawns the script in a sandboxed worker, captures stdout/stderr/exit code, and returns results. The server is started alongside the Vite dev server.

**Rationale**:
- Node.js cannot run natively in the browser. A local companion server is the pragmatic solution that satisfies "no remote host" (the server is on localhost, not the cloud).
- WebSocket enables bidirectional streaming for long-running Node.js scripts.
- The server reads VFS files from a temporary workspace synced from the browser's VFS, and writes output back — giving Node.js scripts the illusion of direct VFS access.
- almostnode is the Node.js runtime for this server, fulfilling the "backed by almostnode" requirement.

**Alternatives considered**:
- WebAssembly Node.js (e.g., WebContainer): Heavier, less mature, may not support all Node.js APIs. almostnode may not have a WASM build.
- Service Worker-based execution: Cannot spawn child processes or access Node.js built-in modules.
- Browser-only eval: No `fs`, `path`, `child_process` modules; severely limited.

## 5. VFS Persistence with ZenFS IndexedDB Backend

**Decision**: Use ZenFS's built-in **IndexedDB** backend for automatic, transparent persistence. At startup, mount IndexedDB as the primary store. For export, serialize the InMemory filesystem to a portable `.vfs.tar` or `.vfs.zip` archive using ZenFS's stream API. For import, read an archive and populate the filesystem.

**Rationale**:
- ZenFS IndexedDB backend stores each file/directory as an IndexedDB record — no manual serialization needed.
- Auto-persistence is implicit: every `fs.writeFile` goes through ZenFS which writes to IndexedDB if that backend is configured.
- IndexedDB storage limits (typically 50MB+ depending on browser) accommodate the 100MB VFS target.
- Export via ZenFS streams: can create a portable archive (tar/zip) of the entire filesystem.
- Import: restore from archive into a fresh InMemory filesystem, then optionally flush to IndexedDB.

**Alternatives considered**:
- Custom JSON serialization (previous plan): Extra work; no `fs` API compatibility; fragile for large filesystems.
- OPFS (Origin Private File System) ZenFS backend: Available as `@zenfs/dom` OPFS backend; better for large binary data but the IndexedDB backend is more mature and sufficient for text-based files.

## 6. React State Management with Zustand

**Decision**: Use Zustand for global VFS state and terminal session state. Zustand stores hold the VFS tree reference, current working directory, command history, and tool registry.

**Rationale**:
- Zustand is lightweight (~1KB), has no boilerplate (no providers, no action creators), and works naturally with React hooks.
- The VFS tree is a mutable class instance stored in a Zustand atom; mutations trigger re-renders via Immer-style immutable updates or explicit `setState` calls.
- Multiple stores (VFS store, session store, tool store) keep concerns separated.

**Alternatives considered**:
- Redux Toolkit: Overkill for this app's state complexity; significant boilerplate.
- React Context + useReducer: Re-render performance issues with large VFS trees; every context consumer re-renders on any change.
- Jotai / Recoil: Fine-grained atoms would work but Zustand's simpler API is preferred for this scale.

## 7. Build Tooling: Vite

**Decision**: Vite as the build tool and dev server. The local almostnode WebSocket server runs as a Vite plugin that starts alongside the dev server.

**Rationale**:
- User specified Vite as the build tool.
- Vite provides fast HMR, native ESM dev serving, and optimized production builds.
- A Vite plugin can spawn the almostnode companion server as a child process, ensuring it starts/stops with the dev server.
- TypeScript and React are first-class in Vite with zero configuration.

**Alternatives considered**:
- webpack: Slower dev startup; more configuration; not specified by user.
- Turbopack: Still experimental; not as widely adopted.

## 8. Testing Strategy

**Decision**: Vitest for unit/integration tests. React Testing Library for component tests. Built-in commands tested as pure functions with mock VFS. Node.js execution tested via the local server API.

**Rationale**:
- Vitest integrates natively with Vite, sharing the same config and transform pipeline.
- Built-in commands as pure functions → trivially testable without browser environment.
- React Testing Library for Terminal component: verifies xterm.js lifecycle, resize handling.
- E2E tests (Playwright) for full terminal workflows in a real browser — planned for later phases.

**Alternatives considered**:
- Jest: Requires separate configuration; slower in Vite projects.
- Cypress for E2E: Heavier than Playwright for this use case.
