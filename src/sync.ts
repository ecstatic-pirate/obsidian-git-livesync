/**
 * Core sync logic: push files from disk to CouchDB in LiveSync format.
 */

import { readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { resolve, relative, extname } from "node:path";
import { execSync } from "node:child_process";
import { CouchDBClient } from "./couchdb-client.js";
import type { Config } from "./config.js";

export interface SyncResult {
  synced: string[];
  deleted: string[];
  errors: Array<{ path: string; error: string }>;
}

function log(message: string, verbose: boolean): void {
  if (verbose) console.error(message);
}

function clientFromConfig(config: Config): CouchDBClient {
  return new CouchDBClient({
    url: config.couchdbUrl,
    database: config.couchdbDatabase,
    username: config.couchdbUser,
    password: config.couchdbPassword,
  });
}

/**
 * Sync specific files (relative to vaultRoot) to CouchDB.
 */
export async function syncFiles(
  paths: string[],
  config: Config,
  options: { delete?: boolean } = {}
): Promise<SyncResult> {
  const client = clientFromConfig(config);
  const result: SyncResult = { synced: [], deleted: [], errors: [] };

  for (const filePath of paths) {
    const absPath = resolve(config.vaultRoot, filePath);

    try {
      if (!existsSync(absPath)) {
        if (options.delete) {
          if (config.dryRun) {
            console.log(`[DRY-RUN] Would delete: ${filePath}`);
            result.deleted.push(filePath);
            continue;
          }

          // Need the _rev to delete
          const existing = await client.get(filePath);
          if (existing && typeof existing === "object" && "_rev" in existing) {
            await client.delete(filePath, existing._rev as string);
            console.log(`[DELETED] ${filePath}`);
            result.deleted.push(filePath);
          } else {
            log(`[SKIP] ${filePath} — not found in CouchDB`, config.verbose);
          }
        } else {
          log(`[SKIP] ${filePath} — file not found on disk`, config.verbose);
        }
        continue;
      }

      const stat = statSync(absPath);
      const content = readFileSync(absPath, "utf-8");

      if (config.dryRun) {
        console.log(`[DRY-RUN] Would sync: ${filePath} (${stat.size} bytes)`);
        result.synced.push(filePath);
        continue;
      }

      await client.writeFile(filePath, content, {
        ctime: stat.ctimeMs,
        mtime: stat.mtimeMs,
      });

      console.log(`[SYNCED] ${filePath}`);
      result.synced.push(filePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ERROR] ${filePath}: ${message}`);
      result.errors.push({ path: filePath, error: message });
    }
  }

  return result;
}

/**
 * Delete a single file from CouchDB.
 */
export async function deleteFile(
  filePath: string,
  config: Config
): Promise<boolean> {
  const client = clientFromConfig(config);

  try {
    if (config.dryRun) {
      console.log(`[DRY-RUN] Would delete: ${filePath}`);
      return true;
    }

    const existing = await client.get(filePath);
    if (existing && typeof existing === "object" && "_rev" in existing) {
      await client.delete(filePath, existing._rev as string);
      console.log(`[DELETED] ${filePath}`);
      return true;
    }

    console.log(`[SKIP] ${filePath} — not found in CouchDB`);
    return false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] ${filePath}: ${message}`);
    return false;
  }
}

/**
 * Sync files changed in the last git commit.
 */
export async function syncGitChanges(config: Config): Promise<SyncResult> {
  const result: SyncResult = { synced: [], deleted: [], errors: [] };

  let diffOutput: string;
  try {
    diffOutput = execSync("git diff --name-status HEAD~1 HEAD", {
      cwd: config.vaultRoot,
      encoding: "utf-8",
    }).trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] Failed to get git diff: ${message}`);
    return result;
  }

  if (!diffOutput) {
    console.log("[INFO] No changes in last git commit");
    return result;
  }

  const added: string[] = [];
  const deleted: string[] = [];

  for (const line of diffOutput.split("\n")) {
    const match = line.match(/^([AMDRC])\t(.+)$/);
    if (!match) continue;

    const [, status, filePath] = match;
    const ext = extname(filePath);
    if (!config.extensions.includes(ext)) continue;

    if (status === "D") {
      deleted.push(filePath);
    } else {
      added.push(filePath);
    }
  }

  log(`[GIT] ${added.length} added/modified, ${deleted.length} deleted`, config.verbose);

  if (added.length > 0) {
    const addResult = await syncFiles(added, config);
    result.synced.push(...addResult.synced);
    result.errors.push(...addResult.errors);
  }

  if (deleted.length > 0) {
    const delResult = await syncFiles(deleted, config, { delete: true });
    result.deleted.push(...delResult.deleted);
    result.errors.push(...delResult.errors);
  }

  return result;
}

/**
 * Recursively collect all files under a directory matching the configured extensions.
 */
function collectFiles(dir: string, rootDir: string, extensions: string[]): string[] {
  const files: string[] = [];
  const ignorePatterns = [".git", ".obsidian", "node_modules"];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && ignorePatterns.includes(entry.name)) continue;

    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignorePatterns.includes(entry.name)) continue;
      files.push(...collectFiles(fullPath, rootDir, extensions));
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (extensions.includes(ext)) {
        files.push(relative(rootDir, fullPath));
      }
    }
  }

  return files;
}

/**
 * Sync all files in the vault directory.
 */
export async function syncAll(config: Config): Promise<SyncResult> {
  const files = collectFiles(config.vaultRoot, config.vaultRoot, config.extensions);
  console.log(`[INFO] Found ${files.length} files to sync`);
  return syncFiles(files, config);
}
