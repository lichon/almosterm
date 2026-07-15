# Tasks: Local Virtual File System Terminal

**Input**: Design documents from `/specs/002-local-virtual-fs/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the feature specification. Test tasks are excluded. If tests are desired, add them in a follow-up pass.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Frontend**: `src/` at repository root
- **Server**: `server/` at repository root
- Both use TypeScript

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and build tooling configuration

- [x] T001 Create project directory structure per plan.md: `src/`, `src/components/`, `src/fs/`, `src/commands/`, `src/commands/builtins/`, `src/runtime/`, `src/tools/`, `src/store/`, `src/hooks/`, `src/styles/`, `server/`
- [x] T002 Initialize npm project with `package.json` in repo root: set name `almosterm`, type `module`, and add scripts `dev`, `build`, `start`
- [x] T003 [P] Install frontend dependencies: `react`, `react-dom`, `xterm`, `xterm-addon-fit`, `xterm-addon-web-links`, `@zenfs/core`, `@zenfs/dom`, `zustand`, `uuid`
- [x] T004 [P] Install frontend dev dependencies: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`, `vitest`, `@testing-library/react`
- [x] T005 [P] Install server dependencies in `server/package.json`: `ws`, `express`, `cors`, `typescript`, `@types/ws`, `@types/express`, `@types/cors`
- [x] T006 [P] Configure Vite in `vite.config.ts`: React plugin, resolve aliases for `@/` → `src/`, dev server port 5173
- [x] T007 [P] Configure TypeScript in `tsconfig.json`: strict mode, JSX react-jsx, paths alias, target ES2022, module ESNext
- [x] T008 [P] Configure server TypeScript in `server/tsconfig.json`: target ES2022, module commonjs (for Node), outDir `dist/`
- [x] T009 Create HTML entry shell in `index.html`: minimal shell with `<div id="root">`, script tag pointing to `src/main.tsx`, viewport meta
- [x] T010 [P] Create terminal CSS in `src/styles/terminal.css`: full-viewport dark background, terminal container, stdout/stderr color differentiation (white for stdout, red for stderr), status bar styles

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T011 Configure ZenFS filesystem in `src/fs/configure.ts`: function `createFs(config: FsConfiguration)` that mounts InMemory or IndexedDB backend, handles initialization errors
- [x] T012 [P] Create default VFS structure factory in `src/fs/defaults.ts`: function `populateDefaultFs()` that creates `/home/user/`, `/tmp/`, `/etc/`, `/bin/`, `/usr/local/bin/`, `/usr/share/`, `/var/` with correct permissions and default files (`.almostermrc`, `hostname`)
- [x] T013 [P] Define command types in `src/commands/types.ts`: `CommandHandler` type alias `(args: string[], cwd: string) => Promise<CommandResult>`, `CommandResult` interface `{ stdout, stderr, exitCode }`, and `ParsedCommand` interface `{ name, args, redirect?: { type, target } }`
- [x] T014 [P] Create Zustand VFS store in `src/store/vfsStore.ts`: state with `cwd: string`, `fsReady: boolean`, `backendType: string`; actions `setCwd`, `setFsReady`, `setBackendType`
- [x] T015 [P] Create Zustand session store in `src/store/sessionStore.ts`: state with `sessionId: string`, `commandHistory: string[]`, `historyIndex: number`; actions `addToHistory`, `navigateHistory`
- [x] T016 [P] Create Zustand tool store in `src/store/toolStore.ts`: state with `tools: Record<string, CustomCliTool>`; actions `registerTool`, `unregisterTool`, `getTool`
- [x] T017 Create React root component in `src/App.tsx`: initialize ZenFS on mount via `createFs`, populate defaults if needed, set `fsReady` in store, render Terminal + StatusBar conditionally when ready, show loading state while initializing
- [x] T018 Create Vite entry point in `src/main.tsx`: React 18 `createRoot`, render `<App />` into `#root`
- [x] T019 [P] Create xterm.js React wrapper in `src/components/Terminal.tsx`: use `useRef` for terminal instance, `useEffect` to create xterm Terminal with FitAddon and WebLinksAddon, ResizeObserver for auto-fit, expose `writeToTerminal` and `onInput` via props/callbacks, handle Ctrl+C as signal
- [x] T020 Create command registry in `src/commands/registry.ts`: `CommandRegistry` class with `Map<string, CommandHandler>`, methods `register(name, handler)`, `unregister(name)`, `resolve(name): CommandHandler | undefined`, `list(): string[]`; pre-populate reserved names list for shadowing prevention
- [x] T021 Create command line parser in `src/commands/parser.ts`: function `parseCommand(input: string): ParsedCommand` that splits command name, handles quoted arguments (single + double quotes), detects redirect operators (`>`, `>>`, `2>`), trims whitespace

