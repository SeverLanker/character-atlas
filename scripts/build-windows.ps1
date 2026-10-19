param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
function Require-Tool([string]$Name,[string]$HelpText) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw $HelpText }
}
Require-Tool 'node' 'Please install Node.js 22 LTS or newer: https://nodejs.org/'
Require-Tool 'npm' 'npm is required (included in Node.js).'
Require-Tool 'cargo' 'Please install Rust stable with the MSVC toolchain: https://rustup.rs/'
$NodeMajor = [int]((& node -p 'process.versions.node.split(".")[0]') | Select-Object -Last 1)
if ($NodeMajor -lt 22) { throw 'Node.js 22 or newer is required.' }
Write-Host 'Prerequisite: Visual Studio Build Tools with Desktop development with C++.' -ForegroundColor Yellow
Write-Host 'Installing frontend dependencies...' -ForegroundColor Cyan
if (Test-Path 'package-lock.json') { & npm.cmd ci --no-audit --no-fund } else { & npm.cmd install --no-audit --no-fund }
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
if (-not $SkipTests) {
  & npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw 'Domain tests failed.' }
  & npm.cmd run test:storage
  if ($LASTEXITCODE -ne 0) { throw 'Storage and interaction tests failed.' }
}
Write-Host 'Building Windows installer...' -ForegroundColor Cyan
& npm.cmd run desktop:build
if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed. Check Rust/MSVC/WebView2 prerequisites.' }
if (-not $SkipTests) {
  & cargo test --manifest-path src-tauri/Cargo.toml --release --locked --lib
  if ($LASTEXITCODE -ne 0) { throw 'Native storage checks failed.' }
}
$Bundle = Join-Path (Get-Location) 'src-tauri\target\release\bundle\nsis'
Write-Host "Installer output: $Bundle" -ForegroundColor Green
if (Test-Path $Bundle) { Invoke-Item $Bundle }
