/**
 * File watcher: monitors vault directory and syncs changes to CouchDB.
 */

import { relative, extname } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { syncFiles, deleteFile } from "./sync.js";
import type { Config } from "./config.js";

const IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.obsidian/**",
  "**/.*",
];

/**
 * Watch a directory for file changes and sync to CouchDB.
 * Returns the chokidar watcher instance (for cleanup/testing).
 */
export function watchVault(config: Config): FSWatcher {
  const dir = config.vaultRoot;

  console.log(`[WATCH] Watching ${dir} for changes...`);
  console.log(`[WATCH] Extensions: ${config.extensions.join(", ")}`);
  console.log(`[WATCH] Debounce: ${config.debounce}ms`);
  if (config.dryRun) console.log("[WATCH] Dry-run mode — no changes will be synced");

  const pendingChanges = new Map<string, NodeJS.Timeout>();

  function debouncedSync(absPath: string): void {
    const relPath = relative(dir, absPath);
    const ext = extname(relPath);
    if (!config.extensions.includes(ext)) return;

    // Clear any pending debounce for this path
    const existing = pendingChanges.get(relPath);
    if (existing) clearTimeout(existing);

    const timeout = setTimeout(() => {
      pendingChanges.delete(relPath);
      console.log(`[WATCH] Detected change: ${relPath}`);
      syncFiles([relPath], config).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[WATCH ERROR] ${relPath}: ${message}`);
      });
    }, config.debounce);

    pendingChanges.set(relPath, timeout);
  }

  function debouncedDelete(absPath: string): void {
    const relPath = relative(dir, absPath);
    const ext = extname(relPath);
    if (!config.extensions.includes(ext)) return;

    const existing = pendingChanges.get(relPath);
    if (existing) clearTimeout(existing);

    const timeout = setTimeout(() => {
      pendingChanges.delete(relPath);
      console.log(`[WATCH] Detected delete: ${relPath}`);
      deleteFile(relPath, config).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[WATCH ERROR] ${relPath}: ${message}`);
      });
    }, config.debounce);

    pendingChanges.set(relPath, timeout);
  }

  const watcher = chokidar.watch(dir, {
    ignored: IGNORE_PATTERNS,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: config.debounce,
      pollInterval: 100,
    },
  });

  watcher
    .on("add", debouncedSync)
    .on("change", debouncedSync)
    .on("unlink", debouncedDelete)
    .on("error", (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[WATCH ERROR] ${message}`);
    })
    .on("ready", () => {
      console.log("[WATCH] Ready. Waiting for changes...");
    });

  return watcher;
}