**Checkpoint**: Foundation ready — terminal app boots, ZenFS initializes, stores are wired. User story implementation can now begin.

---

## Phase 3: User Story 1 - Navigate and Inspect the Virtual File System (Priority: P1) 🎯 MVP

**Goal**: User can open the terminal, see a default VFS, and navigate it with `ls`, `cd`, `pwd`, and `cat`. Read-only VFS inspection works.

**Independent Test**: Open browser at localhost:5173, type `ls`, see directory listing. Type `cd /etc`, see cwd change. Type `cat /etc/hostname`, see file content.

### Implementation for User Story 1

- [x] T022 [P] [US1] Implement `ls` builtin in `src/commands/builtins/ls.ts`: read directory via `fs.promises.readdir`, format entries (directories with trailing `/`, color coding), handle no args (use cwd), handle non-existent path error, support `-a` flag (show hidden)
- [x] T023 [P] [US1] Implement `pwd` builtin in `src/commands/builtins/pwd.ts`: return current working directory path from session store
- [x] T024 [US1] Implement `cd` builtin in `src/commands/builtins/cd.ts`: resolve target path (absolute or relative), validate target is an existing directory via `fs.existsSync` + `fs.statSync`, update cwd in VFS store, handle `cd` with no args (go to `/home/user`), handle `cd -` (previous directory), error on non-existent directory
- [x] T025 [P] [US1] Implement `cat` builtin in `src/commands/builtins/cat.ts`: read file via `fs.promises.readFile`, support multiple file args, handle non-existent file, handle reading a directory (error message), respect read permission
- [x] T026 [US1] Register US1 builtins in command registry: register `ls`, `cd`, `pwd`, `cat` handlers in `src/commands/registry.ts` initialization (or separate init function)
- [x] T027 [US1] Create command execution hook in `src/hooks/useCommandExecution.ts`: listen for terminal input, call `parseCommand`, resolve handler from registry, execute with cwd and args, write stdout to terminal, write stderr in red to terminal, display exit code for non-zero, update prompt after execution
- [x] T028 [US1] Implement bash-like prompt in `src/bash.tsx`: component that shows `user@almosterm:<cwd>$ ` prompt using cwd from VFS store, handle keyboard input (Enter to execute, arrow keys for history), render as shell entry point ("just-bash") — wraps Terminal component

**Checkpoint**: At this point, User Story 1 is fully functional — navigation and inspection of VFS works. This is the MVP.

---

## Phase 4: User Story 2 - Create and Modify Files and Directories (Priority: P1)

**Goal**: User can create directories (`mkdir`), files (`touch`), write to files (`echo` with `>`, `>>`), remove (`rm`), copy (`cp`), and move/rename (`mv`). All write operations against the VFS.

**Independent Test**: Run `mkdir testdir && cd testdir && touch hello.txt && echo "world" > hello.txt && cat hello.txt` — output is `world`.

### Implementation for User Story 2

- [x] T029 [P] [US2] Implement `mkdir` builtin in `src/commands/builtins/mkdir.ts`: create directory via `fs.promises.mkdir`, support `-p` flag (create parents), error on existing directory, error on permission denied
- [x] T030 [P] [US2] Implement `touch` builtin in `src/commands/builtins/touch.ts`: create empty file if not exists, update mtime if exists, support multiple file args, handle permission denied
- [x] T031 [US2] Implement `echo` builtin in `src/commands/builtins/echo.ts`: join args with space, detect redirect operators from parser output, write to file via `fs.promises.writeFile` with `>` (overwrite), via `fs.promises.appendFile` with `>>` (append), handle permission denied on write
- [x] T032 [P] [US2] Implement `rm` builtin in `src/commands/builtins/rm.ts`: remove file via `fs.promises.unlink`, support `-r` flag for recursive directory removal via `fs.promises.rm`, support `-f` flag (force, suppress errors), confirmation for `rm -rf /`
- [x] T033 [P] [US2] Implement `cp` builtin in `src/commands/builtins/cp.ts`: copy file via reading source and writing to dest, support `-r` flag for recursive directory copy, error on overwrite without `-f` flag, preserve permissions
- [x] T034 [P] [US2] Implement `mv` builtin in `src/commands/builtins/mv.ts`: move/rename via `fs.promises.rename`, handle cross-directory moves, error on target exists (unless `-f`), error on permission denied
- [x] T035 [US2] Register US2 builtins in command registry: register `mkdir`, `touch`, `echo`, `rm`, `cp`, `mv` handlers
- [x] T036 [US2] Implement basic permission enforcement in `src/commands/builtins/` shared helpers: `checkWritable(path)` and `checkReadable(path)` helper functions using `fs.statSync` to check ZenFS permissions, return appropriate error messages for denied operations

