# r/ObsidianMD post

**Title:** I built a CLI to sync files into Obsidian from a server, CI, or AI agent — no desktop required

**Body:**

If you've ever edited markdown on a server or run scripts that generate notes, you've hit this wall: there's no way to get those files into Obsidian without running Obsidian desktop somewhere as a relay.

Self-hosted LiveSync gets you 90% of the way — it syncs between devices via CouchDB. But it still needs Obsidian running to write new files into the network.

I reverse-engineered LiveSync's CouchDB document format and built a CLI that writes directly to the database. No Obsidian desktop needed on the server side.

**How it works:**

```
git push → post-receive hook → obsidian-git-livesync sync → CouchDB → all your devices
```

You can also run it in watch mode for real-time sync, or call it directly from any script.

**Setup is minimal:**
1. Run CouchDB (Docker Compose included)
2. `npx obsidian-git-livesync init`
3. Configure the Self-hosted LiveSync plugin to point at your CouchDB

**Use cases I had in mind:**
- AI agents writing notes directly to your vault
- Server-side markdown generation (daily digests, automated reports)
- CI pipelines that commit and sync docs in one step
- Any headless environment where you want Obsidian to receive files

**The caveat:** LiveSync's storage schema is internal and undocumented. This tool writes to it based on reading the plugin source. If LiveSync changes its format, this tool will need updating. That's a known risk.

GitHub: https://github.com/ecstatic-pirate/obsidian-git-livesync

Would love feedback from anyone running LiveSync — especially if you've tried to solve this problem a different way.
