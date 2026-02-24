/**
 * Configuration loading for obsidian-git-livesync.
 *
 * Priority: env vars > config file > defaults.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface Config {
  couchdbUrl: string;
  couchdbUser: string;
  couchdbPassword: string;
  couchdbDatabase: string;
  vaultRoot: string;
  passphrase?: string;
  extensions: string[];
  debounce: number;
  verbose: boolean;
  dryRun: boolean;
}

interface ConfigFileShape {
  couchdbUrl?: string;
  couchdbUser?: string;
  couchdbPassword?: string;
  couchdbDatabase?: string;
  vaultRoot?: string;
  passphrase?: string;
  extensions?: string[];
  debounce?: number;
}

const DEFAULTS: Omit<Config, "couchdbUser" | "couchdbPassword" | "vaultRoot"> = {
  couchdbUrl: "http://localhost:5984",
  couchdbDatabase: "obsidian-livesync",
  extensions: [".md"],
  debounce: 200,
  verbose: false,
  dryRun: false,
};

const CONFIG_FILENAME = ".obsidian-git-livesync.json";

function loadConfigFile(configPath?: string): ConfigFileShape {
  const filePath = configPath
    ? resolve(configPath)
    : resolve(process.cwd(), CONFIG_FILENAME);

  if (!existsSync(filePath)) return {};

  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ConfigFileShape;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[WARN] Failed to parse config file ${filePath}: ${message}`);
    return {};
  }
}

export interface LoadConfigOptions {
  configPath?: string;
  verbose?: boolean;
  dryRun?: boolean;
  debounce?: number;
  extensions?: string[];
}

/**
 * Load configuration from env vars, config file, and CLI options.
 * Env vars override config file; CLI options override both.
 */
export function loadConfig(options: LoadConfigOptions = {}): Config {
  const fileConfig = loadConfigFile(options.configPath);

  const config: Config = {
    couchdbUrl:
      process.env["COUCHDB_URL"] ??
      fileConfig.couchdbUrl ??
      DEFAULTS.couchdbUrl,
    couchdbUser:
      process.env["COUCHDB_USER"] ??
      fileConfig.couchdbUser ??
      "",
    couchdbPassword:
      process.env["COUCHDB_PASSWORD"] ??
      fileConfig.couchdbPassword ??
      "",
    couchdbDatabase:
      process.env["COUCHDB_DATABASE"] ??
      fileConfig.couchdbDatabase ??
      DEFAULTS.couchdbDatabase,
    vaultRoot:
      process.env["VAULT_ROOT"] ??
      fileConfig.vaultRoot ??
      process.cwd(),
    passphrase:
      process.env["PASSPHRASE"] ??
      fileConfig.passphrase ??
      undefined,
    extensions:
      options.extensions ??
      fileConfig.extensions ??
      DEFAULTS.extensions,
    debounce:
      options.debounce ??
      fileConfig.debounce ??
      DEFAULTS.debounce,
    verbose: options.verbose ?? DEFAULTS.verbose,
    dryRun: options.dryRun ?? DEFAULTS.dryRun,
  };

  return config;
}

/**
 * Validate that required config values are present.
 * Returns an array of error messages (empty = valid).
 */
export function validateConfig(config: Config): string[] {
  const errors: string[] = [];
  if (!config.couchdbUser) errors.push("COUCHDB_USER is required");
  if (!config.couchdbPassword) errors.push("COUCHDB_PASSWORD is required");
  if (!config.vaultRoot) errors.push("VAULT_ROOT is required");
  return errors;
}
