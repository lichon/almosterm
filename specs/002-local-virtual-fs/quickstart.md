# Quickstart: Local Virtual File System Terminal

**Feature**: 002-local-virtual-fs
**Date**: 2026-07-15

## Prerequisites

- almostnode installed (provides `node` and `npx` on PATH)
- A modern web browser (Chromium-based or Firefox)
- Git

## Setup

```bash
# Clone and enter the repository
git clone <repo-url> almosterm
cd almosterm

# Install dependencies
npm install
```

## Start the Application

```bash
# Start the Vite dev server + almostnode companion server
npm run dev
```

Expected output:
```
Vite dev server:  http://localhost:5173
almostnode bridge: ws://localhost:9393/node
Node.js runtime:  v22.21.1 (almostnode)
```

Open `http://localhost:5173` in your browser. You'll see a bash-like terminal prompt at `/home/user $`.

## Validation Scenarios

### Scenario 1: Navigate the Default VFS (P1)

```bash
ls
# Expected: .almostermrc

ls /
# Expected: home  tmp  etc  bin  usr  var

cd /etc
pwd
# Expected: /etc

cat hostname
# Expected: almosterm-local
```

### Scenario 2: Create and Modify Files (P1)

```bash
mkdir /home/user/myproject
cd /home/user/myproject
touch README.md
echo "# My Project" > README.md
cat README.md
# Expected: # My Project

echo "## Section 2" >> README.md
cat README.md
# Expected:
# # My Project
# ## Section 2
```

### Scenario 3: File Operations (P1)

```bash
cp README.md README-backup.md
ls
# Expected: README.md  README-backup.md

mv README-backup.md ARCHIVE.md
ls
# Expected: README.md  ARCHIVE.md

rm ARCHIVE.md
ls
# Expected: README.md
```

### Scenario 4: Permission Errors (P1)

```bash
touch /etc/newfile
# Expected: touch: cannot touch '/etc/newfile': Permission denied
```

### Scenario 5: Node.js Script Execution (P2)

```bash
echo "console.log('Hello from almostnode')" > hello.js
node hello.js
# Expected: Hello from almostnode

node -e "console.log(1 + 1)"
# Expected: 2

node --version
# Expected: v22.21.1 (or current almostnode version)
```

### Scenario 6: Node.js Script with VFS Access (P2)

```bash
echo "const fs = require('fs'); fs.writeFileSync('output.txt', 'generated');" > generate.js
node generate.js
cat output.txt
# Expected: generated
```

### Scenario 7: Custom CLI Tool (P2)

```bash
# Register a simple echo tool
echo '#!/bin/bash
echo "Tool says: $@"' > /tmp/mytool.sh
chmod +x /tmp/mytool.sh

# In the browser terminal (or API):
tool-register mytool /tmp/mytool.sh "A test tool"

# Use it:
mytool hello world
# Expected: Tool says: hello world
```

### Scenario 8: Export and Import VFS (P3)

```bash
# Create some state
mkdir /home/user/export-test
echo "persistent data" > /home/user/export-test/data.txt

# Export
vfs-export
# Expected: Browser downloads a file like almosterm-vfs-2026-07-15.vfs.tar

# Import (via drag-drop or command)
vfs-import /path/to/almosterm-vfs-2026-07-15.vfs.tar
# Expected: VFS restored, data.txt exists with correct content
```

### Scenario 9: Command History and Tab Completion

```bash
# Type a few commands
ls
pwd
echo "testing"

# Press Up arrow twice
# Expected: command line shows "pwd"

# Tab completion
cd /h<tab>
# Expected: autocompletes to /home/
```

### Scenario 10: Ctrl+C Cancellation

```bash
# Start a long command:
node -e "setTimeout(() => {}, 30000)"
# Press Ctrl+C
# Expected: Command terminates, prompt returns within 1 second
```

### Scenario 11: Performance - Large Directory (SC-002, SC-006)

```bash
# Generate 1000 files
for i in $(seq 1 1000); do touch "file_$i.txt"; done

# List them
ls
# Expected: All 1000 files listed, operation completes in < 500ms
```

### Scenario 12: Cross-Browser Validation (SC-007 implied)

Repeat Scenario 1 in both Chrome and Firefox.
**Expected**: Terminal is usable and responsive in both browsers.

## Cleanup

```bash
# Stop the dev server (Ctrl+C in terminal)
# Clear IndexedDB storage (in browser DevTools → Application → IndexedDB → almosterm-vfs → Delete database)
```
