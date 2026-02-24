# obsidian-git-livesync

Bridge git pushes to Obsidian via CouchDB and the Self-hosted LiveSync plugin.

## Quick start

```bash
# Start CouchDB
docker compose up -d

# Configure CouchDB for LiveSync
npm run setup-db

# Run validation (requires CouchDB running)
npm run validate
```

## Architecture

This tool writes files directly to CouchDB in the Self-hosted LiveSync document format
(chunked documents with leaf nodes). Obsidian's LiveSync plugin picks up changes via
CouchDB replication.

**Note on livesync-commonlib:** The official `DirectFileManipulator` API lives in
[vrtmrz/livesync-commonlib](https://github.com/vrtmrz/livesync-commonlib) but is
Deno-first and not installable via npm. This project uses a direct CouchDB REST API
client that speaks the same document format. See `src/couchdb-client.ts`.