**Checkpoint**: User Stories 1 AND 2 both work — full read/write VFS operations available.

---

## Phase 5: User Story 3 - Run Node.js Commands Against Virtual Files (Priority: P2)

**Goal**: User can execute Node.js scripts and inline code via the local almostnode companion server. Scripts read from and write to the VFS.

**Independent Test**: Write `console.log("vfs-node")` to a file, run `node script.js`, see output. Run `node -e "1+1"`, see `2`.

### Implementation for User Story 3

- [x] T037 [P] [US3] Create WebSocket client for almostnode in `src/runtime/almostnode-client.ts`: class `AlmostnodeClient` with methods `connect()`, `exec(script, options): Promise<ExecResult>`, `cancel(id)`, `check(): Promise<NodeInfo>`; handle connection lifecycle, reconnection, timeouts
- [x] T038 [P] [US3] Define shared protocol types in `src/runtime/types.ts`: message type enums matching websocket-protocol.md contract (`ExecScriptPayload`, `ExecResultPayload`, `ExecOutputPayload`, `ExecErrorPayload`, `NodeInfoPayload`)
- [x] T039 [US3] Implement `node` builtin in `src/commands/builtins/node.ts`: handle `node -e "<code>"` (inline execution), `node <script>` (file execution — read from VFS first, send content), `node --version` (check server), `node` with no args (show repl message or help); send VFS files context via `vfsFiles` payload for require resolution
- [x] T040 [US3] Register `node` builtin in command registry
- [x] T041 [P] [US3] Create almostnode companion server entry in `server/index.ts`: Express server with WebSocket upgrade on `/node` path, CORS for localhost, startup message with port
- [x] T042 [P] [US3] Implement script executor in `server/executor.ts`: spawn almostnode child process with script content (write to temp file first), stream stdout/stderr back via WebSocket messages, capture exit code, enforce timeout (default 30s), handle cancel (SIGTERM → SIGKILL after 2s)
- [x] T043 [US3] Implement workspace manager in `server/workspace.ts`: create temp directory per execution, materialize VFS files from browser's `vfsFiles` payload into temp dir, set cwd, clean up after execution completes or times out
- [x] T044 [US3] Implement VFS bridge in `server/vfs-bridge.ts`: provide a virtual `fs` module shim that intercepts `require('fs')` calls in executed scripts, redirecting reads/writes to the correct temp workspace paths and syncing results back via the WebSocket response
- [x] T045 [US3] Create Vite plugin to spawn companion server in `server/vite-plugin.ts`: plugin that starts `server/index.ts` as child process on Vite `configureServer` hook, kills it on `closeBundle`, logs server URL to console

**Checkpoint**: Node.js execution works end-to-end — browser sends script, server runs it on almostnode, results stream back.

---

## Phase 6: User Story 4 - Register and Use Custom CLI Tools (Priority: P2)

**Goal**: User can register custom CLI tools by name and invoke them from the terminal. Tools operate within the VFS context.

**Independent Test**: Register a tool, invoke it, see its output.

### Implementation for User Story 4

