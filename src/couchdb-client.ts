/**
 * Minimal CouchDB client for Self-hosted LiveSync document format.
 *
 * LiveSync stores files as:
 * - A metadata document with _id = path (e.g. "test-sync.md")
 *   type: "plain", path, children[] (chunk IDs), ctime, mtime, size
 * - Chunk (leaf) documents with _id = "h:" + hash
 *   type: "leaf", data: base64-encoded content
 *
 * This client writes in that format so the LiveSync plugin picks up files.
 */

export interface CouchDBClientOptions {
  url: string; // e.g. "http://localhost:5984"
  database: string; // e.g. "obsidian-livesync"
  username: string;
  password: string;
}

export interface LiveSyncDocument {
  _id: string;
  _rev?: string;
  type: "plain" | "newnote";
  path: string;
  children: string[];
  ctime: number;
  mtime: number;
  size: number;
  eden: Record<string, unknown>;
}

export interface LiveSyncLeaf {
  _id: string;
  _rev?: string;
  type: "leaf";
  data: string; // content (plain text for text files)
}

export interface AllDocsResponse {
  total_rows: number;
  offset: number;
  rows: Array<{
    id: string;
    key: string;
    value: { rev: string };
    doc?: Record<string, unknown>;
  }>;
}

export class CouchDBClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(private options: CouchDBClientOptions) {
    this.baseUrl = `${options.url}/${options.database}`;
    const auth = Buffer.from(
      `${options.username}:${options.password}`
    ).toString("base64");
    this.headers = {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Check if the database is reachable.
   */
  async ping(): Promise<boolean> {
    const res = await fetch(this.baseUrl, { headers: this.headers });
    return res.ok;
  }

  /**
   * List all documents in the database.
   */
  async allDocs(includeDocs = false): Promise<AllDocsResponse> {
    const url = `${this.baseUrl}/_all_docs?include_docs=${includeDocs}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      throw new Error(`allDocs failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as AllDocsResponse;
  }

  /**
   * Get a single document by ID.
   */
  async get<T = Record<string, unknown>>(id: string): Promise<T | null> {
    const res = await fetch(
      `${this.baseUrl}/${encodeURIComponent(id)}`,
      { headers: this.headers }
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`get failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  /**
   * Put a document (create or update).
   */
  async put(doc: Record<string, unknown>): Promise<{ ok: boolean; id: string; rev: string }> {
    const id = doc._id as string;
    const res = await fetch(
      `${this.baseUrl}/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        headers: this.headers,
        body: JSON.stringify(doc),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`put failed: ${res.status} ${res.statusText} - ${body}`);
    }
    return (await res.json()) as { ok: boolean; id: string; rev: string };
  }

  /**
   * Delete a document by ID and rev.
   */
  async delete(id: string, rev: string): Promise<{ ok: boolean }> {
    const res = await fetch(
      `${this.baseUrl}/${encodeURIComponent(id)}?rev=${rev}`,
      { method: "DELETE", headers: this.headers }
    );
    if (!res.ok) {
      throw new Error(`delete failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as { ok: boolean };
  }

  /**
   * Generate a simple hash-based chunk ID for LiveSync leaf documents.
   * Uses a basic djb2 hash since we don't need cryptographic strength.
   * Prefixed with "h:" to match LiveSync convention.
   */
  private chunkId(content: string): string {
    let hash = 5381;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) + hash + content.charCodeAt(i)) >>> 0;
    }
    return `h:${hash.toString(16).padStart(8, "0")}`;
  }

  /**
   * Write a text file in LiveSync format.
   * Creates a leaf (chunk) document and a metadata document.
   */
  async writeFile(
    path: string,
    content: string,
    options?: { ctime?: number; mtime?: number }
  ): Promise<{ metaId: string; leafId: string }> {
    const now = Date.now();
    const ctime = options?.ctime ?? now;
    const mtime = options?.mtime ?? now;

    // Create the leaf document
    const leafId = this.chunkId(content);

    // Check if leaf already exists (content-addressable)
    const existingLeaf = await this.get(leafId);
    if (!existingLeaf) {
      await this.put({
        _id: leafId,
        type: "leaf",
        data: content,
      });
    }

    // Check if metadata doc already exists (need _rev for update)
    const existingMeta = await this.get<LiveSyncDocument>(path);

    const metaDoc: Record<string, unknown> = {
      _id: path,
      type: "plain",
      path: path,
      children: [leafId],
      ctime,
      mtime,
      size: content.length,
      eden: {},
    };

    if (existingMeta?._rev) {
      metaDoc._rev = existingMeta._rev;
    }

    await this.put(metaDoc);

    return { metaId: path, leafId };
  }

  /**
   * Read a text file from LiveSync format.
   * Fetches the metadata document and its leaf chunks, then reassembles.
   */
  async readFile(path: string): Promise<string | null> {
    const meta = await this.get<LiveSyncDocument>(path);
    if (!meta) return null;

    const chunks: string[] = [];
    for (const childId of meta.children) {
      const leaf = await this.get<LiveSyncLeaf>(childId);
      if (!leaf) {
        throw new Error(`Missing chunk ${childId} for file ${path}`);
      }
      chunks.push(leaf.data);
    }

    return chunks.join("");
  }
}
