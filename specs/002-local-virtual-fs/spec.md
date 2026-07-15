# Feature Specification: Local Virtual File System Terminal

**Feature Branch**: `002-local-virtual-fs`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "local virtual file system for the terminal, no remote host"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate and Inspect the Virtual File System (Priority: P1)

A developer opens the web terminal in their browser. The terminal presents a virtual file system — an in-memory, simulated filesystem that behaves like a real Unix filesystem but does not touch the host machine's disk. The user navigates directories with `cd`, lists contents with `ls`, checks the current path with `pwd`, and views file contents with `cat`. Every operation responds as it would on a real filesystem, but the data lives entirely within the application's runtime.

**Why this priority**: Filesystem navigation is the most fundamental terminal interaction. Without the ability to see and move around the virtual filesystem, no other file operations are possible.

**Independent Test**: Can be fully tested by opening the terminal, running `ls` to see the root directory contents, running `cd` into a subdirectory, and running `pwd` to confirm the path changed.

**Acceptance Scenarios**:

1. **Given** the terminal starts with a pre-populated virtual filesystem (root directory with sample files and subdirectories), **When** the user types `ls`, **Then** the names of files and directories in the current directory are listed.
2. **Given** the user is in a directory containing subdirectories, **When** the user types `cd <subdirectory>`, **Then** the current working directory changes and subsequent `pwd` shows the new path.
3. **Given** the user types `cd` into a non-existent directory, **When** the command runs, **Then** an error message like "No such file or directory" is displayed.
4. **Given** a file with text content exists in the current directory, **When** the user types `cat <filename>`, **Then** the file's content is displayed in the terminal.

---

### User Story 2 - Create and Modify Files and Directories (Priority: P1)

A developer uses standard filesystem commands to create directories (`mkdir`), create empty files (`touch`), write to files (`echo "text" > file`), remove files (`rm`), copy files (`cp`), and move/rename files (`mv`). All operations modify the virtual filesystem in memory and are immediately visible to subsequent commands.

**Why this priority**: Creating and modifying files is essential for any development workflow. Without write operations, the virtual filesystem is read-only and cannot serve as a workspace.

**Independent Test**: Can be fully tested by running `mkdir testdir && cd testdir && touch hello.txt && echo "world" > hello.txt && cat hello.txt` and confirming the output is `world`.

**Acceptance Scenarios**:

1. **Given** the user is in a writable directory, **When** the user types `mkdir myproject`, **Then** a new directory named `myproject` is created and visible in `ls`.
2. **Given** the user is in a writable directory, **When** the user types `echo "Hello World" > greeting.txt` then `cat greeting.txt`, **Then** the output is `Hello World`.
3. **Given** a file `oldname.txt` exists, **When** the user types `mv oldname.txt newname.txt`, **Then** the file is renamed and `ls` shows `newname.txt` but not `oldname.txt`.
4. **Given** a file `temp.txt` exists, **When** the user types `rm temp.txt`, **Then** the file is removed and `ls` no longer shows it.
5. **Given** a file `original.txt` exists, **When** the user types `cp original.txt copy.txt`, **Then** both files exist with identical content.
6. **Given** the user tries to create a file in a read-only directory, **When** the command runs, **Then** a "Permission denied" error is displayed.

---

### User Story 3 - Run Node.js Commands Against Virtual Files (Priority: P2)

A developer uses the almostnode-backed Node.js runtime to execute scripts stored in the virtual filesystem. They can write a Node.js script to a file, then run it with `node script.js`. The script reads from and writes to the virtual filesystem seamlessly.

**Why this priority**: Node.js execution is a core requirement, but depends on having files in the VFS to operate on. It builds on top of stories 1 and 2.

**Independent Test**: Can be fully tested by writing `console.log("vfs-node")` to a file via `echo`, then running `node script.js` and confirming the output appears.

**Acceptance Scenarios**:

