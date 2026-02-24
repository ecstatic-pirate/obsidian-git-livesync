#!/usr/bin/env node

/**
 * obsidian-git-livesync CLI
 * Bridge git pushes to Obsidian via CouchDB + Self-hosted LiveSync plugin.
 */

import { Command } from "commander";
import { loadConfig, validateConfig } from "./config.js";
import { syncFiles, syncGitChanges, syncAll } from "./sync.js";
import { watchVault } from "./watch.js";
import { CouchDBClient } from "./couchdb-client.js";

export { CouchDBClient } from "./couchdb-client.js";
export type {
  CouchDBClientOptions,
  LiveSyncDocument,
  LiveSyncLeaf,
} from "./couchdb-client.js";

const program = new Command();

program
  .name("obsidian-git-livesync")
  .description("Bridge git pushes to Obsidian via CouchDB + Self-hosted LiveSync")
  .version("0.1.0")
  .option("--config <path>", "path to config file")
  .option("--verbose", "verbose logging", false)
  .option("--dry-run", "show what would be synced without actually syncing", false);

program
  .command("sync [files...]")
  .description("Sync files to CouchDB")
  .option("--git", "sync files changed in the last git commit")
  .option("--all", "sync entire vault directory")
  .option("--delete", "delete files from CouchDB that no longer exist on disk")
  .option("--extensions <exts>", "comma-separated file extensions to sync", ".md")
  .option("--debounce <ms>", "debounce interval in ms", "200")
  .action(async (files: string[], opts: Record<string, unknown>) => {
    const globalOpts = program.opts();
    const debounce = parseInt(opts.debounce as string, 10);
    if (isNaN(debounce) || debounce < 0) {
      program.error("--debounce must be a non-negative integer");
    }
    const config = loadConfig({
      configPath: globalOpts.config as string | undefined,
      verbose: globalOpts.verbose as boolean,
      dryRun: globalOpts.dryRun as boolean,
      extensions: (opts.extensions as string).split(",").map((e: string) => e.trim()),
      debounce,
    });

    const errors = validateConfig(config);
    if (errors.length > 0) {
      console.error("Configuration errors:");
      for (const e of errors) console.error(`  - ${e}`);
      process.exit(1);
    }

    let result;
    if (opts.git) {
      result = await syncGitChanges(config);
    } else if (opts.all) {
      result = await syncAll(config);
    } else if (files.length > 0) {
      result = await syncFiles(files, config, { delete: opts.delete as boolean });
    } else {
      console.error("Specify files, --git, or --all");
      process.exit(1);
    }

    const total = result.synced.length + result.deleted.length;
    const errCount = result.errors.length;
    console.log(`\nDone: ${total} files processed, ${errCount} errors`);

    if (errCount > 0) process.exit(1);
  });

program
  .command("watch [dir]")
  .description("Watch directory for changes and sync to CouchDB")
  .option("--extensions <exts>", "comma-separated file extensions to watch", ".md")
  .option("--debounce <ms>", "debounce interval in ms", "200")
  .action((dir: string | undefined, opts: Record<string, unknown>) => {
    const globalOpts = program.opts();
    const debounce = parseInt(opts.debounce as string, 10);
    if (isNaN(debounce) || debounce < 0) {
      program.error("--debounce must be a non-negative integer");
    }
    const config = loadConfig({
      configPath: globalOpts.config as string | undefined,
      verbose: globalOpts.verbose as boolean,
      dryRun: globalOpts.dryRun as boolean,
      extensions: (opts.extensions as string).split(",").map((e: string) => e.trim()),
      debounce,
    });

    if (dir) config.vaultRoot = dir;

    const errors = validateConfig(config);
    if (errors.length > 0) {
      console.error("Configuration errors:");
      for (const e of errors) console.error(`  - ${e}`);
      process.exit(1);
    }

    const watcher = watchVault(config);

    // Graceful shutdown
    const cleanup = () => {
      console.log("\n[WATCH] Shutting down...");
      watcher.close().then(() => process.exit(0));
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  });

program
  .command("validate")
  .description("Validate connection to CouchDB")
  .action(async () => {
    const globalOpts = program.opts();
    const config = loadConfig({
      configPath: globalOpts.config as string | undefined,
      verbose: globalOpts.verbose as boolean,
    });

    const errors = validateConfig(config);
    if (errors.length > 0) {
      console.error("Configuration errors:");
      for (const e of errors) console.error(`  - ${e}`);
      process.exit(1);
    }

    const client = new CouchDBClient({
      url: config.couchdbUrl,
      database: config.couchdbDatabase,
      username: config.couchdbUser,
      password: config.couchdbPassword,
    });

    try {
      const ok = await client.ping();
      if (ok) {
        console.log(`[OK] Connected to ${config.couchdbUrl}/${config.couchdbDatabase}`);

        const docs = await client.allDocs();
        console.log(`[OK] Database has ${docs.total_rows} documents`);
      } else {
        console.error(`[FAIL] Could not connect to ${config.couchdbUrl}/${config.couchdbDatabase}`);
        process.exit(1);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[FAIL] ${message}`);
      process.exit(1);
    }
  });

program
  .command("init")
  .description("Create a config file interactively")
  .action(async () => {
    // Minimal non-interactive init that writes a template config
    const { writeFileSync, existsSync } = await import("node:fs");
    const configPath = ".obsidian-git-livesync.json";

    if (existsSync(configPath)) {
      console.error(`[SKIP] ${configPath} already exists`);
      process.exit(1);
    }

    const template = {
      couchdbUrl: "http://localhost:5984",
      couchdbUser: "",
      couchdbPassword: "",
      couchdbDatabase: "obsidian-livesync",
      vaultRoot: ".",
      extensions: [".md"],
      debounce: 200,
    };

    writeFileSync(configPath, JSON.stringify(template, null, 2) + "\n");
    console.log(`[OK] Created ${configPath}`);
    console.log("Edit the file and fill in couchdbUser and couchdbPassword.");
  });

program.parse();
