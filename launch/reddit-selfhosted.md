# r/selfhosted post

**Title:** CLI tool to write files directly into Obsidian LiveSync (CouchDB) from any headless environment

**Body:**

If you run Obsidian with the Self-hosted LiveSync plugin, your notes sync between devices via CouchDB replication. No cloud, no vendor lock-in.

The gap: you can't write into that CouchDB from outside Obsidian. There's no API. The only way to add files to the LiveSync network is through the Obsidian app itself.

I built a CLI that solves this by writing directly to CouchDB in LiveSync's internal document format. The result: any process on any server can push files into your Obsidian vault in real time.

**Stack:**
- TypeScript CLI (ships as npm package, no install required via npx)
- Direct CouchDB REST API (no Obsidian, no Electron, no plugin required server-side)
- Docker Compose for CouchDB if you don't have one running already
- Post-receive git hook included for the git push → sync workflow

**Infrastructure you need:**
- CouchDB instance (Docker Compose file included, or bring your own)
- Self-hosted LiveSync plugin on your Obsidian clients
- Node 18+ on the server side

**Zero cloud dependencies.** Everything runs on your own infrastructure.

**The honest caveat:** LiveSync's CouchDB schema is not a public API. This tool is reverse-engineered from the plugin source code. It works against the current LiveSync format but could break if the plugin changes its storage schema in a future release.

GitHub + Docker Compose + setup script: https://github.com/ecstatic-pirate/obsidian-git-livesync

Happy to answer questions about the CouchDB integration or the LiveSync document format.