1. **Given** a file `app.js` exists containing `console.log("Hello from VFS")`, **When** the user types `node app.js`, **Then** the output `Hello from VFS` is displayed.
2. **Given** the user types `node -e "console.log(process.cwd())"`, **When** the command runs, **Then** the current virtual working directory path is displayed.
3. **Given** the user runs a Node.js script that writes to a file (e.g., `fs.writeFileSync`), **When** the script completes, **Then** the file is created in the virtual filesystem and visible via `ls`.

---

### User Story 4 - Register and Use Custom CLI Tools (Priority: P2)

A developer registers a custom CLI tool — a script or binary that can be invoked by name. The tool operates within the virtual filesystem context: it sees the virtual working directory, can read from and write to virtual files, and receives arguments normally.

**Why this priority**: Custom CLI tools extend the terminal's capabilities but depend on the core VFS and command execution infrastructure.

**Independent Test**: Can be fully tested by registering a shell script as a custom tool, invoking it with arguments, and verifying its output.

**Acceptance Scenarios**:

1. **Given** a custom CLI tool `mytool` has been registered, **When** the user types `mytool --flag value`, **Then** the tool executes and its output appears in the terminal.
2. **Given** a custom tool reads from the virtual filesystem, **When** it accesses a file in the current virtual working directory, **Then** it receives the correct virtual file content.
3. **Given** a custom tool exits with a non-zero code, **When** it finishes, **Then** the exit code is shown to the user.

---

### User Story 5 - Persist and Restore Virtual File System State (Priority: P3)

A developer saves the current state of their virtual filesystem to a snapshot file, or exports it as a portable archive. Later, they can restore the filesystem from that snapshot, resuming work exactly where they left off. This also provides resilience against accidental page refreshes.

**Why this priority**: Persistence is valuable for real workflows but the terminal is usable without it (ephemeral sessions are acceptable for quick tasks).

**Independent Test**: Can be fully tested by creating files in the VFS, exporting a snapshot, refreshing the browser, importing the snapshot, and verifying all files are restored.

**Acceptance Scenarios**:

1. **Given** the user has created files and directories in the virtual filesystem, **When** they trigger an export (e.g., `vfs-export`), **Then** a downloadable snapshot file is generated containing the full VFS state.
2. **Given** a previously exported VFS snapshot file, **When** the user imports it (e.g., `vfs-import <file>`), **Then** the virtual filesystem is restored to the exact state from the snapshot.
3. **Given** the user's browser tab is closed unexpectedly, **When** they reopen the terminal, **Then** the VFS state from the last auto-save (if enabled) is automatically restored.

---

### Edge Cases

- What happens when the virtual filesystem reaches its configured size limit (e.g., 100MB)?
- How does the system handle deeply nested directory paths (e.g., 100 levels deep)?
- What happens when a command tries to read a binary file as text via `cat`?
- How are file permissions enforced in the virtual filesystem? Which operations are restricted?
- What happens when two concurrent terminal sessions modify the same virtual file?
- How does tab completion work for virtual filesystem paths?
- What happens when the user types a path that looks like an absolute host path (e.g., `/etc/passwd`)?
- How does `rm -rf /` behave on the virtual filesystem root?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an in-memory virtual file system that supports a hierarchical directory structure with files and directories.
- **FR-002**: The system MUST support standard file navigation commands: `ls` (list directory), `cd` (change directory), `pwd` (print working directory).
- **FR-003**: The system MUST support file creation and modification commands: `mkdir` (create directory), `touch` (create empty file), `echo` with redirect (`>`, `>>`), `cat` (display file content), `rm` (remove), `cp` (copy), `mv` (move/rename).
- **FR-004**: The system MUST enforce basic file permissions (read/write/execute) on virtual filesystem nodes, with appropriate error messages for denied operations.
- **FR-005**: The system MUST run entirely on the local machine without requiring a connection to any remote host.
- **FR-006**: The system MUST provide a Node.js runtime backed by almostnode, capable of executing Node.js scripts that read from and write to the virtual filesystem.
- **FR-007**: Custom CLI tools registered by the user MUST operate within the virtual filesystem context, seeing the virtual working directory and accessing virtual files.
- **FR-008**: The system MUST support exporting the entire virtual filesystem state to a portable snapshot file.
- **FR-009**: The system MUST support importing a previously exported snapshot to restore the virtual filesystem state.
- **FR-010**: The system MUST display stdout and stderr output distinctly (e.g., color differentiation).
- **FR-011**: The system MUST handle command cancellation (Ctrl+C) for running commands within the virtual environment.
- **FR-012**: The system MUST maintain command history within a session, accessible via arrow key navigation.
- **FR-013**: The system MUST provide tab completion for virtual filesystem paths.
- **FR-014**: The system MUST start with a pre-populated default virtual filesystem (root directory with standard subdirectories like `/home`, `/tmp`, `/etc`).

