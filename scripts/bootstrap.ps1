#Requires -Version 5.1
<#
.SYNOPSIS
  One-shot deploy for the OpenCode Telegram Group Topics Bot on Windows.
  Native install, no Docker, no containers: installs Node.js 20+ (winget),
  fetches this repo and runs the universal setup (wizard or flags).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap.ps1

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap.ps1 --token 123:ABC --user-id 123456
#>
[CmdletBinding()]
param(
  [string]$RepoUrl = "https://github.com/soyjuliyt/opencode-agents-telegram.git",
  [string]$ZipUrl = "https://codeload.github.com/soyjuliyt/opencode-agents-telegram/zip/refs/heads/main",
  [string]$InstallDir = (Join-Path $HOME "opencode-telegram-group-topics-bot"),
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$SetupArgs
)
$ErrorActionPreference = "Stop"

function Test-Node20 {
  param([string]$NodeExe)
  try {
    $versionOutput = (& $NodeExe -v 2>$null)
    if ($versionOutput -match "\d+\.\d+\.\d+") {
      $first = [int]($Matches[0].Split(".")[0])
      return $first -ge 20
    }
  } catch { }
  return $false
}

function Resolve-NodeExe {
  $candidate = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if ($candidate -and (Test-Node20 $candidate)) { return $candidate }
  $programFilesNode = Join-Path $env:ProgramFiles "nodejs\node.exe"
  if (Test-Path -LiteralPath $programFilesNode) {
    $env:Path = (Join-Path $env:ProgramFiles "nodejs") + ";" + $env:Path
    if (Test-Node20 $programFilesNode) { return $programFilesNode }
  }
  $hermesNode = Join-Path $env:LOCALAPPDATA "hermes\node\node.exe"
  if (Test-Path -LiteralPath $hermesNode) {
    $env:Path = (Join-Path $env:LOCALAPPDATA "hermes\node") + ";" + $env:Path
    if (Test-Node20 $hermesNode) { return $hermesNode }
  }
  return $null
}

function Install-NodeViaWinget {
  Write-Host "Node.js 20+ not found. Installing via winget (native install)..."
  winget install -e --id OpenJS.NodeJS.LTS --silent `
    --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "winget failed to install Node.js. Install it manually from https://nodejs.org and re-run this script."
  }
}

function Resolve-Node {
  $nodeExe = Resolve-NodeExe
  if ($nodeExe) { return $nodeExe }
  Install-NodeViaWinget
  $nodeExe = Resolve-NodeExe
  if (-not $nodeExe) {
    throw "Node.js 20+ still not found after install. Open a new console and re-run this script."
  }
  return $nodeExe
}

function Resolve-Repository {
  if (Test-Path -LiteralPath (Join-Path $InstallDir "package.json")) {
    Write-Host "Repo already present: $InstallDir"
    return
  }
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  $git = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($git) {
    Write-Host "Cloning $RepoUrl ..."
    & $git.Source clone --depth 1 $RepoUrl $InstallDir
    if ($LASTEXITCODE -ne 0) {
      throw "git clone failed."
    }
    return
  }
  Write-Host "git not found; downloading the repo archive instead."
  $zipPath = Join-Path $env:TEMP "opencode-telegram-group-topics-bot.zip"
  Invoke-WebRequest -Uri $ZipUrl -OutFile $zipPath -UseBasicParsing
  Expand-Archive -LiteralPath $zipPath -DestinationPath $env:TEMP -Force
  $extracted = Get-ChildItem -LiteralPath (Join-Path $env:TEMP "opencode-agents-telegram-main") -ErrorAction SilentlyContinue
  if (-not $extracted) {
    $extracted = Get-ChildItem $env:TEMP -Directory | Where-Object { $_.Name -like "opencode-agents-telegram*" } | Select-Object -First 1
  }
  Copy-Item -Path (Join-Path $extracted.FullName "*") -Destination $InstallDir -Recurse -Force
}

function Ensure-OpenCode {
  param([string]$NodeExe)
  Write-Host "Checking OpenCode CLI..."
  if (Get-Command opencode -ErrorAction SilentlyContinue) {
    Write-Host "OpenCode already installed."
    return
  }
  Write-Host "OpenCode not found. Installing via npm (native, full permissions)..."
  $nodeDir = Split-Path $NodeExe
  $npmCommand = Join-Path $nodeDir "npm.cmd"
  if (-not (Test-Path -LiteralPath $npmCommand)) {
    $npmCommand = "npm"
  }
  & $npmCommand install -g opencode-ai@latest
  if ($LASTEXITCODE -ne 0) {
    Write-Host "WARN: npm failed to install opencode-ai. Install it manually with: npm i -g opencode-ai" -ForegroundColor Yellow
  }
}

$nodeExe = Resolve-Node
Write-Host "Using Node: $nodeExe"
Ensure-OpenCode -NodeExe $nodeExe
Resolve-Repository

$setupScript = Join-Path $InstallDir "scripts\setup.mjs"
if (-not (Test-Path -LiteralPath $setupScript)) {
  throw "setup.mjs not found in $InstallDir"
}

Write-Host "Running universal setup..."
& $nodeExe $setupScript @SetupArgs
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}