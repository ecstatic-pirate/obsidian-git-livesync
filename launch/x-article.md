# I Built a CLI Tool in One Session Because the "Official" Alternative Was Broken

I run an AI coding agent as my daily productivity system. Claude writes markdown files — daily goals, weekly plans, notes, memory — straight into a git repo. It's my second brain, maintained by an AI that commits and pushes dozens of times a day.

One problem: I wanted to read those files on my phone. In Obsidian. Instantly.

Not "open laptop, wait for sync, then check phone." Instantly. The AI pushes a file, my phone buzzes, the note is there.

Sounds simple. It wasn't.

## The gap

Obsidian has a sync plugin called Self-hosted LiveSync. It replicates your vault across devices through CouchDB. It's excellent — fast, reliable, self-hosted. But it has one requirement that breaks my setup: Obsidian has to be running to write to CouchDB.

My AI agent runs headless. There's no Obsidian desktop in the loop. It pushes markdown to git and moves on. So the files sit in the repo, invisible to my phone, until I open Obsidian on a laptop and let it catch up.

I searched for solutions. Obsidian Git plugin? Requires the desktop app running. iCloud/Dropbox sync? Unreliable with git repos, conflict-prone, and slow. A CouchDB bridge that speaks LiveSync's document format? Doesn't exist.

Or so I thought.

I checked the Obsidian forum. Found a thread with 59 upvotes from people asking for exactly this — headless Obsidian writers with no way to push to LiveSync. Zero solutions in the replies.

So I built one.

## The build

Five phases. One session. About 5.5 hours total.

Phase 1: Reverse-engineer the schema. I spun up CouchDB in Docker, connected LiveSync, and inspected the raw documents via the REST API. Turns out LiveSync stores files as two CouchDB documents — a metadata doc (file path, timestamps, chunk references) and a leaf doc (content, SHA-256 addressed). Not documented anywhere. I had to read the plugin source.

Phase 2: Build the bridge. A CouchDB REST client that speaks LiveSync's format. A filesystem watcher. A CLI with commander. Config loader. Git hook template. The whole pipeline: file changes on disk, tool reads them, writes CouchDB docs, LiveSync clients replicate automatically.

Phase 3: Test it. 12 end-to-end tests against a real CouchDB instance. 18 unit tests. Edge cases: file updates vs creates, deletions, subdirectory paths, YAML frontmatter preservation, wiki-links. All passing.

Phase 4: Package it. npm publish, 350-line README, docker-compose for CouchDB, MIT license. The goal was `npx obsidian-git-livesync sync --all` and you're done.

Phase 5: Code review gates after each phase. My AI agent reviewed its own output with a separate review prompt. Caught 11 issues — a hash algorithm that wasn't matching LiveSync's format, a byte-counting bug, a shell command injection vulnerability in the git hook, race conditions. All fixed before shipping.

The result: push a markdown file to git, run one command, it appears on your phone in seconds. No Obsidian desktop. No polling. No middleman.

## The "oh shit" moment

After publishing to npm, I did one more search. And found `livesync-bridge` by vrtmrz — the same person who built the LiveSync plugin.

The official author had already built a bridge tool.

My stomach dropped. Had I just spent a day building something that already existed?

I cloned the repo. Tried to install it.

It didn't work.

Here's what I found:

- It's Deno-only. Not on npm. You can't `npx` it. You need Deno installed, and it's pinned to Deno 1.x APIs that are broken on Deno 2.
- It's daemon-only. It runs as a background process watching a directory. No one-shot sync command. No git hook integration. No "sync these 3 files and exit."
- It has 25 open issues on GitHub. Installation failures, configuration problems, runtime crashes.
- The underlying `livesync-commonlib` library that handles the CouchDB format is also Deno-first and not installable via npm.

I almost didn't ship because this existed. The "official" tool, from the plugin author himself. Who am I to compete with that?

But then I actually tried to use it as a normal developer would. Clone, install, run. It failed at step two.

## The lesson

"Does this already exist?" is the wrong question.

The right question is: "Can a normal developer use it in 30 seconds?"

livesync-bridge exists. It's a real project with real code. But it's not usable by someone who just wants to solve the problem and move on. It requires a specific runtime most people don't have, it's broken on the current version of that runtime, and it doesn't support the most common use case (one-shot sync from a script or CI pipeline).

This happens constantly in open source. A solution "exists" in the sense that code has been written and pushed to GitHub. But it doesn't exist in the sense that matters — someone can install it, run it, and have their problem solved in under a minute.

The gap between "code exists on GitHub" and "a developer can use this" is where most tools die. And it's where the opportunity lives for anyone willing to do the boring work of packaging, testing, and documenting.

I didn't build a better algorithm. I didn't innovate on the protocol. I reverse-engineered the same CouchDB format and wrote it in TypeScript instead of Deno. The difference is: mine is on npm, runs with npx, has a one-shot sync command, works as a git hook, and has 12 E2E tests proving it actually works.

## Ship the boring version that works.

The interesting technical work was about 20% of the effort. The other 80% was: Docker Compose file for CouchDB setup. A setup script that configures CORS. A config file generator. Dry-run mode. Verbose logging. Error messages that tell you what's wrong. A README that gets you from zero to syncing in under 5 minutes.

None of that is impressive. All of it is necessary.

If you're writing markdown outside of Obsidian — from a server, a CI pipeline, an AI agent, vim on a VPS, whatever — and you want it on your phone without running Obsidian desktop:

```bash
npx obsidian-git-livesync sync --all
```

GitHub: https://github.com/ecstatic-pirate/obsidian-git-livesync

MIT licensed. Works today. 30 seconds to first sync.