### Key Entities

- **VirtualFileSystem**: The entire in-memory filesystem tree. Contains a root node, tracks total size, and provides lookup by path. Manages the current working directory per session.
- **VirtualNode**: Base entity for any filesystem entry. Has a name, parent directory reference, permissions (read/write/execute flags for owner), creation timestamp, and modification timestamp.
- **VirtualFile**: A leaf node in the VFS tree. Contains text content (string) and a size derived from content length. Supports read and write operations.
- **VirtualDirectory**: A container node in the VFS tree. Contains an ordered collection of child nodes (files and subdirectories). Supports lookup by name, add child, remove child, and list operations.
- **TerminalSession**: A single browser tab's connection to the local terminal runtime. Contains the current working directory path within the VFS, command history, and active process state.
- **CustomCLITool**: A user-registered executable mapped to a name. Has a name, executable path or inline script content, description, and version.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can navigate the virtual filesystem, create a directory, create a file with content, and read it back — all in under 10 seconds from a fresh terminal start.
- **SC-002**: File creation and listing commands (`mkdir`, `touch`, `ls`) return results in under 500 milliseconds for a VFS with up to 1,000 entries in a single directory.
- **SC-003**: A user can export a VFS containing 100 files totaling 1MB of content in under 2 seconds, and re-import it successfully with all files intact.
- **SC-004**: Node.js script execution via `node script.js` produces output within 3 seconds for scripts stored in the virtual filesystem.
- **SC-005**: Tab completion for VFS paths returns suggestions in under 300 milliseconds.
- **SC-006**: The virtual filesystem correctly handles at least 10,000 files across 100 directories without errors or performance degradation.
- **SC-007**: All file operations produce appropriate error messages for invalid inputs (non-existent paths, permission denied, invalid names) — no crashes or silent failures.

## Assumptions

- The terminal runs on the user's local machine with no remote server dependency. All processing happens locally.
- The virtual filesystem is primarily in-memory with optional persistence via import/export snapshots. Auto-save uses browser local storage or a local file.
- File content in the virtual filesystem is text-based (UTF-8). Binary file support is not required for v1.
- File permissions are simplified: each node has owner read/write/execute flags. The concept of "other" users and groups is out of scope for v1.
- The virtual filesystem starts pre-populated with a reasonable default structure mimicking a minimal Linux filesystem (`/`, `/home`, `/tmp`, `/etc`, `/bin`, `/usr`).
- Commands like `echo`, `cat`, `ls`, `cd`, `pwd`, `mkdir`, `touch`, `rm`, `cp`, `mv` are implemented as built-in command handlers rather than relying on a real bash shell, since there is no remote host bash.
- Node.js execution via almostnode runs in the local server process; the virtual filesystem is exposed to Node.js scripts through a virtualized `fs` module or path translation layer.
- Custom CLI tools are scripts or binaries that execute in the local environment. Shell scripts are interpreted by the local bash (if available) but operate on virtual paths.
- Interactive commands requiring real-time stdin beyond simple text (e.g., text editors like vim) remain out of scope for v1.
- The system is designed for a single user. Concurrent session conflicts with the same VFS are resolved on a last-write-wins basis.
