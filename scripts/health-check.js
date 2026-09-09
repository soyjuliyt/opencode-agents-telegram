#!/usr/bin/env node

/**
 * Runtime health check for CI.
 * Verifies that the built bot can start, has env config, and the
 * module graph can be imported without runtime errors.
 *
 * Usage: node scripts/health-check.js
 *
 * Exit codes:
 *   0 - all checks passed
 *   1 - one or more checks failed (logged)
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

let failed = false;

function log(prefix, msg, success = true) {
  if (!success) {
    failed = true;
  }
  const ts = new Date().toISOString();
  const marker = success ? "✓" : "✗";
  process.stderr.write(`[${ts}] ${marker} [${prefix}] ${msg}\n`);
}

// Ensure dotenv is loaded (mirrors what config.js does)
const envFilePath = join(projectRoot, ".env");
if (existsSync(envFilePath)) {
  dotenv.config({ path: envFilePath, quiet: true });
  log("ENV", `Loaded ${envFilePath}`);
} else {
  log("ENV", `.env file not found (CI typically sets env vars)`, false);
}

// Check required env vars (mirrors validateRuntimeEnvValues from bootstrap)
const envRequired = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_ALLOWED_USER_ID",
  "OPENCODE_MODEL_PROVIDER",
  "OPENCODE_MODEL_ID",
];

for (const key of envRequired) {
  if (process.env[key]) {
    log("ENV", `${key} is set`);
  } else {
    log("ENV", `Missing env var: ${key} (expected in .env or CI)`, false);
  }
}

// Check that dist/index.js exists (build was run)
const distIndex = join(projectRoot, "dist", "index.js");
if (existsSync(distIndex)) {
  log("BUILD", `dist/index.js exists (${(readFileSync(distIndex, "utf8").length / 1024).toFixed(1)} KB)`);
} else {
  log("BUILD", "dist/index.js not found. Run 'npm run build' first.", false);
}

// Check that the built runtime paths module can be imported (lightweight, no I/O)
try {
  const paths = await import(`file://${join(projectRoot, "dist", "runtime", "paths.js")}`);
  const runtimePaths = paths.getRuntimePaths();
  log("RUNTIME", `Runtime paths resolved (appHome=${runtimePaths.appHome})`);
  if (!runtimePaths.envFilePath) {
    log("RUNTIME", "Runtime paths missing envFilePath", false);
  }
} catch (err) {
  log("RUNTIME", `Failed to import runtime/paths.js: ${err.message}`, false);
}

// Check that the config module can be loaded (validates env vars are parseable)
try {
  const config = await import(`file://${join(projectRoot, "dist", "config.js")}`);
  const cfg = config.config;
  log("CONFIG", `Config loaded (model=${cfg.opencode.model.provider}/${cfg.opencode.model.modelId})`);
  if (!cfg.telegram.token) {
    log("CONFIG", "telegram.token is empty", false);
  }
} catch (err) {
  log("CONFIG", `Failed to load config: ${err.message}`, false);
}

// Final summary
if (failed) {
  log("HEALTH", "Health check FAILED", false);
  process.exit(1);
} else {
  log("HEALTH", "All checks passed");
  process.exit(0);
}