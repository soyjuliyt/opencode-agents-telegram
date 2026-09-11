#!/usr/bin/env node
// Universal one-shot deploy for the OpenCode Telegram Group Topics Bot.
// Run inside the repo:  node scripts/setup.mjs [--help]
// Cross-platform: Windows (hidden daemon + Startup VBS), Linux (systemd user
// service), macOS (launchd agent). No Docker, no containers — native install.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const IS_WINDOWS = process.platform === "win32";
const NPM_CMD = IS_WINDOWS ? "npm.cmd" : "npm";

const USAGE = `Usage:
  node scripts/setup.mjs [options]

Universal deploy for the OpenCode Telegram Group Topics Bot.
Configures .env, builds, starts the bot hidden in the background and
installs logon autostart for the current platform (Windows Startup VBS,
Linux systemd user service, macOS launchd agent).

Options:
  --token <bot-token>          Telegram bot token (required)
  --user-id <numeric-id>       Allowed Telegram user ID (required)
  --provider <id>              Default model provider (default: opencode)
  --model <id>                 Default model ID (default: big-pickle)
  --api-url <url>              OpenCode server URL (default: http://localhost:4096)
  --server-user <user>         OpenCode server username (default: opencode)
  --server-password <secret>   OpenCode server password (optional)
  --locale <en|es|de|fr|ru|zh> Bot UI language (default: en)
  --no-start                   Do not start the bot after setup
  --no-autostart               Do not install the logon autostart entry
  --no-build                   Do not run the TypeScript build
  --yes, -y                    Non-interactive (missing required values are an error)
  --dry-run                    Print the plan without changing anything
  --help, -h                   Show this help
`;

const FLAG_ENV = {
  "--token": "TELEGRAM_BOT_TOKEN",
  "--user-id": "TELEGRAM_ALLOWED_USER_ID",
  "--locale": "BOT_LOCALE",
  "--api-url": "OPENCODE_API_URL",
  "--server-user": "OPENCODE_SERVER_USERNAME",
  "--server-password": "OPENCODE_SERVER_PASSWORD",
  "--provider": "OPENCODE_MODEL_PROVIDER",
  "--model": "OPENCODE_MODEL_ID",
};

const DEFAULTS = {
  BOT_LOCALE: "en",
  OPENCODE_API_URL: "http://localhost:4096",
  OPENCODE_SERVER_USERNAME: "opencode",
  OPENCODE_MODEL_PROVIDER: "opencode",
  OPENCODE_MODEL_ID: "big-pickle",
  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_ALLOWED_USER_ID: "",
  OPENCODE_SERVER_PASSWORD: "",
};

const REQUIRED = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_USER_ID"];

function parseArgs(argv) {
  const flags = {};
  const booleans = new Set(["--no-start", "--no-autostart", "--no-build", "--yes", "-y", "--dry-run", "--help", "-h"]);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        flags[token.slice(0, eq)] = token.slice(eq + 1);
      } else if (booleans.has(token)) {
        flags[token] = true;
      } else {
        flags[token] = argv[i + 1];
        i += 1;
      }
    }
  }
  return flags;
}

function readEnvFile() {
  const envPath = path.join(repoRoot, ".env");
  if (!fs.existsSync(envPath)) {
    return { envPath, lines: [], values: {} };
  }
  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  const values = {};
  for (const line of lines) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) {
      let value = match[2].trim();
      if (/^["'].*["']$/.test(value)) {
        value = value.slice(1, -1);
      }
      values[match[1]] = value;
    }
  }
  return { envPath, lines, values };
}

