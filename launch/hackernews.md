# Hacker News — Show HN

**Title:** Show HN: Sync files to Obsidian from any headless environment via git

**Body:**

I built a CLI tool that bridges git pushes to Obsidian via CouchDB + the Self-hosted LiveSync plugin.

The problem: If you write markdown from a VPS, CI pipeline, or AI agent, there's no way to get those files into Obsidian on your phone without running Obsidian desktop as an intermediary.

The solution: obsidian-git-livesync writes directly to CouchDB in LiveSync's document format. Push to git → files appear on all your Obsidian clients in seconds.

Architecture: git push → post-receive hook → reads .md files → writes to CouchDB → LiveSync replicates to all clients

Tech stack: TypeScript, CouchDB REST API, chokidar (file watching), commander (CLI)

GitHub: https://github.com/ecstatic-pirate/obsidian-git-livesync

Looking for feedback on the approach. The main risk is that LiveSync's CouchDB schema is internal — we're writing to it directly based on reverse-engineering the plugin source.
