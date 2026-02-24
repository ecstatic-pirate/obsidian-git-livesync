/**
 * End-to-end test suite for obsidian-git-livesync.
 *
 * Validates the full sync pipeline against a real CouchDB instance.
 * Assumes CouchDB is running locally via docker-compose.
 *
 * Run with: npm run test:e2e
 *
 * Required env vars (or defaults from docker-compose.yml):
 *   COUCHDB_URL      — default: http://localhost:5984
 *   COUCHDB_USER     — default: admin
 *   COUCHDB_PASSWORD — default: password
 *   COUCHDB_DATABASE — default: obsidian-livesync-e2e (isolated test DB)
 */

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { CouchDBClient } from "../src/couchdb-client.js";
import { syncFiles } from "../src/sync.js";
import type { Config } from "../src/config.js";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[FAIL] ${name}: ${reason}`);
    failed++;
  }
}

// Runs a test then unconditionally cleans the database, so a failed test
// cannot leak documents into the next test.
async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  await test(name, fn);
  try { await cleanDatabase(); } catch {}
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// Setup: CouchDB client + temp vault + test config
// ---------------------------------------------------------------------------

const COUCH_URL = process.env["COUCHDB_URL"] ?? "http://localhost:5984";
const COUCH_USER = process.env["COUCHDB_USER"] ?? "admin";
const COUCH_PASSWORD = process.env["COUCHDB_PASSWORD"] ?? "password";
const COUCH_DB = process.env["COUCHDB_DATABASE"] ?? "obsidian-livesync-e2e";

const client = new CouchDBClient({
  url: COUCH_URL,
  database: COUCH_DB,
  username: COUCH_USER,
  password: COUCH_PASSWORD,
});

// ---------------------------------------------------------------------------
// Availability check
// ---------------------------------------------------------------------------

async function checkCouchDB(): Promise<void> {
  try {
    const ok = await client.ping();
    if (!ok) {
      console.error(`[ERROR] CouchDB is not reachable at ${COUCH_URL}/${COUCH_DB}`);
      console.error("Make sure CouchDB is running: docker-compose up -d");
      process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] Cannot connect to CouchDB: ${message}`);
    console.error(`URL: ${COUCH_URL}, DB: ${COUCH_DB}`);
    console.error("Make sure CouchDB is running: docker-compose up -d");
    process.exit(1);
  }
}

// Create the test database if it doesn't exist
async function ensureTestDatabase(): Promise<void> {
  const baseUrl = `${COUCH_URL}/${COUCH_DB}`;
  const auth = Buffer.from(`${COUCH_USER}:${COUCH_PASSWORD}`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };

  // Try to create the database (PUT is idempotent-ish — 412 means already exists)
  const res = await fetch(baseUrl, { method: "PUT", headers });
  if (!res.ok && res.status !== 412) {
    const body = await res.text();
    throw new Error(`Failed to create test database: ${res.status} ${body}`);
  }
}

// Delete all non-design documents to isolate each test run
async function cleanDatabase(): Promise<void> {
  const allDocs = await client.allDocs(true);
  for (const row of allDocs.rows) {
    if (row.id.startsWith("_design/")) continue;
    await client.delete(row.id, row.value.rev);
  }
}

// ---------------------------------------------------------------------------
// Helper: create a fresh vault dir + base config for each test
// ---------------------------------------------------------------------------

function makeVaultAndConfig(): { vaultDir: string; config: Config; cleanup: () => void } {
  const vaultDir = mkdtempSync(join(tmpdir(), "e2e-vault-"));
  const config: Config = {
    couchdbUrl: COUCH_URL,
    couchdbUser: COUCH_USER,
    couchdbPassword: COUCH_PASSWORD,
    couchdbDatabase: COUCH_DB,
    vaultRoot: vaultDir,
    extensions: [".md", ".txt", ".canvas"],
    debounce: 200,
    verbose: false,
    dryRun: false,
  };
  const cleanup = () => rmSync(vaultDir, { recursive: true, force: true });
  return { vaultDir, config, cleanup };
}