- [x] T046 [P] [US4] Implement custom tool registry in `src/tools/custom-tool-registry.ts`: class `CustomToolRegistry` with `register(tool: CustomCliTool): void`, `unregister(name: string): void`, `get(name: string): CustomCliTool | undefined`, `list(): CustomCliTool[]`; validate name format, no shadowing of built-ins, no duplicates; persist to localStorage under `almosterm-tools`
- [x] T047 [P] [US4] Implement `tool-register` builtin in `src/commands/builtins/tool-register.ts`: parse args `name` and `executablePath`, accept `--description` and `--version` flags, validate executable exists in VFS, register via tool registry, output confirmation
- [x] T048 [P] [US4] Implement `tool-unregister` builtin in `src/commands/builtins/tool-unregister.ts`: remove tool by name from registry, output confirmation or "not found"
- [x] T049 [P] [US4] Implement `tool-list` builtin in `src/commands/builtins/tool-list.ts`: list all registered tools with name, description, version, registration date
- [x] T050 [US4] Register US4 builtins in command registry: `tool-register`, `tool-unregister`, `tool-list`
- [x] T051 [US4] Integrate custom tools into command execution: extend `resolve()` in registry to check custom tool registry after built-ins; when custom tool is resolved, execute its script/binary in the VFS context (use almostnode for JS scripts, shell for bash scripts if available)
- [x] T052 [P] [US4] Create ToolDialog React component in `src/components/ToolDialog.tsx`: modal/dialog with form fields (name, path, description, version), validation feedback, submit calls `tool-register` logic, shown via a toolbar button or `tool-register` command

**Checkpoint**: Custom CLI tool registration and invocation works independently.

---

## Phase 7: User Story 5 - Persist and Restore Virtual File System State (Priority: P3)

**Goal**: User can export VFS to a `.vfs.tar` file, import from a file, and have the VFS auto-persist across page reloads via IndexedDB.

**Independent Test**: Create files, export, refresh browser, import, verify files are restored.

### Implementation for User Story 5

- [x] T053 [P] [US5] Implement `vfs-export` builtin in `src/commands/builtins/vfs-export.ts`: walk ZenFS starting from specified path (default `/`), create TAR entries for each file/directory, stream to Blob, trigger browser download with filename `almosterm-vfs-<date>.vfs.tar`; support `--format zip` flag
- [x] T054 [P] [US5] Implement `vfs-import` builtin in `src/commands/builtins/vfs-import.ts`: accept file path or trigger file picker for `.vfs.tar`/`.vfs.zip`, parse archive, validate entries (no path traversal, size check), support `--merge` flag (add to existing) or `--clear` (wipe first, default), write entries into ZenFS, refresh cwd if needed
- [x] T055 [US5] Implement TAR export/import helpers in `src/fs/export-import.ts`: functions `exportToTar(fs, basePath): Promise<Blob>`, `importFromTar(fs, blob): Promise<void>`, `importFromZip(fs, blob): Promise<void>`; use standard TAR format per vfs-snapshot-format.md contract, include `.almosterm-meta.json` in export, validate on import
- [x] T056 [US5] Configure ZenFS IndexedDB persistence in `src/fs/configure.ts`: on startup, check if IndexedDB has existing data; if yes, mount IndexedDB backend; if no, mount InMemory + populate defaults + switch to IndexedDB; handle backend initialization errors gracefully (fall back to InMemory)
- [x] T057 [P] [US5] Create ImportDialog React component in `src/components/ImportDialog.tsx`: drag-and-drop zone for `.vfs.tar`/`.vfs.zip` files, file picker button, preview of archive contents before import, confirm/merge/clear options, progress indicator for large archives
- [x] T058 [US5] Register `vfs-export`, `vfs-import` builtins in command registry

**Checkpoint**: Full VFS persistence works — auto-save across reloads, manual export/import.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories, UX quality, and validation

- [x] T059 [P] Implement tab completion in `src/hooks/useTabCompletion.ts`: on Tab keypress, get current input word, find matching VFS paths in cwd (files + directories), complete common prefix or show options if multiple matches; integrate into `useCommandExecution` hook
- [x] T060 [P] Implement command history navigation in `src/hooks/useCommandExecution.ts`: store executed commands in session store, handle ArrowUp/ArrowDown to navigate history, update terminal input line
- [x] T061 [P] Implement `clear` builtin in `src/commands/builtins/clear.ts`: clear terminal screen via xterm `clear()` method
- [x] T062 [P] Implement `help` builtin in `src/commands/builtins/help.ts`: list all registered commands (built-in + custom), show description for specific command when name arg provided
- [x] T063 [P] Create StatusBar React component in `src/components/StatusBar.tsx`: display cwd, backend type (InMemory/IndexedDB), VFS total size, almostnode version (from server check), session uptime
- [x] T064 Implement stdout/stderr color differentiation: in `useCommandExecution`, render stderr output with xterm foreground color #FF5555 (red), stdout with default foreground; prefix stderr lines with dimmed marker for accessibility
- [x] T065 Implement Ctrl+C handling: in Terminal component, detect Ctrl+C key event (code 3), send signal to running command (call `cancel` on almostnode client for node commands, set abort flag for long built-in operations)
- [x] T066 Handle edge cases across all builtins: deeply nested paths (100 levels), empty directories, special character filenames, VFS size limit enforcement (check totalSize before write), binary file read attempt (show warning), concurrent session conflict (last-write-wins)
- [x] T067 Run full quickstart.md validation: execute all 12 scenarios from quickstart.md, verify every expected output matches, fix any discrepancies

