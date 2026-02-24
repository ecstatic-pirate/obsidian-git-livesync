/**
 * Unit tests for CouchDBClient internals.
 * No CouchDB connection needed — pure logic only.
 *
 * Run with: npx tsx tests/couchdb-client.test.ts
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[FAIL] ${name}: ${reason}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Replicate the private chunkId logic from CouchDBClient
// (mirrors src/couchdb-client.ts exactly)
// ---------------------------------------------------------------------------

function chunkId(content: string): string {
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 40);
  return `h:${hash}`;
}

// ---------------------------------------------------------------------------
// Tests: chunkId
// ---------------------------------------------------------------------------

test("chunkId produces a string starting with 'h:'", () => {
  const id = chunkId("hello world");
  assert(id.startsWith("h:"), `expected 'h:' prefix, got '${id}'`);
});

test("chunkId produces exactly 42 characters (h: + 40 hex chars)", () => {
  const id = chunkId("some content");
  assertEqual(id.length, 42, "chunkId length should be 42");
});

test("chunkId is deterministic — same input gives same output", () => {
  const content = "# My Note\nHello, Obsidian!";
  const id1 = chunkId(content);
  const id2 = chunkId(content);
  assertEqual(id1, id2, "chunkId should be deterministic");
});

test("chunkId produces different hashes for different content", () => {
  const id1 = chunkId("content A");
  const id2 = chunkId("content B");
  assert(id1 !== id2, "different content should produce different chunk IDs");
});

test("chunkId handles empty string without throwing", () => {
  const id = chunkId("");
  assert(id.startsWith("h:"), "empty string should still produce an h: prefixed id");
  assertEqual(id.length, 42, "empty string chunk id should still be 42 chars");
});

test("chunkId handles Unicode content correctly", () => {
  const unicode = "こんにちは 🌸 Héllo";
  const id = chunkId(unicode);
  assert(id.startsWith("h:"), "unicode content should produce h: prefixed id");
  assertEqual(id.length, 42, "unicode content chunk id should be 42 chars");
});

test("chunkId handles very large content without throwing", () => {
  const large = "x".repeat(100 * 1024); // 100 KB
  const id = chunkId(large);
  assert(id.startsWith("h:"), "large content should produce h: prefixed id");
  assertEqual(id.length, 42, "large content chunk id should be 42 chars");
});

test("chunkId hash portion is valid lowercase hex", () => {
  const id = chunkId("test content for hex validation");
  const hexPart = id.slice(2); // remove "h:"
  assert(/^[0-9a-f]{40}$/.test(hexPart), `hash part should be 40 lowercase hex chars, got '${hexPart}'`);
});

// ---------------------------------------------------------------------------
// Tests: path encoding (mirrors how CouchDBClient.get/put use encodeURIComponent)
// ---------------------------------------------------------------------------

test("path with forward slashes encodes correctly", () => {
  const path = "subfolder/nested/file.md";
  const encoded = encodeURIComponent(path);
  // Should encode slashes as %2F
  assert(encoded.includes("%2F"), "forward slashes should be encoded as %2F");
  assert(!encoded.includes("/"), "encoded path should not contain literal slashes");
});

test("path with spaces encodes correctly", () => {
  const path = "my notes/a file with spaces.md";
  const encoded = encodeURIComponent(path);
  assert(encoded.includes("%20") || encoded.includes("+"), "spaces should be encoded");
  assert(!encoded.includes(" "), "encoded path should not contain literal spaces");
});

test("path with special chars (parens, brackets) encodes without throwing", () => {
  const path = "notes/note (copy) [2024].md";
  const encoded = encodeURIComponent(path);
  assert(typeof encoded === "string" && encoded.length > 0, "encoded path should be a non-empty string");
});

test("path with unicode chars encodes correctly", () => {
  const path = "日本語/メモ.md";
  const encoded = encodeURIComponent(path);
  assert(typeof encoded === "string" && encoded.length > 0, "unicode path should encode without throwing");
  assert(!encoded.includes("日"), "unicode chars should be percent-encoded");
});

test("path with hash-like chars does not conflict with h: prefix", () => {
  // Ensure a file path that starts with h: doesn't accidentally look like a leaf ID
  const path = "h:something/file.md";
  const encoded = encodeURIComponent(path);
  assert(encoded.startsWith("h%3A"), "leading h: in path should be encoded");
});

test("encodeURIComponent is its own inverse via decodeURIComponent", () => {
  const paths = [
    "simple.md",
    "folder/sub/file.md",
    "notes with spaces/test.md",
    "unicode/こんにちは.md",
    "special/note (1) [draft].md",
  ];
  for (const path of paths) {
    const roundtripped = decodeURIComponent(encodeURIComponent(path));
    assertEqual(roundtripped, path, `encode→decode roundtrip failed for '${path}'`);
  }
});

// ---------------------------------------------------------------------------
// Tests: size calculation (Buffer.byteLength mirrors writeFile logic)
// ---------------------------------------------------------------------------

test("size for ASCII content is byte-accurate", () => {
  const content = "hello world"; // 11 ASCII chars = 11 bytes
  assertEqual(Buffer.byteLength(content, "utf8"), 11, "ASCII content byte length");
});

test("size for UTF-8 multi-byte content is byte-accurate (not char count)", () => {
  // Japanese character こ is 3 bytes in UTF-8
  const content = "こんにちは"; // 5 chars, 15 bytes
  const byteLen = Buffer.byteLength(content, "utf8");
  assert(byteLen > content.length, "UTF-8 multibyte content should have more bytes than chars");
  assertEqual(byteLen, 15, "Japanese string should be 15 bytes");
});

test("size for emoji content is byte-accurate", () => {
  // 🌸 is a 4-byte UTF-8 character (emoji in supplementary plane)
  const content = "🌸";
  const byteLen = Buffer.byteLength(content, "utf8");
  assertEqual(byteLen, 4, "emoji should be 4 bytes in UTF-8");
});

test("size for empty content is 0", () => {
  assertEqual(Buffer.byteLength("", "utf8"), 0, "empty content should be 0 bytes");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(`\n${passed}/${total} tests passed`);

if (failed > 0) {
  process.exit(1);
}