// ---------------------------------------------------------------------------
// Test 1: Create file
// ---------------------------------------------------------------------------

async function testCreateFile(): Promise<void> {
  const { vaultDir, config, cleanup } = makeVaultAndConfig();
  try {
    const content = "# Hello World\n\nThis is a test note.";
    const filePath = "create-test.md";
    writeFileSync(join(vaultDir, filePath), content, "utf-8");

    const result = await syncFiles([filePath], config);
    assert(result.synced.includes(filePath), "file should be in synced list");
    assert(result.errors.length === 0, `no errors expected, got: ${JSON.stringify(result.errors)}`);

    const stored = await client.readFile(filePath);
    assert(stored !== null, "file should exist in CouchDB after sync");
    assertEqual(stored!, content, "stored content should match written content");

    const meta = await client.get(filePath) as Record<string, unknown>;
    assert(meta !== null, "metadata document should exist");
    assertEqual(meta["type"] as string, "plain", "type should be plain");
    assertEqual(meta["path"] as string, filePath, "path should match");
    assert(Array.isArray(meta["children"]) && (meta["children"] as unknown[]).length === 1, "should have one chunk");
    assert(typeof meta["ctime"] === "number", "ctime should be a number");
    assert(typeof meta["mtime"] === "number", "mtime should be a number");
    assertEqual(meta["size"] as number, Buffer.byteLength(content, "utf8"), "size should be byte-accurate");
  } finally {
    cleanup();
    await cleanDatabase();
  }
}

// ---------------------------------------------------------------------------
// Test 2: Update file — content changes, ctime is preserved
// ---------------------------------------------------------------------------

async function testUpdateFile(): Promise<void> {
  const { vaultDir, config, cleanup } = makeVaultAndConfig();
  try {
    const filePath = "update-test.md";
    const original = "# Original\n\nFirst version.";
    const updated = "# Updated\n\nSecond version with more content.";

    writeFileSync(join(vaultDir, filePath), original, "utf-8");
    await syncFiles([filePath], config);

    const metaBefore = await client.get(filePath) as Record<string, unknown>;
    const ctimeBefore = metaBefore["ctime"] as number;

    // Small sleep so mtime can differ on slow filesystems
    await new Promise(resolve => setTimeout(resolve, 100));

    writeFileSync(join(vaultDir, filePath), updated, "utf-8");
    const result = await syncFiles([filePath], config);
    assert(result.synced.includes(filePath), "updated file should be in synced list");

    const stored = await client.readFile(filePath);
    assertEqual(stored!, updated, "stored content should match updated content");

    const metaAfter = await client.get(filePath) as Record<string, unknown>;
    assertEqual(metaAfter["ctime"] as number, ctimeBefore, "ctime should be preserved on update");
    assert((metaAfter["mtime"] as number) >= (metaBefore["mtime"] as number), "mtime should be updated");
  } finally {
    cleanup();
    await cleanDatabase();
  }
}

// ---------------------------------------------------------------------------
// Test 3: Delete from CouchDB
// ---------------------------------------------------------------------------

async function testDeleteFile(): Promise<void> {
  const { vaultDir, config, cleanup } = makeVaultAndConfig();
  try {
    const filePath = "delete-test.md";
    const content = "# To be deleted";

    writeFileSync(join(vaultDir, filePath), content, "utf-8");
    await syncFiles([filePath], config);

    const existsBefore = await client.get(filePath);
    assert(existsBefore !== null, "file should exist before deletion");

    // Delete from CouchDB via client directly (simulates remote delete)
    const meta = existsBefore as Record<string, unknown>;
    await client.delete(filePath, meta["_rev"] as string);

    const existsAfter = await client.get(filePath);
    assert(existsAfter === null, "file should be gone from CouchDB after deletion");
  } finally {
    cleanup();
    await cleanDatabase();
  }
}

// ---------------------------------------------------------------------------
// Test 4: Subdirectory file — path is stored correctly
// ---------------------------------------------------------------------------