**Checkpoint**: Application is complete, polished, and validated.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 - Navigate & Inspect (Phase 3)**: Depends on Foundational — first user story
- **US2 - Create & Modify (Phase 4)**: Depends on Foundational + US1 (uses navigation to find/create files)
- **US3 - Node.js Commands (Phase 5)**: Depends on Foundational — needs VFS to store/read scripts; can run in parallel with US2
- **US4 - Custom CLI Tools (Phase 6)**: Depends on Foundational + command registry; can run in parallel with US3
- **US5 - Persist & Restore (Phase 7)**: Depends on Foundational + ZenFS configured; can run in parallel with US3/US4
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Setup ──> Foundational ──> US1 (P1: ls, cd, pwd, cat)
                               │
                               ├──> US2 (P1: mkdir, touch, echo, rm, cp, mv)
                               │
                               ├──> US3 (P2: node execution)    ──┐
                               ├──> US4 (P2: custom tools)      ──┤  (can run in parallel)
                               └──> US5 (P3: persistence)       ──┘
                                                                   │
                                                                   v
                                                              Polish (Phase 8)
```

- **US1 → US2**: US2 depends on US1 only for cd/pwd/ls (navigation needed to verify file operations). Most builtins are independent but test verification uses US1 commands.
- **US3, US4, US5**: Can start in parallel after US1 (or US2 if wanted). Each is independently testable.

### Within Each Phase

- All [P] tasks can run in parallel (different files)
- Non-[P] tasks depend on earlier tasks in the same phase
- Complete all tasks in a phase before validating the checkpoint

### Parallel Opportunities

- **Phase 1**: T003, T004, T005, T006, T007, T008, T010 can all run in parallel
- **Phase 2**: T012, T013, T014, T015, T016, T019 can run in parallel
- **Phase 3**: T022, T023, T025 can run in parallel (different builtin files)
- **Phase 4**: T029, T030, T032, T033, T034 can run in parallel
- **Phase 5**: T037, T038, T041, T042 can run in parallel
- **Phase 6**: T046, T047, T048, T049, T052 can run in parallel
- **Phase 7**: T053, T054, T057 can run in parallel
- **Phase 8**: T059, T060, T061, T062, T063 can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all independent builtins together:
Task T022: "Implement ls builtin in src/commands/builtins/ls.ts"
Task T023: "Implement pwd builtin in src/commands/builtins/pwd.ts"
Task T025: "Implement cat builtin in src/commands/builtins/cat.ts"

# Then, after T023 (pwd) is done:
Task T024: "Implement cd builtin in src/commands/builtins/cd.ts" (needs pwd for cwd tracking)

# Then wire everything together:
Task T026: "Register US1 builtins in command registry"
Task T027: "Create command execution hook in src/hooks/useCommandExecution.ts"
Task T028: "Implement bash-like prompt in src/bash.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (navigate & inspect VFS)
4. Complete Phase 4: User Story 2 (create & modify files)
5. **STOP and VALIDATE**: Run quickstart scenarios 1-4, 9, 11
6. **MVP ready**: Full read/write bash-like terminal in the browser

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 → Test independently → Filesystem navigation working
3. US2 → Test independently → Full read/write VFS (MVP!)
4. US3 → Test independently → Node.js execution with almostnode
5. US4 → Test independently → Custom CLI tool registration
6. US5 → Test independently → VFS persistence and export/import
7. Polish → Final validation → Production ready

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 + 2 (sequential, P1)
   - Developer B: User Story 3 (P2, can start after US1)
   - Developer C: User Story 4 + 5 (P2 + P3, can start after Foundational)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- ZenFS (`@zenfs/core`) provides the `fs` API — builtins use `fs.promises` for async, `fs.existsSync`/`fs.statSync` for sync checks
- Path resolution: use `path.resolve` / `path.join` from the `path` package, not ZenFS internal APIs
- The almostnode companion server runs on `localhost` only, started by a Vite plugin
- Stdout/Stderr distinction: stdout rendered in default terminal foreground, stderr in red (#FF5555)
