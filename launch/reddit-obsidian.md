# r/ObsidianMD post

**Title:** I built a CLI to sync markdown to Obsidian from headless environments (git hooks, CI, AI agents) — no desktop needed

**Body:**

If you write markdown outside of Obsidian — from a server, a CI pipeline, an AI agent — you've hit this wall: there's no way to get those files into Obsidian without running the desktop app somewhere as a relay.

Self-hosted LiveSync gets you 90% of the way. CouchDB replication, all your devices stay in sync, no cloud vendor. But it still requires Obsidian to be running to write new content into the network.

I reverse-engineered LiveSync's CouchDB document format from the plugin source and built a CLI that writes directly to the database. No Obsidian desktop required on the sending side.

**Quick start:**

```bash
# 1. Start CouchDB (Docker Compose included in the repo)
docker-compose up -d

# 2. Initialize config
npx obsidian-git-livesync init

# 3. Sync your vault
npx obsidian-git-livesync sync --all
```

Then configure the Self-hosted LiveSync plugin to point at your CouchDB — same as normal LiveSync setup.

**For git hook integration:**

```bash
# Add to your .git/hooks/post-receive
npx obsidian-git-livesync sync --all
```

Push to git → files appear on all your Obsidian clients in seconds.

**Why not livesync-bridge?**

`livesync-bridge` exists — it's by vrtmrz, the same person who built the LiveSync plugin. But it's Deno-only (not on npm, broken on Deno 2), daemon-only (no one-shot sync for scripts or git hooks), and has 25 open GitHub issues. If you just want to solve the problem and move on, it's not usable today.

This tool is on npm, runs with npx, has a one-shot sync command, and works as a git hook. 12 E2E tests against a real CouchDB instance.

**Honest caveat:** LiveSync's storage format is internal and undocumented. This is reverse-engineered from the plugin source. It works against the current format but could break if LiveSync changes its schema in a future release. That's a known risk.

GitHub: https://github.com/ecstatic-pirate/obsidian-git-livesync

Would love feedback from anyone running LiveSync in production — especially if you've solved the headless-writer problem a different way.