function envValueNeedsQuotes(value) {
  return /\s|[#]/.test(value);
}

function writeEnvFile({ envPath, lines, values }) {
  const keys = Object.keys(DEFAULTS);
  const replaced = new Set();
  const output = [];
  for (const line of lines) {
    const match = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (match && Object.prototype.hasOwnProperty.call(values, match[1])) {
      const value = values[match[1]];
      output.push(`${match[1]}=${envValueNeedsQuotes(value) ? `"${value}"` : value}`);
      replaced.add(match[1]);
    } else {
      output.push(line);
    }
  }
  for (const key of keys) {
    if (!replaced.has(key) && Object.prototype.hasOwnProperty.call(values, key)) {
      const value = values[key];
      output.push(`${key}=${envValueNeedsQuotes(value) ? `"${value}"` : value}`);
    }
  }
  fs.writeFileSync(envPath, `${output.join("\n")}\n`, "utf-8");
}

function maskValue(envKey, value) {
  if (!value) {
    return value;
  }
  if (envKey === "TELEGRAM_BOT_TOKEN" || envKey === "OPENCODE_SERVER_PASSWORD") {
    return value.slice(0, 3) + "…(redacted)";
  }
  return value;
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function step(title) {
  log(`\n==> ${title}`);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { cwd: repoRoot, stdio: "inherit", ...opts });
  if (result.status !== 0) {
    process.stderr.write(`\nCommand failed (exit ${result.status}): ${cmd} ${args.join(" ")}\n`);
    process.exit(result.status ?? 1);
  }
  return result;
}

function nodeMajorAtLeast(target) {
  return Number(process.versions.node.split(".")[0]) >= target;
}

async function collectValues(flags, existing) {
  const values = { ...DEFAULTS, ...existing };
  for (const [flag, envKey] of Object.entries(FLAG_ENV)) {
    if (flags[flag]) {
      values[envKey] = flags[flag];
    }
  }
  const interactive = !flags["--yes"] && process.stdin.isTTY;
  const rl = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = async (label, current, required) => {
    const suffix = required ? "" : ` [default: ${current || "(empty)"}]`;
    const answer = rl ? (await rl.question(`${label}${suffix}: `)).trim() : "";
    return answer || current;
  };
  try {
    values.TELEGRAM_BOT_TOKEN = await ask("Telegram bot token (@BotFather)", values.TELEGRAM_BOT_TOKEN, true);
    values.TELEGRAM_ALLOWED_USER_ID = await ask("Allowed Telegram user ID (@userinfobot)", values.TELEGRAM_ALLOWED_USER_ID, true);
    values.OPENCODE_API_URL = await ask("OpenCode server URL", values.OPENCODE_API_URL, false);
    values.OPENCODE_SERVER_PASSWORD = await ask("OpenCode server password (if auth required)", values.OPENCODE_SERVER_PASSWORD, false);
    values.OPENCODE_MODEL_PROVIDER = await ask("Default model provider", values.OPENCODE_MODEL_PROVIDER, false);
    values.OPENCODE_MODEL_ID = await ask("Default model ID", values.OPENCODE_MODEL_ID, false);
    values.BOT_LOCALE = await ask("UI locale (en/es/de/fr/ru/zh)", values.BOT_LOCALE, false);
  } finally {
    if (rl) {
      rl.close();
    }
  }
  const missing = REQUIRED.filter((key) => !values[key] || values[key].trim().length === 0);
  if (missing.length > 0) {
    log("\nMissing required values: " + missing.join(", "));
    log("Run interactively (plain `node scripts/setup.mjs`) or pass --token / --user-id.");
    process.exit(2);
  }
  return values;
}

function installWindowsAutostart() {
  step("Installing Windows logon autostart (Startup VBS)");
  const installer = path.join(repoRoot, "scripts", "install-windows-autostart.ps1");
  run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", installer]);
}

function installLinuxAutostart(nodePath) {
  step("Installing Linux autostart (systemd user service)");
  const configDir = path.join(os.homedir(), ".config", "systemd", "user");
  fs.mkdirSync(configDir, { recursive: true });
  const unitPath = path.join(configDir, "opencode-telegram-group-topics-bot.service");
  const unit = `[Unit]
Description=OpenCode Telegram Group Topics Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${repoRoot}
Environment=OPENCODE_TELEGRAM_HOME=${repoRoot}
ExecStart=${nodePath} ${repoRoot}/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
  fs.writeFileSync(unitPath, unit, "utf-8");
  log(`Unit written: ${unitPath}`);
  const sysctl = spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
  if (sysctl.status !== 0) {
    log("systemctl --user not available; enable it manually:\n  systemctl --user enable --now opencode-telegram-group-topics-bot");
    return;
  }
  spawnSync("systemctl", ["--user", "enable", "--now", "opencode-telegram-group-topics-bot.service"], { stdio: "inherit" });
}

function installMacAutostart(nodePath) {
  step("Installing macOS autostart (launchd agent)");
  const launchDir = path.join(os.homedir(), "Library", "LaunchAgents");
  fs.mkdirSync(launchDir, { recursive: true });
  const plistPath = path.join(launchDir, "com.opencode-telegram.group-topics-bot.plist");
  const logPath = path.join(repoRoot, "logs", "bot-autostart.log");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.opencode-telegram.group-topics-bot</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${repoRoot}/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${repoRoot}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>OPENCODE_TELEGRAM_HOME</key>
    <string>${repoRoot}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
</dict>
</plist>
`;
  fs.writeFileSync(plistPath, plist, "utf-8");
  log(`LaunchAgent written: ${plistPath}`);
  const bootstrap = spawnSync("launchctl", ["bootstrap", `gui/${process.getuid?.() ?? os.userInfo().uid}`, plistPath], { stdio: "inherit" });
  if (bootstrap.status !== 0) {
    spawnSync("launchctl", ["load", "-w", plistPath], { stdio: "inherit" });
  }
}

function startDaemon() {
  step("Starting the bot as a hidden background daemon");
  const env = { ...process.env, OPENCODE_TELEGRAM_HOME: repoRoot };
  delete env.OPENCODE_SERVER_PASSWORD; // let the repo .env be authoritative
  spawnSync(process.execPath, [path.join("dist", "cli.js"), "start", "--daemon", "--mode", "installed"], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
}

function managementSummary() {
  if (process.platform === "win32") {
    return `Windows:
  node dist/cli.js status           # service status (PID, uptime, log)
  node dist/cli.js stop             # stop the background daemon
  npm run autostart:uninstall       # remove the logon autostart launcher`;
  }
  if (process.platform === "linux") {
    return `Linux (systemd user service):
  systemctl --user status opencode-telegram-group-topics-bot
  systemctl --user restart opencode-telegram-group-topics-bot
  systemctl --user disable --now opencode-telegram-group-topics-bot   # stop + disable autostart`;
  }
  return `macOS (launchd agent):
  launchctl print gui/$(id -u)/com.opencode-telegram.group-topics-bot
  launchctl kickstart -k gui/$(id -u)/com.opencode-telegram.group-topics-bot
  launchctl bootout gui/$(id -u)/com.opencode-telegram.group-topics-bot  # stop + remove agent`;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags["--help"] || flags["-h"]) {
    log(USAGE);
    return;
  }

  step("Pre-flight");
  if (!nodeMajorAtLeast(20)) {
    log(`This repo requires Node.js 20+ (found ${process.versions.node}).`);
    log("Use the bootstrap script to install it: scripts/bootstrap.ps1 (Windows) or scripts/bootstrap.sh (Linux/macOS).");
    process.exit(3);
  }
  log(`Node ${process.versions.node} · ${process.platform} · repo ${repoRoot}`);
  if (flags["--no-build"] && !fs.existsSync(path.join(repoRoot, "dist", "index.js"))) {
    log("dist/ is missing and --no-build was passed; cannot continue.");
    process.exit(4);
  }

  const dry = Boolean(flags["--dry-run"]);
  if (dry) {
    log("--- dry-run: no changes will be made ---");
  }

  const envFile = readEnvFile();
  const values = dry
    ? { ...DEFAULTS, ...envFile.values, ...Object.fromEntries(Object.entries(FLAG_ENV).filter(([k]) => flags[k]).map(([k, v]) => [v, flags[k]])) }
    : await collectValues(flags, envFile.values);
  if (dry) {
    log("Would write .env with:");
    for (const key of Object.keys(DEFAULTS)) {
      if (values[key]) {
        log(`  ${key}=${envValueNeedsQuotes(values[key]) ? `"${maskValue(key, values[key])}"` : maskValue(key, values[key])}`);
      }
    }
  }

  if (!dry && !flags["--no-build"]) {
    step("Ensuring dependencies");
    if (!fs.existsSync(path.join(repoRoot, "node_modules"))) {
      run(NPM_CMD, ["install"]);
    } else {
      log("node_modules already present — skipping npm install.");
    }
    step("Building the bot");
    run(NPM_CMD, ["run", "build"]);
  }

  if (!dry) {
    step("Writing .env");
    values.TELEGRAM_ALLOWED_USER_ID = String(values.TELEGRAM_ALLOWED_USER_ID).trim();
    writeEnvFile({ ...envFile, values });
  }

  if (!dry && !flags["--no-autostart"]) {
    if (IS_WINDOWS) {
      installWindowsAutostart();
    } else if (process.platform === "linux") {
      installLinuxAutostart(process.execPath);
    } else if (process.platform === "darwin") {
      installMacAutostart(process.execPath);
    } else {
      log(`Autostart not implemented for platform ${process.platform}; run the bot manually.`);
    }
  }

  if (!dry && !flags["--no-start"]) {
    if (process.platform === "win32") {
      startDaemon();
    } else if (process.platform === "linux") {
      step("Starting the bot in the background");
      const env = { ...process.env, OPENCODE_TELEGRAM_HOME: repoRoot };
      delete env.OPENCODE_SERVER_PASSWORD;
      const sysctl = spawnSync("systemctl", ["--user", "start", "opencode-telegram-group-topics-bot.service"], { stdio: "inherit" });
      if (sysctl.status !== 0) {
        spawnSync(process.execPath, [path.join("dist", "index.js")], { cwd: repoRoot, env, detached: true, stdio: "ignore" });
      }
    } else if (process.platform === "darwin") {
      step("Starting the bot via LaunchAgent");
      const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", "com.opencode-telegram.group-topics-bot.plist");
      spawnSync("launchctl", ["bootstrap", `gui/${os.userInfo().uid}`, plistPath], { stdio: "inherit" });
    }
  }

  if (!dry && !flags["--no-autostart"]) {
    if (IS_WINDOWS) {
      installWindowsAutostart();
    } else if (process.platform === "linux") {
      installLinuxAutostart(process.execPath);
    } else if (process.platform === "darwin") {
      installMacAutostart(process.execPath);
    } else {
      log(`Autostart not implemented for platform ${process.platform}; run the bot manually.`);
    }
  }

  step("Done");
  log(managementSummary());
}

main().catch((error) => {
  process.stderr.write(`\nSetup failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});