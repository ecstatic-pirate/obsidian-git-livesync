# r/selfhosted post

**Title:** Self-hosted Obsidian sync from git — Node.js CLI that writes to CouchDB in LiveSync format

**Body:**

If you use Obsidian with the Self-hosted LiveSync plugin, your notes sync between devices through CouchDB. No cloud, no Obsidian Sync subscription, full control.

The gap: you can't write to that CouchDB from outside Obsidian. There's no external API. Only the app itself can push files into the LiveSync network.

I built a Node.js CLI that solves this by writing directly to CouchDB in LiveSync's document format. Any process on any server — git hook, cron, AI agent, CI pipeline — can push files into your Obsidian vault.

**Stack:**
- Node.js / TypeScript, ships as npm package — `npx obsidian-git-livesync` with no install required
- Direct CouchDB REST API — no Obsidian, no Electron, nothing running on the server side
- Docker Compose for CouchDB if you don't have one running
- Post-receive git hook template included

**What you need:**
- CouchDB instance (Docker Compose file in the repo, or bring your own)
- Self-hosted LiveSync plugin on your Obsidian clients
- Node 18+ on the server side

Zero cloud dependencies. Runs entirely on your own infrastructure.

**vs livesync-bridge (the Deno version):**

`livesync-bridge` is by vrtmrz — the same author as the LiveSync plugin. Functionally similar goal. But:

| | livesync-bridge | this tool |
|---|---|---|
| Runtime | Deno (broken on v2) | Node.js |
| Install | Not on npm | `npx obsidian-git-livesync` |
| Mode | Daemon only | CLI + daemon |
| One-shot sync | No | Yes (`sync --all`) |
| Git hook support | No | Yes (template included) |
| Open issues | 25 | — |

If you already have Deno and it works for you, use that. If you want something that installs in 30 seconds on any machine with Node, use this.

**Honest caveat:** LiveSync's CouchDB schema is internal and not a public API. This is reverse-engineered from the plugin source. It works against the current format but could break if LiveSync changes its storage schema.

GitHub + Docker Compose + setup docs: https://github.com/ecstatic-pirate/obsidian-git-livesync

Happy to answer questions about the CouchDB integration or how the LiveSync document format works under the hood.
