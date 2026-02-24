#!/usr/bin/env node

/**
 * obsidian-git-livesync CLI
 * Bridge git pushes to Obsidian via CouchDB + Self-hosted LiveSync plugin.
 */

export { CouchDBClient } from "./couchdb-client.js";
export type {
  CouchDBClientOptions,
  LiveSyncDocument,
  LiveSyncLeaf,
} from "./couchdb-client.js";