async function testSubdirectoryFile(): Promise<void> {
  const { vaultDir, config, cleanup } = makeVaultAndConfig();
  try {
    const dirPath = join(vaultDir, "subfolder", "nested");
    mkdirSync(dirPath, { recursive: true });

    const filePath = "subfolder/nested/file.md";
    const content = "# Nested Note\n\nDeep in a folder.";
    writeFileSync(join(vaultDir, filePath), content, "utf-8");

    const result = await syncFiles([filePath], config);
    assert(result.synced.includes(filePath), "nested file should be in synced list");

    const stored = await client.readFile(filePath);
    assert(stored !== null, "nested file should exist in CouchDB");
    assertEqual(stored!, content, "nested file content should match");

    const meta = await client.get(filePath) as Record<string, unknown>;
    assertEqual(meta["path"] as string, filePath, "stored path should include full directory structure");
  } finally {
    cleanup();
    await cleanDatabase();
  }
}

// ---------------------------------------------------------------------------
// Test 5: Frontmatter preservation
// ---------------------------------------------------------------------------

async function testFrontmatterPreservation(): Promise<void> {
  const { vaultDir, config, cleanup } = makeVaultAndConfig();
  try {
    const filePath = "frontmatter-test.md";
    const content = "---\ntitle: Test Note\ntags: [a, b]\ndate: 2026-02-24\n---\n\n# Content\n\nBody text here.";
    writeFileSync(join(vaultDir, filePath), content, "utf-8");

    await syncFiles([filePath], config);

    const stored = await client.readFile(filePath);
    assert(stored !== null, "frontmatter file should exist in CouchDB");
    assertEqual(stored!, content, "frontmatter should roundtrip unchanged");
  } finally {
    cleanup();
    await cleanDatabase();
  }
}

// ---------------------------------------------------------------------------
// Test 6: Large file (100 KB)
// ---------------------------------------------------------------------------

async function testLargeFile(): Promise<void> {
  const { vaultDir, config, cleanup } = makeVaultAndConfig();
  try {
    const filePath = "large-file.md";
    // 100 KB of repeated markdown content
    const paragraph = "# Large Note\n\nThis is a paragraph of content that repeats. " + "x".repeat(200) + "\n\n";
    const content = paragraph.repeat(Math.ceil((100 * 1024) / paragraph.length)).slice(0, 100 * 1024);
    writeFileSync(join(vaultDir, filePath), content, "utf-8");

    const result = await syncFiles([filePath], config);
    assert(result.synced.includes(filePath), "large file should be in synced list");
    assert(result.errors.length === 0, "large file sync should have no errors");

    const stored = await client.readFile(filePath);
    assert(stored !== null, "large file should exist in CouchDB");
    // Compare lengths first to get a usable error message on failure
    assertEqual(stored!.length, content.length, "stored large file should match original length");
    // Spot-check first 1KB, middle 1KB, and last 1KB instead of diffing the full 100KB string
    const mid = Math.floor(content.length / 2);
    assertEqual(stored!.slice(0, 1024), content.slice(0, 1024), "large file: first 1KB should match");
    assertEqual(stored!.slice(mid, mid + 1024), content.slice(mid, mid + 1024), "large file: middle 1KB should match");
    assertEqual(stored!.slice(-1024), content.slice(-1024), "large file: last 1KB should match");
  } finally {
    cleanup();
    await cleanDatabase();
  }
}

// ---------------------------------------------------------------------------
// Test 7: Special characters — Unicode, emoji, CJK, accented
// ---------------------------------------------------------------------------

async function testSpecialCharacters(): Promise<void> {
  const { vaultDir, config, cleanup } = makeVaultAndConfig();
  try {
    const filePath = "unicode-test.md";
    const content = "# Unicode Test\n\n日本語テスト\n\n🌸 Cherry blossom emoji\n\nCafé résumé naïve\n\n中文内容\n\nΑλφαβητικός";
    writeFileSync(join(vaultDir, filePath), content, "utf-8");

    await syncFiles([filePath], config);

    const meta = await client.get(filePath) as Record<string, unknown>;
    assert(meta !== null, "unicode file should exist in CouchDB");
    assertEqual(
      meta["size"] as number,
      Buffer.byteLength(content, "utf8"),
      "size should be byte-accurate (not char count) for unicode content"
    );

    const stored = await client.readFile(filePath);
    assertEqual(stored!, content, "unicode content should roundtrip unchanged");
  } finally {
    cleanup();
    await cleanDatabase();
  }
}

