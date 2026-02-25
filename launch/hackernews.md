# Hacker News — Show HN

**Title:** Show HN: I built an npm alternative to livesync-bridge because the original was broken

**Body:**

I run an AI coding agent that writes markdown to git dozens of times a day — daily goals, notes, memory files. Wanted those files on my phone in Obsidian. Instantly, not "wait for desktop to sync."

Self-hosted LiveSync gets you most of the way — CouchDB replication across all devices. The problem: you can't write to CouchDB from outside Obsidian. There's no API. The plugin has to be running.

So I built a bridge. Reverse-engineered LiveSync's CouchDB document format from the plugin source, wrote a TypeScript CLI, published to npm. Push to git → run one command → files appear on your phone.

After publishing, I found `livesync-bridge` by the LiveSync plugin author. Cloned it. It didn't work:

- Deno-only. Not on npm. Can't npx it.
- Pinned to Deno 1.x APIs — broken on Deno 2.
- Daemon-only. No one-shot sync command. No git hook support.
- 25 open issues. Installation failures, runtime crashes.

The lesson I took away: "does this exist?" is the wrong question. "Can a normal dev use it in 30 seconds?" is the right one.

Mine ships as npm. One command:

```bash
npx obsidian-git-livesync sync --all
```

Docker Compose for CouchDB included. Post-receive git hook template included. 12 E2E tests against a real CouchDB instance.

GitHub: https://github.com/ecstatic-pirate/obsidian-git-livesync

Curious if others have hit this headless-Obsidian-writer problem. Would also welcome feedback on the CouchDB integration approach — we're writing to LiveSync's internal format, which is reverse-engineered and could change.
