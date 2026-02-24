/**
 * Validation script for obsidian-git-livesync Phase 1.
 *
 * Tests:
 * 1. Connect to local CouchDB
 * 2. List all documents
 * 3. Write a test file in LiveSync format
 * 4. Read the file back and verify content matches
 * 5. Clean up the test file
 */

import { CouchDBClient } from "../src/couchdb-client.js";

const client = new CouchDBClient({
  url: "http://localhost:5984",
  database: "obsidian-livesync",
  username: "admin",
  password: "password",
});

async function validate(): Promise<void> {
  let passed = 0;
  let failed = 0;

  function pass(name: string): void {
    passed++;
    console.log(`  PASS  ${name}`);
  }
  function fail(name: string, error: unknown): void {
    failed++;
    console.log(`  FAIL  ${name} -- ${error}`);
  }

  console.log("obsidian-git-livesync validation");
  console.log("================================\n");

  // Test 1: Connectivity
  console.log("[1] Checking CouchDB connectivity...");
  try {
    const ok = await client.ping();
    if (!ok) throw new Error("ping returned false");
    pass("CouchDB is reachable");
  } catch (e) {
    fail("CouchDB connectivity", e);
    console.log(
      "\n  Make sure CouchDB is running:\n  docker compose up -d && bash scripts/setup-couchdb.sh\n"
    );
    process.exit(1);
  }

  // Test 2: List documents
  console.log("\n[2] Listing existing documents...");
  try {
    const result = await client.allDocs();
    pass(`Listed ${result.total_rows} document(s)`);
    if (result.rows.length > 0) {
      const ids = result.rows.slice(0, 10).map((r) => r.id);
      console.log(`       IDs: ${ids.join(", ")}${result.rows.length > 10 ? "..." : ""}`);
    }
  } catch (e) {
    fail("List documents", e);
  }

  // Test 3: Write a test file
  const testPath = "test-sync.md";
  const testContent = `# Test\n\nThis file was synced from git at ${new Date().toISOString()}`;

  console.log(`\n[3] Writing test file '${testPath}'...`);
  try {
    const { metaId, leafId } = await client.writeFile(testPath, testContent);
    pass(`Wrote file (meta=${metaId}, leaf=${leafId})`);
  } catch (e) {
    fail("Write test file", e);
  }

  // Test 4: Read back and verify
  console.log(`\n[4] Reading back '${testPath}' and verifying...`);
  try {
    const readBack = await client.readFile(testPath);
    if (readBack === null) {
      throw new Error("File not found after write");
    }
    if (readBack !== testContent) {
      throw new Error(
        `Content mismatch:\n  expected: ${JSON.stringify(testContent)}\n  got:      ${JSON.stringify(readBack)}`
      );
    }
    pass("Content matches after round-trip");
  } catch (e) {
    fail("Read and verify", e);
  }

  // Test 5: Clean up
  console.log(`\n[5] Cleaning up test file...`);
  try {
    const meta = await client.get<{ _id: string; _rev: string }>(testPath);
    if (meta && meta._rev) {
      await client.delete(testPath, meta._rev);
      pass("Test file deleted");
    } else {
      pass("Test file already gone");
    }
  } catch (e) {
    fail("Cleanup", e);
  }

  // Summary
  console.log("\n================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("\nAll validation checks passed!");
  }
}

validate().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