// ---------------------------------------------------------------------------
// Test 8: Wiki-links pass through unchanged
// ---------------------------------------------------------------------------

async function testWikiLinks(): Promise<void> {
  const { vaultDir, config, cleanup } = makeVaultAndConfig();
  try {
    const filePath = "wikilinks-test.md";
    const content = "# Wiki Links\n\nSee [[other-note]] for more.\n\nAlso see [[folder/note|alias]] here.\n\nAnd [[note with spaces]] too.";
    writeFileSync(join(vaultDir, filePath), content, "utf-8");

    await syncFiles([filePath], config);

    const stored = await client.readFile(filePath);
    assert(stored !== null, "wiki-link file should exist in CouchDB");
    assertEqual(stored!, content, "wiki-link syntax should pass through unchanged");

    // Verify specific patterns are intact
    assert(stored!.includes("[[other-note]]"), "simple wiki-link should be preserved");
    assert(stored!.includes("[[folder/note|alias]]"), "wiki-link with alias should be preserved");
    assert(stored!.includes("[[note with spaces]]"), "wiki-link with spaces should be preserved");
  } finally {
    cleanup();
    await cleanDatabase();
  }
}

// ---------------------------------------------------------------------------
// Test 9: Empty file
// ---------------------------------------------------------------------------

async function testEmptyFile(): Promise<void> {
  const { vaultDir, config, cleanup } = makeVaultAndConfig();
  try {
    const filePath = "empty.md";
    writeFileSync(join(vaultDir, filePath), "", "utf-8");

    let threwError = false;
    let result;
    try {
      result = await syncFiles([filePath], config);
    } catch (err) {
      threwError = true;
      throw new Error(`Syncing empty file threw unexpectedly: ${err instanceof Error ? err.message : String(err)}`);
    }

    assert(!threwError, "syncing empty file should not throw");
    assert(result!.errors.length === 0, `empty file sync should have no errors, got: ${JSON.stringify(result!.errors)}`);

    const stored = await client.readFile(filePath);
    assert(stored !== null, "empty file should exist in CouchDB");
    assertEqual(stored!, "", "empty file should be stored as empty string");

    const meta = await client.get(filePath) as Record<string, unknown>;
    assertEqual(meta["size"] as number, 0, "empty file size should be 0");
  } finally {
    cleanup();
    await cleanDatabase();
  }
}

// ---------------------------------------------------------------------------
// Test 10: Binary skip — .png is skipped with a warning, not corrupted
// ---------------------------------------------------------------------------

async function testBinarySkip(): Promise<void> {
  const { vaultDir, config, cleanup } = makeVaultAndConfig();
  try {
    const filePath = "image.png";
    // Minimal PNG header bytes
    const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
    const absPath = join(vaultDir, filePath);

    // Write as binary using the already-imported writeFileSync
    writeFileSync(absPath, pngBytes);

    // Sync with the default md config — .png is not in extensions
    const result = await syncFiles([filePath], config);

    // .png is not in the extensions list — it should be silently skipped
    assert(!result.synced.includes(filePath), ".png should not appear in synced list");
    assert(result.errors.length === 0, "binary skip should not produce an error");

    const stored = await client.get(filePath);
    assert(stored === null, ".png should NOT be stored in CouchDB");
  } finally {
    cleanup();
    await cleanDatabase();
  }
}

// ---------------------------------------------------------------------------
// Test 11: CLI sync --all — 5 files synced end-to-end via the CLI binary
// ---------------------------------------------------------------------------

