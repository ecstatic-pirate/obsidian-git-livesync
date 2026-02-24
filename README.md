# obsidian-git-livesync

Bridge git pushes to Obsidian via CouchDB and the [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) plugin.

<!-- badges -->
[![npm version](https://img.shields.io/npm/v/obsidian-git-livesync)](https://www.npmjs.com/package/obsidian-git-livesync)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Problem

Obsidian's Self-hosted LiveSync plugin syncs notes between devices via CouchDB replication. But it only works when Obsidian is running. If you edit markdown files in a headless environment (CI, server, scripts, git hooks), there is no way to push those changes into the LiveSync network. Your phone and other devices never see the update.

There is no CLI bridge between git and LiveSync. This tool fills that gap.

## Solution

`obsidian-git-livesync` writes markdown files directly to CouchDB in LiveSync's document format, so all connected LiveSync clients replicate the changes instantly -- no Obsidian desktop needed.

## Architecture

```
git push --> post-receive hook
          --> obsidian-git-livesync sync
          --> reads changed .md files from disk
          --> writes to CouchDB (LiveSync document format)
          --> all LiveSync clients replicate via CouchDB
          <-- phone sees changes in seconds
```

---

## Quick Start

### 1. Start CouchDB

```bash
docker compose up -d
bash scripts/setup-couchdb.sh
```

### 2. Install and configure

```bash
npx obsidian-git-livesync init
# Edit .obsidian-git-livesync.json with your CouchDB credentials
```

### 3. Sync

```bash
# Sync all markdown files
npx obsidian-git-livesync sync --all

# Sync files changed in the last git commit
npx obsidian-git-livesync sync --git

# Sync specific files
npx obsidian-git-livesync sync notes/hello.md notes/world.md

# Watch for changes
npx obsidian-git-livesync watch .
```

---

## CLI Reference

### Global Options

| Flag | Description |
|------|-------------|
| `--version` | Show version number |
| `--config <path>` | Path to config file (default: `.obsidian-git-livesync.json`) |
| `--verbose` | Log each file as it syncs |
| `--dry-run` | Show what would be synced without writing to CouchDB |

### Commands

| Command | Description |
|---------|-------------|
| `sync [files...]` | Sync specific files to CouchDB |
| `sync --git` | Sync files changed in the last git commit |
| `sync --all` | Sync all files in the vault directory |
| `watch [dir]` | Watch a directory and sync changes in real time |
| `validate` | Test connection to CouchDB |
| `init` | Create a template config file |

### Sync Options

| Flag | Description | Default |
|------|-------------|---------|
| `--git` | Sync files from last git commit | - |
| `--all` | Sync entire vault directory | - |
| `--delete` | Delete files from CouchDB that no longer exist on disk | `false` |
| `--extensions <exts>` | Comma-separated file extensions | `.md` |
| `--debounce <ms>` | Debounce interval in milliseconds | `200` |

### Watch Options

| Flag | Description | Default |
|------|-------------|---------|
| `--extensions <exts>` | Comma-separated file extensions to watch | `.md` |
| `--debounce <ms>` | Debounce interval in milliseconds | `200` |

---

## Git Hook Setup

A `post-receive` hook is included for bare git repos. When you push to the repo, it automatically syncs changed markdown files to CouchDB.

### Installation

```bash
# Copy the hook to your bare repo
cp hooks/post-receive.sh /path/to/repo.git/hooks/post-receive
chmod +x /path/to/repo.git/hooks/post-receive
```

The hook:
- Only triggers on pushes to `main` or `master`
- Detects changed `.md` files between the old and new revisions
- Calls `npx obsidian-git-livesync sync` with those files
- Handles initial pushes (empty repo) correctly

To sync additional file types, edit the `EXTENSIONS` variable at the top of the hook script.

---

## Docker Compose

The included `docker-compose.yml` runs CouchDB 3 locally:

```yaml
services:
  couchdb:
    image: couchdb:3
    ports:
      - "5984:5984"
    environment:
      COUCHDB_USER: admin
      COUCHDB_PASSWORD: password
    volumes:
      - couchdb_data:/opt/couchdb/data
```

After starting the container, run `bash scripts/setup-couchdb.sh` to:
- Configure single-node cluster mode
- Create the `obsidian-livesync` database
- Enable CORS for Obsidian
- Set request and document size limits
- Require authenticated access

---

## Configuration

Configuration is loaded in this priority order: **environment variables > config file > defaults**.

### Config File

Created by `obsidian-git-livesync init` at `.obsidian-git-livesync.json`:

```json
{
  "couchdbUrl": "http://localhost:5984",
  "couchdbUser": "admin",
  "couchdbPassword": "password",
  "couchdbDatabase": "obsidian-livesync",
  "vaultRoot": ".",
  "extensions": [".md"],
  "debounce": 200
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `COUCHDB_URL` | CouchDB server URL | `http://localhost:5984` |
| `COUCHDB_USER` | CouchDB username | (required) |
| `COUCHDB_PASSWORD` | CouchDB password | (required) |
| `COUCHDB_DATABASE` | Database name | `obsidian-livesync` |
| `VAULT_ROOT` | Root directory for vault files | current directory |
| `PASSPHRASE` | Encryption passphrase (if LiveSync uses one) | (none) |

Environment variables override values in the config file.

---

## How It Works

Obsidian's Self-hosted LiveSync plugin stores files in CouchDB using a specific document format:

1. **Metadata document** (`_id` = file path, e.g. `notes/hello.md`)
   - `type`: `"plain"`
   - `children`: array of chunk IDs
   - `ctime`, `mtime`, `size`: file timestamps and size

2. **Leaf (chunk) document** (`_id` = `h:` + SHA-256 hash)
   - `type`: `"leaf"`
   - `data`: file content (plain text for text files)

This tool writes files in that exact format. When a file is synced:
- Content is hashed to produce a chunk ID (content-addressable)
- A leaf document is created (or reused if the same content already exists)
- A metadata document is created or updated with the leaf reference

Once written to CouchDB, all LiveSync clients connected to the same database replicate the change automatically via CouchDB's replication protocol.

**Note on livesync-commonlib:** The official `DirectFileManipulator` API lives in [vrtmrz/livesync-commonlib](https://github.com/vrtmrz/livesync-commonlib) but is Deno-first and not installable via npm. This project uses a direct CouchDB REST API client that speaks the same document format. See `src/couchdb-client.ts`.

---

## Limitations

- **Text files only.** Binary files (images, PDFs, etc.) are not synced. Only text-based extensions are supported (`.md`, `.txt`, `.canvas`, `.csv`, `.svg`, `.html`, `.css`, `.js`, `.xml`).
- **Requires CouchDB + LiveSync plugin.** You need a running CouchDB instance and Obsidian's Self-hosted LiveSync plugin configured to use it.
- **Schema coupling.** The document format is reverse-engineered from LiveSync's internal storage. If LiveSync changes its format in a future update, this tool may need corresponding updates.
- **No conflict resolution.** If the same file is edited both via this tool and via Obsidian simultaneously, CouchDB will create a conflict. LiveSync's conflict resolution in Obsidian will handle it, but the behavior depends on your LiveSync settings.
- **Single-chunk storage.** Currently stores each file as a single chunk. Very large files (>1MB) may benefit from multi-chunk splitting in the future, matching LiveSync's chunking behavior.

---

## License

[MIT](LICENSE)
