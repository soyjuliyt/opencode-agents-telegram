#!/usr/bin/env node
// Universal one-shot deploy for the OpenCode Telegram Group Topics Bot.
// Run inside the repo:  node scripts/setup.mjs [--help]
// Cross-platform: Windows (hidden daemon + Startup VBS), Linux (systemd user
// service), macOS (launchd agent). No Docker, no containers — native install.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
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
Linux systemd user service, macOS launchd agent). The OpenCode server
itself is also started and registered for autostart, secured with a
randomly generated server password (overridable via --server-password).

Options:
  --token <bot-token>          Telegram bot token (required)
  --user-id <numeric-id>       Allowed Telegram user ID (optional; auto-detected on first
                               DM if omitted)
  --provider <id>              Default model provider (default: opencode)
  --model <id>                 Default model ID (default: big-pickle)
  --api-url <url>              OpenCode server URL (default: http://localhost:4096)
  --server-user <user>         OpenCode server username (default: opencode)
  --server-password <secret>   OpenCode server password (optional; a random one is generated if omitted)
  --locale <en|es|de|fr|ru|zh> Bot UI language (default: en)
  --no-opencode                Do not attempt to install OpenCode / its autostart if missing
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

const REQUIRED = ["TELEGRAM_BOT_TOKEN"];

function parseArgs(argv) {
  const flags = {};
  const booleans = new Set(["--no-start", "--no-autostart", "--no-build", "--no-opencode", "--yes", "-y", "--dry-run", "--help", "-h"]);
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
  const result = spawnSync(cmd, args, { cwd: repoRoot, stdio: "inherit", shell: IS_WINDOWS, ...opts });
  if (result.status !== 0) {
    process.stderr.write(`\nCommand failed (exit ${result.status ?? "null"}): ${cmd} ${args.join(" ")}\n`);
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
    if (rl) {
      log("\nYour Telegram User ID will be detected automatically the first time you DM the bot.");
    }
  } finally {
    if (rl) {
      rl.close();
    }
  }
  const missing = REQUIRED.filter((key) => !values[key] || values[key].trim().length === 0);
  if (missing.length > 0) {
    log("\nMissing required values: " + missing.join(", "));
    log("Run interactively (plain `node scripts/setup.mjs`) or pass --token.");
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
  const launchPath = launchdPath();
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
    <key>PATH</key>
    <string>${launchPath}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
</dict>
</plist>
`;
  fs.writeFileSync(plistPath, plist, "utf-8");
  log(`LaunchAgent written: ${plistPath}`);
  return loadLaunchAgent(plistPath);
}

function loadLaunchAgent(plistPath) {
  const domain = `gui/${os.userInfo().uid}`;
  const bootstrap = spawnSync("launchctl", ["bootstrap", domain, plistPath], {
    stdio: ["ignore", "inherit", "pipe"],
  });
  if (bootstrap.status === 0) {
    return true;
  }

  const errorText = String(bootstrap.stderr ?? "");
  if (bootstrap.status === 5 || /already|reset/i.test(errorText)) {
    log("LaunchAgent already loaded — skipping duplicate bootstrap.");
    return true;
  }

  if (errorText) {
    process.stderr.write(errorText);
  }
  const legacy = spawnSync("launchctl", ["load", "-w", plistPath], { stdio: "inherit" });
  return legacy.status === 0;
}

function installMacOpenCodeServerAutostart(serverPassword) {
  step("Installing macOS autostart for the OpenCode server (launchd agent)");
  const launchDir = path.join(os.homedir(), "Library", "LaunchAgents");
  fs.mkdirSync(launchDir, { recursive: true });
  const plistPath = path.join(launchDir, "com.opencode-telegram.opencode-server.plist");
  const logPath = path.join(repoRoot, "logs", "opencode-serve.log");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.opencode-telegram.opencode-server</string>
  <key>ProgramArguments</key>
  <array>
    <string>${findOpencodeBinary()}</string>
    <string>serve</string>
    <string>--port</string>
    <string>4096</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${repoRoot}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${os.homedir()}</string>
    <key>OPENCODE_SERVER_PASSWORD</key>
    <string>${serverPassword}</string>
    <key>PATH</key>
    <string>${launchdPath()}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
</dict>
</plist>
`;
  fs.writeFileSync(plistPath, plist, "utf-8");
  log(`LaunchAgent written: ${plistPath}`);
  return loadLaunchAgent(plistPath);
}

function installLinuxOpenCodeServerAutostart(serverPassword) {
  step("Installing Linux autostart for the OpenCode server (systemd user service)");
  const configDir = path.join(os.homedir(), ".config", "systemd", "user");
  fs.mkdirSync(configDir, { recursive: true });
  const unitPath = path.join(configDir, "opencode-telegram-opencode-server.service");
  const escapedPassword = serverPassword.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const unit = `[Unit]
Description=OpenCode Server (for OpenCode Telegram Bot)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${repoRoot}
Environment=HOME=${os.homedir()}
Environment=OPENCODE_SERVER_PASSWORD="${escapedPassword}"
ExecStart=${findOpencodeBinary()} serve --port 4096
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
  fs.writeFileSync(unitPath, unit, "utf-8");
  log(`Unit written: ${unitPath}`);
  const sysctl = spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
  if (sysctl.status !== 0) {
    log("systemctl --user not available; enable it manually:\n  systemctl --user enable --now opencode-telegram-opencode-server");
    return;
  }
  spawnSync("systemctl", ["--user", "enable", "--now", "opencode-telegram-opencode-server.service"], { stdio: "inherit" });
}

function installWindowsOpenCodeServerAutostart(serverPassword) {
  step("Installing Windows logon autostart for the OpenCode server (Startup VBS)");
  const startupDir = path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
  fs.mkdirSync(startupDir, { recursive: true });
  const launcherPath = path.join(startupDir, "opencode-telegram-server-start.vbs");
  const logsDir = path.join(repoRoot, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, "opencode-serve.log");
  const opencodeCmd = ["opencode.cmd", "opencode"].find((candidate) => {
    return spawnSync("where", [candidate], { stdio: "pipe" }).status === 0;
  });
  const vbs = `Option Explicit
Dim shell, env, wmi, col
Set wmi = GetObject("winmgmts:\\\\.\\root\\cimv2")
Set col = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name='opencode.exe' AND CommandLine LIKE '%serve%'")
If col.Count = 0 Then
    WScript.Sleep 30000
    Set col = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name='opencode.exe' AND CommandLine LIKE '%serve%'")
    If col.Count = 0 Then
        Set shell = CreateObject("WScript.Shell")
        shell.CurrentDirectory = "${repoRoot}"
        Set env = shell.Environment("Process")
        env("OPENCODE_SERVER_PASSWORD") = "${serverPassword}"
        env("HOME") = "${os.homedir()}"
        shell.Run "cmd /c ""${opencodeCmd}"" serve >> ""${logFile}"" 2>&1", 0, False
    End If
End If
`;
  fs.writeFileSync(launcherPath, vbs, "utf-8");
  log(`Autostart launcher written: ${launcherPath}`);
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

function opencodeBinCandidates() {
  if (IS_WINDOWS) {
    return [];
  }
  return [
    path.join(os.homedir(), ".opencode", "bin", "opencode"),
    path.join(os.homedir(), "bin", "opencode"),
    path.join(os.homedir(), ".local", "bin", "opencode"),
    "/opt/homebrew/bin/opencode",
    "/usr/local/bin/opencode",
  ];
}

function findOpencodeBinary() {
  const candidate = opencodeBinCandidates().find((p) => fs.existsSync(p));
  if (candidate) {
    return candidate;
  }
  return "opencode";
}

function launchdPath() {
  return [
    ...opencodeBinCandidates().filter((p) => p),
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].join(":");
}

function randomSecret() {
  return randomBytes(18).toString("hex");
}

function stopRunningOpenCodeServers() {
  if (IS_WINDOWS) {
    spawnSync("taskkill", ["/F", "/IM", "opencode.exe"], { stdio: "ignore" });
  } else {
    spawnSync("pkill", ["-f", "opencode serve"], { stdio: "ignore" });
  }
}

function opencodeOnPath() {
  if (IS_WINDOWS) {
    return spawnSync("where", ["opencode"], { stdio: "pipe" }).status === 0;
  }
  if (spawnSync("bash", ["-lc", "command -v opencode"], { stdio: "pipe" }).status === 0) {
    return true;
  }
  return opencodeBinCandidates().some((candidate) => fs.existsSync(candidate));
}

function runBestEffort(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: IS_WINDOWS });
  if (result.status !== 0) {
    log(`WARN: command failed (exit ${result.status ?? "null"}): ${cmd} ${args.join(" ")}`);
    return false;
  }
  return true;
}

function ensureOpencode(opts) {
  step("Checking OpenCode CLI");
  if (opencodeOnPath()) {
    log("OpenCode is already installed.");
    return;
  }

  if (opts?.disabled) {
    log("OpenCode not found and --no-opencode was passed — skipping install.");
    return;
  }

  log("OpenCode not found. Installing natively (single binary, full permissions)...");
  if (IS_WINDOWS) {
    runBestEffort("npm.cmd", ["install", "-g", "opencode-ai@latest"]);
  } else {
    const installScript = spawnSync(
      "bash",
      ["-lc", "curl -fsSL https://opencode.ai/install | bash"],
      { stdio: "inherit" },
    );
    if (installScript.status !== 0) {
      log("Official installer failed; falling back to npm global install.");
      runBestEffort("npm", ["install", "-g", "opencode-ai@latest"]);
    }
  }

  if (opencodeOnPath()) {
    log("OpenCode installed successfully.");
  } else {
    log(
      "WARN: OpenCode is installed but not on the current PATH yet.\n" +
        "      Open a new shell and run `opencode serve`, or re-run the bootstrap.",
    );
  }
}

function managementSummary() {
  if (process.platform === "win32") {
    return `Windows:
  node dist/cli.js status           # service status (PID, uptime, log)
  node dist/cli.js stop             # stop the background daemon
  npm run autostart:uninstall       # remove the bot logon autostart launcher
  OpenCode server: startup VBS (opencode-telegram-server-start.vbs), logs at logs\\opencode-serve.log`;
  }
  if (process.platform === "linux") {
    return `Linux (systemd user services):
  systemctl --user status opencode-telegram-group-topics-bot
  systemctl --user restart opencode-telegram-group-topics-bot
  systemctl --user disable --now opencode-telegram-group-topics-bot   # stop + disable bot autostart
  systemctl --user status opencode-telegram-opencode-server           # OpenCode server`;
  }
  return `macOS (launchd agents):
  launchctl print gui/$(id -u)/com.opencode-telegram.group-topics-bot
  launchctl kickstart -k gui/$(id -u)/com.opencode-telegram.group-topics-bot
  launchctl print gui/$(id -u)/com.opencode-telegram.opencode-server   # OpenCode server
  launchctl kickstart -k gui/$(id -u)/com.opencode-telegram.opencode-server
  launchctl bootout gui/$(id -u)/com.opencode-telegram.group-topics-bot  # stop + remove bot agent
  launchctl bootout gui/$(id -u)/com.opencode-telegram.opencode-server   # stop + remove server agent`;
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

  if (!dry) {
    ensureOpencode({ disabled: Boolean(flags["--no-opencode"]) });
  }

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
    if (!values.OPENCODE_SERVER_PASSWORD) {
      log("  OPENCODE_SERVER_PASSWORD=<generated>");
    }
    log("Would also install logon autostart for the bot and the OpenCode server.");
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
    if (!values.OPENCODE_SERVER_PASSWORD) {
      values.OPENCODE_SERVER_PASSWORD = randomSecret();
      log("Generated a random OpenCode server password (stored in .env).");
    }
    writeEnvFile({ ...envFile, values });
  }

  const installServerAutostart = !flags["--no-autostart"] && !flags["--no-opencode"];
  let macServerLoaded = false;
  if (!dry && installServerAutostart && values.OPENCODE_SERVER_PASSWORD && !IS_WINDOWS) {
    stopRunningOpenCodeServers();
  }

  let macAgentLoaded = false;
  if (!dry && !flags["--no-autostart"]) {
    if (IS_WINDOWS) {
      installWindowsAutostart();
    } else if (process.platform === "linux") {
      installLinuxAutostart(process.execPath);
    } else if (process.platform === "darwin") {
      macAgentLoaded = installMacAutostart(process.execPath);
    } else {
      log(`Autostart not implemented for platform ${process.platform}; run the bot manually.`);
    }
  }

  if (!dry && installServerAutostart && values.OPENCODE_SERVER_PASSWORD) {
    if (IS_WINDOWS) {
      installWindowsOpenCodeServerAutostart(values.OPENCODE_SERVER_PASSWORD);
    } else if (process.platform === "linux") {
      installLinuxOpenCodeServerAutostart(values.OPENCODE_SERVER_PASSWORD);
    } else if (process.platform === "darwin") {
      macServerLoaded = installMacOpenCodeServerAutostart(values.OPENCODE_SERVER_PASSWORD);
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
      if (!macAgentLoaded) {
        macAgentLoaded = loadLaunchAgent(plistPath);
      } else {
        log("LaunchAgent already running — nothing to do.");
      }
      if (macAgentLoaded) {
        spawnSync("launchctl", ["kickstart", `gui/${os.userInfo().uid}/com.opencode-telegram.group-topics-bot`], { stdio: "inherit" });
      }
    }
  }

  if (!dry && !flags["--no-start"] && installServerAutostart && values.OPENCODE_SERVER_PASSWORD) {
    if (process.platform === "linux") {
      spawnSync("systemctl", ["--user", "start", "opencode-telegram-opencode-server.service"], { stdio: "inherit" });
    } else if (process.platform === "darwin") {
      step("Starting the OpenCode server via LaunchAgent");
      const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", "com.opencode-telegram.opencode-server.plist");
      if (!macServerLoaded) {
        macServerLoaded = loadLaunchAgent(plistPath);
      } else {
        log("LaunchAgent already running — nothing to do.");
      }
      if (macServerLoaded) {
        spawnSync("launchctl", ["kickstart", `gui/${os.userInfo().uid}/com.opencode-telegram.opencode-server`], { stdio: "inherit" });
      }
    }
  }

  step("Done");
  log(managementSummary());
}

main().catch((error) => {
  process.stderr.write(`\nSetup failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});