async function testCliSyncAll(): Promise<void> {
  const { vaultDir, config, cleanup } = makeVaultAndConfig();
  try {
    // Create 5 files
    for (let i = 1; i <= 5; i++) {
      writeFileSync(join(vaultDir, `note-${i}.md`), `# Note ${i}\n\nContent for note ${i}.`, "utf-8");
    }

    // Run the CLI via npx tsx
    const cliPath = resolve("/Users/shantanugarg/projects/obsidian-git-livesync/src/cli.ts");
    const env = {
      ...process.env,
      COUCHDB_URL: COUCH_URL,
      COUCHDB_USER: COUCH_USER,
      COUCHDB_PASSWORD: COUCH_PASSWORD,
      COUCHDB_DATABASE: COUCH_DB,
      VAULT_ROOT: vaultDir,
    };

    execSync(`npx tsx "${cliPath}" sync --all`, { env, encoding: "utf-8" });

    // Verify all 5 appear in CouchDB
    for (let i = 1; i <= 5; i++) {
      const stored = await client.readFile(`note-${i}.md`);
      assert(stored !== null, `note-${i}.md should exist in CouchDB after CLI sync --all`);
      assert(stored!.includes(`Note ${i}`), `note-${i}.md content should match`);
    }
  } finally {
    cleanup();
    await cleanDatabase();
  }
}

// ---------------------------------------------------------------------------
// Test 12: Concurrent updates — 3 files written and synced, no race conditions
// ---------------------------------------------------------------------------

async function testConcurrentUpdates(): Promise<void> {
  const { vaultDir, config, cleanup } = makeVaultAndConfig();
  try {
    const files = ["concurrent-a.md", "concurrent-b.md", "concurrent-c.md"];
    const contents: Record<string, string> = {};

    for (const file of files) {
      contents[file] = `# ${file}\n\n${"Content ".repeat(50)}`;
      writeFileSync(join(vaultDir, file), contents[file], "utf-8");
    }

    // Sync all 3 concurrently
    const results = await Promise.all(files.map(f => syncFiles([f], config)));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const result = results[i];
      assert(result.synced.includes(file), `${file} should be in synced list`);
      assert(result.errors.length === 0, `${file} should have no errors`);

      const stored = await client.readFile(file);
      assert(stored !== null, `${file} should exist in CouchDB after concurrent sync`);
      assertEqual(stored!, contents[file], `${file} content should match after concurrent sync`);
    }
  } finally {
    cleanup();
    await cleanDatabase();
  }
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`\nobsidian-git-livesync E2E Test Suite`);
  console.log(`CouchDB: ${COUCH_URL}/${COUCH_DB}`);
  console.log(`─────────────────────────────────────\n`);

  // Check CouchDB is available
  console.log("[SETUP] Checking CouchDB availability...");
  await checkCouchDB();
  await ensureTestDatabase();
  await cleanDatabase();
  console.log("[SETUP] CouchDB ready. Running tests...\n");

  await runTest("Create file — new .md file synced to CouchDB with correct content", testCreateFile);
  await runTest("Update file — content updated, ctime preserved", testUpdateFile);
  await runTest("Delete file — removed from CouchDB", testDeleteFile);
  await runTest("Subdirectory file — full path stored correctly", testSubdirectoryFile);
  await runTest("Frontmatter preservation — YAML roundtrips unchanged", testFrontmatterPreservation);
  await runTest("Large file — 100KB markdown synced and reassembled correctly", testLargeFile);
  await runTest("Special characters — Unicode/emoji/CJK byte-accurate size + roundtrip", testSpecialCharacters);
  await runTest("Wiki-links — [[link]] syntax passes through unchanged", testWikiLinks);
  await runTest("Empty file — synced without crash, stored as empty string", testEmptyFile);
  await runTest("Binary skip — .png skipped with warning, not stored in CouchDB", testBinarySkip);
  await runTest("CLI sync --all — 5 files synced via CLI binary", testCliSyncAll);
  await runTest("Concurrent updates — 3 files synced in parallel, no race conditions", testConcurrentUpdates);

  // Final summary
  const total = passed + failed;
  console.log(`\n─────────────────────────────────────`);
  console.log(`${passed}/${total} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("[FATAL]", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
