#Requires -Version 5.1
<#
.SYNOPSIS
  Installs (or removes) a Windows autostart entry for the OpenCode Telegram bot.

.DESCRIPTION
  Creates a small VBS launcher in the user's Startup folder that:
    - waits 30 seconds after logon,
    - verifies the bot is not already running (WMI scan on dist/cli.js or dist/index.js),
    - launches the native hidden daemon: `node dist\cli.js start --daemon`
      (spawned with windowsHide + detached), redirecting CLI output
      to <repo>\logs\bot-autostart.log. The daemon writes its own
      <repo>\logs\bot-service-<timestamp>.log and keeps its state in
      <repo>\run\bot-service.json.

  The launcher pins OPENCODE_TELEGRAM_HOME to the repo root so the daemon reads
  the repo .env/settings even in "installed" mode, and drops any ambient
  OPENCODE_SERVER_PASSWORD so the value from the repo .env is authoritative.

  This follows the same pattern used by other per-user background services
  (e.g. the OpenCode server via start-server-check.vbs). No admin rights needed.

.PARAMETER Uninstall
  Removes the autostart launcher previously created by this script.

.PARAMETER StartNow
  Also starts the bot immediately in the background after installing.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-windows-autostart.ps1

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-windows-autostart.ps1 -StartNow

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-windows-autostart.ps1 -Uninstall
#>
[CmdletBinding()]
param(
  [switch]$Uninstall,
  [switch]$StartNow
)
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$distCli = Join-Path $repoRoot "dist\cli.js"
if (-not (Test-Path -LiteralPath $distCli)) {
  throw "Built CLI not found: $distCli. Run 'npm run build' first."
}

$startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$launcherName = "opencode-telegram-bot-start.vbs"
$launcherPath = Join-Path $startupDir $launcherName

if ($Uninstall) {
  if (Test-Path -LiteralPath $launcherPath) {
    Remove-Item -LiteralPath $launcherPath -Force
    Write-Host "Removed autostart launcher: $launcherPath"
  } else {
    Write-Host "No autostart launcher found (nothing to remove)."
  }
  return
}

# Resolve the Node.js runtime used to launch the bot.
$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) {
  $hermesNode = Join-Path $env:LOCALAPPDATA "hermes\node\node.exe"
  if (Test-Path -LiteralPath $hermesNode) {
    $nodeExe = $hermesNode
  }
}
if (-not $nodeExe) {
  throw "Node.js not found. Install Node.js 20+ and make sure it is on PATH."
}

$logsDir = Join-Path $repoRoot "logs"
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
$logFile = Join-Path $logsDir "bot-autostart.log"

$vbs = @"
Option Explicit
Dim shell, env, wmi, col
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
Set col = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name='node.exe' AND (CommandLine LIKE '%cli.js%' OR CommandLine LIKE '%index.js%')")
If col.Count = 0 Then
    WScript.Sleep 30000
    Set col = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name='node.exe' AND (CommandLine LIKE '%cli.js%' OR CommandLine LIKE '%index.js%')")
    If col.Count = 0 Then
        Set shell = CreateObject("WScript.Shell")
        shell.CurrentDirectory = "__REPO_ROOT__"
        Set env = shell.Environment("Process")
        env("OPENCODE_TELEGRAM_HOME") = "__REPO_ROOT__"
        env.Remove "OPENCODE_SERVER_PASSWORD"
        shell.Run "cmd /c ""__NODE_EXE__"" dist\cli.js start --daemon >> ""__LOG_FILE__"" 2>&1", 0, False
    End If
End If
"@
$vbs = $vbs.Replace("__REPO_ROOT__", $repoRoot).Replace("__NODE_EXE__", $nodeExe).Replace("__LOG_FILE__", $logFile)

Set-Content -LiteralPath $launcherPath -Value $vbs -Encoding ASCII
Write-Host "Installed autostart launcher: $launcherPath"
Write-Host "  - waits 30s after logon and skips the start if the bot is already running"
Write-Host "  - starts the native hidden daemon (node dist\cli.js start --daemon)"
Write-Host "  - daemon logs to: <repo>\logs\bot-service-<timestamp>.log"

if ($StartNow) {
  Write-Host "Starting the bot now in the background..."
  $env:OPENCODE_TELEGRAM_HOME = $repoRoot
  Remove-Item Env:OPENCODE_SERVER_PASSWORD -ErrorAction SilentlyContinue
  $inner = 'cd /d "{0}" && ""{1}"" dist\cli.js start --daemon >> "{2}" 2>&1' -f $repoRoot, $nodeExe, $logFile
  $cmdLine = 'cmd /c "' + $inner + '"'
  $res = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmdLine }
  Write-Host "Start result: $($res.ReturnValue) PID=$($res.ProcessId)"
}